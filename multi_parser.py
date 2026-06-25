from utils import write_yaml, generate_pbx_password, sync_pbx_defaults
from asterisk_gen import generate_pjsip, generate_extensions
import socket
import yaml


class IndentedDumper(yaml.Dumper):
    def increase_indent(self, flow=False, indentless=False):
        return super().increase_indent(flow, False)


def blank_representer(dumper, data):
    return dumper.represent_scalar('tag:yaml.org,2002:null', '')


def provision_multi(master):
    sync_pbx_defaults('/app/pbx_defaults', '/etc/asterisk')

    users = [{**u, 'pbx_username': f"user{i+1}", 'pbx_password': generate_pbx_password()}
             for i, u in enumerate(master['onedoor']['users'])]

    sip_idx = 0
    generic_idx = 0
    none_idx = 0

    all_doors = []
    sip_doors = []
    generic_doors = []

    for i, d in enumerate(master['moredoors']):
        mode = d.get('call_mode', 'sip')
        door_data = {
            'id': d['id'],
            'index': i,
            'call_mode': mode,
            'video_fit': d.get('video_fit', 'dynamic'),
            'camera': d.get('camera'),
            'actions': d.get('actions', []),
        }

        if mode == 'sip':
            door_data['dial_extension'] = 700 + (sip_idx * 2)
            door_data['webrtc_extension'] = 800 + (sip_idx * 2)
            door_data['sip_username'] = 105 + sip_idx
            # SIP doors do NOT need a go2rtc SIP consumer port — audio comes via WebRTC video channel
            sip_idx += 1
            sip_doors.append(door_data)
        elif mode == 'generic':
            door_data['dial_extension'] = 500 + (generic_idx * 2)
            door_data['webrtc_extension'] = 600 + (generic_idx * 2)
            # Only generic doors get a go2rtc SIP consumer port (Asterisk dials 127.0.0.1:{port})
            door_data['sip_port'] = 5070 + generic_idx
            generic_idx += 1
            generic_doors.append(door_data)
        else:
            door_data['dial_extension'] = 900 + (none_idx * 2)
            door_data['webrtc_extension'] = None
            none_idx += 1

        all_doors.append(door_data)

    onedoor_out = {
        'global': {
            'domain': master['domain'],
            'users': users,
            'notifications': master['onedoor']['notifications'],
            'server': {'listen_port': 8099, 'token_expiry_days': master['onedoor'].get('token_expiry_days', 30)}
        },
        'doors': [{
            'id': d['id'],
            'webrtc_name': f"camera{d['index']+1}",
            'call_mode': d['call_mode'],
            'video_fit': d['video_fit'],
            'dial_extension': d['dial_extension'],
            'webrtc_extension': d.get('webrtc_extension'),
            'sip_port': d.get('sip_port'),
            'sip_username': d.get('sip_username'),
            'actions': d['actions']
        } for d in all_doors]
    }
    write_yaml('/app/onedoor.yaml', onedoor_out)

    streams = {
        f"camera{d['index']+1}": (d['camera'] if isinstance(d['camera'], list) else [d['camera']])
        for d in all_doors
    }
    preloads = {cam_name: None for cam_name in streams.keys()}

    g_config = {
        'streams': streams,
        'preload': preloads,
        'webrtc': {'listen': ':8557', 'candidates': [f"{master['domain']}:8557"], 'ice_lite': False},
        'exec': {'allow_paths': ['ffmpeg']},
        'echo': {'allow_paths': []}
    }

    # Configure go2rtc SIP consumer for generic doors
    # Each generic door gets a unique SIP port; go2rtc auto-answers and bridges to the stream
    # Newer format: sip is a dict with consumers list (combo branch+)
    sip_consumers = []
    for d in all_doors:
        if d['call_mode'] == 'generic':
            stream_name = f"camera{d['index']+1}"
            port = d.get('sip_port', 5070 + len([x for x in all_doors[:d['index']] if x['call_mode'] == 'generic']))
            sip_consumers.append({'port': port, 'stream': stream_name})
    if sip_consumers:
        g_config['sip'] = {'consumers': sip_consumers}

    IndentedDumper.add_representer(type(None), blank_representer)

    with open('/config/go2rtc.yaml', 'w') as f:
        yaml.dump(g_config, f, Dumper=IndentedDumper, default_flow_style=False, indent=2, sort_keys=False)

    try:
        public_ip = socket.gethostbyname(master['domain'])
    except Exception:
        public_ip = master['domain']

    generate_pjsip(users, master['domain'], master.get('docker_host'), public_ip, all_doors, sip_doors)
    generate_extensions(sip_doors, generic_doors)

    print(f"Multi-door provisioning complete: {len(sip_doors)} SIP, {len(generic_doors)} generic.", flush=True)

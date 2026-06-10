from utils import write_yaml, generate_pbx_password, sync_pbx_defaults
from asterisk_gen import generate_pjsip
import socket
import yaml

class IndentedDumper(yaml.Dumper):
    def increase_indent(self, flow=False, indentless=False):
        return super().increase_indent(flow, False)

# Custom representer to turn None into a completely blank value instead of 'null'
def blank_representer(dumper, data):
    return dumper.represent_scalar('tag:yaml.org,2002:null', '')

def provision_multi(master):
    sync_pbx_defaults('/app/pbx_defaults', '/etc/asterisk')

    users = [{**u, 'pbx_username': f"user{i+1}", 'pbx_password': generate_pbx_password()}
             for i, u in enumerate(master['onedoor']['users'])]

    onedoor_out = {
        'global': {
            'domain': master['domain'],
            'users': users,
            'notifications': master['onedoor']['notifications'],
            'server': {'listen_port': 8099, 'token_expiry_days': master['onedoor'].get('token_expiry_days', 30)}
        },
        'doors': [{
            'id': d['id'],
            'webrtc_name': f"camera{i+1}",
            'call_mode': d.get('call_mode', 'sip'),
            'dial_extension': 700 + (i*2),
            'webrtc_extension': 800 + (i*2),
            'actions': d.get('actions', [])
        } for i, d in enumerate(master['moredoors'])]
    }
    write_yaml('/app/onedoor.yaml', onedoor_out)

    # Clean map: Pass user-defined camera inputs directly to streams
    streams = {
        f"camera{i+1}": (d.get('camera') if isinstance(d.get('camera'), list) else [d.get('camera')])
        for i, d in enumerate(master['moredoors'])
    }

    # Setting value to None will now output as blank thanks to the representer
    preloads = {cam_name: None for cam_name in streams.keys()}

    g_config = {
        'streams': streams,
        'preload': preloads,
        'webrtc': {'listen': ':8557', 'candidates': [f"{master['domain']}:8557"], 'ice_lite': False},
        'rtsp': {'backchannel': True},
        'exec': {'allow_paths': ['ffmpeg']},
        'echo': {'allow_paths': []}
    }

    # Bind the custom representer directly to our custom Dumper instance
    IndentedDumper.add_representer(type(None), blank_representer)

    with open('/config/go2rtc.yaml', 'w') as f:
        yaml.dump(g_config, f, Dumper=IndentedDumper, default_flow_style=False, indent=2, sort_keys=False)

    try: public_ip = socket.gethostbyname(master['domain'])
    except Exception: public_ip = master['domain']
    doors = [{
        'id': d['id'],
        'dial_extension': 700 + (i*2),
    } for i, d in enumerate(master['moredoors'])]
    generate_pjsip(users, master['domain'], master.get('docker_host'), public_ip, doors)
    print("🚀 Multi-door provisioning complete (Direct Config).", flush=True)

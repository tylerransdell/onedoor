from utils import load_yaml, write_yaml, sync_pbx_defaults, generate_pbx_password
from asterisk_gen import generate_pjsip
import socket
import yaml

class IndentedDumper(yaml.Dumper):
    def increase_indent(self, flow=False, indentless=False):
        return super().increase_indent(flow, False)

# Custom representer to turn None into a completely blank value instead of 'null'
def blank_representer(dumper, data):
    return dumper.represent_scalar('tag:yaml.org,2002:null', '')

def run_legacy():
    sync_pbx_defaults('/app/pbx_defaults', '/etc/asterisk')
    master = load_yaml('/app/config.yaml')

    old_onedoor = master.get('onedoor', {})
    domain = master.get('domain')
    docker_host = master.get('docker_host')

    users = [{**u, 'pbx_username': f"user{i+1}", 'pbx_password': generate_pbx_password()}
             for i, u in enumerate(old_onedoor.get('users', []))]

    normalized = {
        'global': {'users': users, 'notifications': old_onedoor.get('notifications', {}), 'server': {'listen_port': 8099, 'token_expiry_days': old_onedoor.get('token_expiry_days') or 30}},
        'doors': [{'id': 'legacy_door', 'webrtc_name': 'camera1', 'call_mode': 'sip', 'dial_extension': 700, 'actions': old_onedoor.get('actions', [])}]
    }
    write_yaml('/app/onedoor.yaml', normalized)

    # Clean map: Pass user-defined camera inputs directly to stream camera1
    cam_raw = master.get('go2rtc', {}).get('camera', [])
    streams = {'camera1': (cam_raw if isinstance(cam_raw, list) else [cam_raw])}

    g_config = {
        'streams': streams,
        'preload': {'camera1': None},
        'webrtc': {'listen': ':8557', 'candidates': [f"{domain}:8557"], 'ice_lite': False},
        'rtsp': {'backchannel': True},
        'exec': {'allow_paths': ['ffmpeg']},
        'echo': {'allow_paths': []}
    }

    # Bind the custom representer directly to our custom Dumper instance
    IndentedDumper.add_representer(type(None), blank_representer)

    with open('/config/go2rtc.yaml', 'w') as f:
        yaml.dump(g_config, f, Dumper=IndentedDumper, default_flow_style=False, indent=2, sort_keys=False)

    try: public_ip = socket.gethostbyname(domain)
    except Exception: public_ip = domain
    generate_pjsip(users, domain, docker_host, public_ip)
    print("✅ Legacy configuration complete (Direct Config).", flush=True)

if __name__ == "__main__":
    run_legacy()

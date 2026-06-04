from utils import load_yaml, write_yaml, sync_pbx_defaults, generate_pbx_password
from asterisk_gen import generate_pjsip
import socket

def run_legacy():
    # 1. Sync Base Files
    sync_pbx_defaults('/app/pbx_defaults', '/etc/asterisk')

    master = load_yaml('/app/config.yaml')
    old_onedoor = master.get('onedoor', {})
    old_go2rtc = master.get('go2rtc', {})
    domain = master.get('domain')
    docker_host = master.get('docker_host')

    # 2. Map legacy users
    # Using generate_pbx_password() to ensure secure, unique credentials 
    # while maintaining compatibility with the rest of the system
    users = [{**u, 'pbx_username': f"user{i+1}", 'pbx_password': generate_pbx_password()}
             for i, u in enumerate(old_onedoor.get('users', []))]

    # 3. Normalize onedoor.yaml
    # Defaulting token_expiry_days to 30 to prevent null values
    normalized = {
        'global': {
            'users': users,
            'notifications': old_onedoor.get('notifications', {}),
            'server': {
                'listen_port': 8099,
                'token_expiry_days': old_onedoor.get('token_expiry_days') or 30
            }
        },
        'doors': [{
            'id': 'legacy_door',
            'webrtc_name': 'camera1',
            'call_mode': 'sip',
            'dial_extension': 700,
            'actions': old_onedoor.get('actions', [])
        }]
    }
    write_yaml('/app/onedoor.yaml', normalized)

    # 4. Write legacy go2rtc.yaml
    g_config = {
        'streams': {'camera1': [old_go2rtc.get('camera')]},
        'webrtc': {'listen': ':8557', 'candidates': [f"{domain}:8557"], 'ice_lite': False},
        'rtsp': {'backchannel': True},
        'exec': {'allow_paths': ['ffmpeg']}
    }
    write_yaml('/config/go2rtc.yaml', g_config)

    # 5. Generate PJSIP
    # Keeping the DNS resolution shortcut for stable NAT traversal
    try:
        public_ip = socket.gethostbyname(domain)
    except Exception:
        public_ip = domain
        
    generate_pjsip(users, domain, docker_host, public_ip)

    print("✅ Legacy configuration, go2rtc, and PJSIP generated.", flush=True)

if __name__ == "__main__":
    run_legacy()

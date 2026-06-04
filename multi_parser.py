from utils import write_yaml, generate_pbx_password, sync_pbx_defaults
from asterisk_gen import generate_pjsip
import socket

def provision_multi(master):
    sync_pbx_defaults('/app/pbx_defaults', '/etc/asterisk')
    
    # Generate users with unique passwords
    users = [{**u, 'pbx_username': f"user{i+1}", 'pbx_password': generate_pbx_password()} 
             for i, u in enumerate(master['onedoor']['users'])]

    # Normalize onedoor.yaml
    onedoor_out = {
        'global': {
            'users': users, 
            'notifications': master['onedoor']['notifications'], 
            'server': {
                'listen_port': 8099, 
                'token_expiry_days': master['onedoor'].get('token_expiry_days', 30)
            }
        },
        'doors': [{
            'id': d['id'], 
            'webrtc_name': f"camera{i+1}", 
            'call_mode': d.get('call_mode', 'sip'), 
            'dial_extension': 700 + (i*2), 
            'actions': d.get('actions', [])
        } for i, d in enumerate(master['moredoors'])]
    }
    write_yaml('/app/onedoor.yaml', onedoor_out)

    # Build streams dictionary with input normalization
    streams = {}
    for i, d in enumerate(master['moredoors']):
        cam_input = d.get('camera')
        # Ensure it's always a list: if string, wrap in []; if already list, keep it
        streams[f"camera{i+1}"] = cam_input if isinstance(cam_input, list) else [cam_input]

    # Write go2rtc.yaml
    g_config = {
        'streams': streams,
        'webrtc': {
            'listen': ':8557', 
            'candidates': [f"{master['domain']}:8557"], 
            'ice_lite': False
        },
        'rtsp': {'backchannel': True},
        'exec': {'allow_paths': ['ffmpeg']}
    }
    write_yaml('/config/go2rtc.yaml', g_config)

    # Generate PJSIP
    try:
        public_ip = socket.gethostbyname(master['domain'])
    except Exception:
        public_ip = master['domain']
        
    generate_pjsip(users, master['domain'], master.get('docker_host'), public_ip)
    
    print("🚀 Multi-door provisioning complete.", flush=True)

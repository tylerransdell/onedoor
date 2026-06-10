import os

ASTERISK_DIR = '/etc/asterisk'

def generate_pjsip(users, domain, docker_host, public_ip, doors=None):
    if doors is None:
        doors = []
    pjsip = f"""; --- AUTO-GENERATED ---
[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060
external_media_address={domain}
external_signaling_address={domain}
local_net=192.168.0.0/16
local_net=10.0.0.0/8
domain={domain}

[transport-ws]
type=transport
protocol=ws
bind=0.0.0.0:8088
external_media_address={domain}
external_signaling_address={domain}
local_net=192.168.0.0/16
local_net=10.0.0.0/8
domain={domain}
"""
    for i, door in enumerate(doors):
        ext = 105 + i
        dial_ext = door.get('dial_extension', 700 + (i * 2))
        ctx = 'intercom-logic' if i == 0 else f'intercom-logic{i+1}'
        pjsip += f"""
; --- AiPhone Station {i+1}: Door {door['id']} | Extension {dial_ext} ---
[{ext}]
type=endpoint
context={ctx}
disallow=all
allow=ulaw,g722
auth={ext}_auth
aors={ext}
rtp_timeout=30
rtp_timeout_hold=30
transport=transport-udp
ice_support=no
force_rport=yes
rewrite_contact=yes
rtp_symmetric=yes
from_domain={domain}
media_address={docker_host}
from_user={dial_ext}
callerid=OneDoor <{dial_ext}>
trust_id_outbound=yes
send_rpid=yes
send_pai=yes

[{ext}_auth]
type=auth
auth_type=userpass
username={ext}
password=one2345door

[{ext}]
type=aor
max_contacts=1
"""
    for u in users:
        pjsip += f"""
; --- WebRTC User: {u['pbx_username']} ---
[{u['pbx_username']}]
type=aor
max_contacts=5
remove_existing=yes

[{u['pbx_username']}-auth]
type=auth
auth_type=userpass
username={u['pbx_username']}
password={u['pbx_password']}
realm=asterisk

[{u['pbx_username']}]
type=endpoint
auth={u['pbx_username']}-auth
aors={u['pbx_username']}
context=webrtc-inbound
rtp_timeout=10
rtp_timeout_hold=30
disallow=all
allow=opus
transport=transport-ws
webrtc=yes
media_encryption=dtls
dtls_verify=no
dtls_setup=actpass
dtls_cert_file={ASTERISK_DIR}/keys/asterisk.crt
dtls_private_key={ASTERISK_DIR}/keys/asterisk.key
dtls_ca_file={ASTERISK_DIR}/keys/ca.crt
dtls_auto_generate_cert=no
ice_support=yes
use_avpf=yes
rtcp_mux=yes
rewrite_contact=yes
rtp_symmetric=yes
force_rport=yes
media_use_received_transport=no
identify_by=username
direct_media=no
from_domain={domain}
contact_user={public_ip}
media_address={public_ip}
"""
    with open(f"{ASTERISK_DIR}/pjsip.conf", "w") as f:
        f.write(pjsip)

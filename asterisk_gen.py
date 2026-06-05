import os

ASTERISK_DIR = '/etc/asterisk'

def generate_pjsip(users, domain, docker_host, public_ip):
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

; --- AIPHONE STATION ---
[105]
type=endpoint
context=intercom-logic
disallow=all
allow=ulaw
auth=105_auth
aors=105
transport=transport-udp
ice_support=no
force_rport=yes
rewrite_contact=yes
rtp_symmetric=yes
from_domain={domain}
media_address={docker_host}
from_user=700
callerid=OneDoor <700>
trust_id_outbound=yes
send_rpid=yes
send_pai=yes

[105_auth]
type=auth
auth_type=userpass
username=105
password=one2345door

[105]
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
context=intercom-logic
disallow=all
allow=opus
auth={u['pbx_username']}-auth
aors={u['pbx_username']}
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

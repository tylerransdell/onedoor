import os

ASTERISK_DIR = '/etc/asterisk'


def generate_pjsip(users, domain, docker_host, public_ip, all_doors=None, sip_doors=None):
    """Generate pjsip.conf for v050 architecture."""
    if all_doors is None:
        all_doors = []
    if sip_doors is None:
        sip_doors = []
    pjsip = "; --- AUTO-GENERATED ---\n"
    pjsip += f"; SIP doors: {len(sip_doors)} | Generic doors: {len([d for d in all_doors if d.get('call_mode') == 'generic'])}\n\n"

    pjsip += "[transport-udp]\n"
    pjsip += "type=transport\n"
    pjsip += "protocol=udp\n"
    pjsip += "bind=0.0.0.0:5060\n\n"

    pjsip += "[transport-ws]\n"
    pjsip += "type=transport\n"
    pjsip += "protocol=ws\n"
    pjsip += "bind=0.0.0.0:8088\n\n"

    # SIP door endpoints (registered intercoms)
    for i, door in enumerate(sip_doors):
        dial_ext = door['dial_extension']
        ctx = f"intercom_logic{i+1}"
        sip_user = door.get('sip_username', 105 + i)
        pjsip += f"\n; --- SIP Door {i+1}: {door['id']} | Extension {dial_ext} | SIP User {sip_user} ---\n"
        pjsip += f"[{sip_user}]\n"
        pjsip += "type=endpoint\n"
        pjsip += f"context={ctx}\n"
        pjsip += "disallow=all\n"
        pjsip += "allow=ulaw,alaw,g722\n"
        pjsip += f"auth={sip_user}_auth\n"
        pjsip += f"aors={sip_user}\n"
        pjsip += "rtp_timeout=10\n"
        pjsip += "rtp_timeout_hold=30\n"
        pjsip += "transport=transport-udp\n"
        pjsip += "ice_support=no\n"
        pjsip += "force_rport=yes\n"
        pjsip += "rewrite_contact=yes\n"
        pjsip += "rtp_symmetric=yes\n"
        pjsip += f"from_domain={domain}\n"
        pjsip += f"media_address={docker_host}\n"
        pjsip += f"from_user={dial_ext}\n"
        pjsip += f"callerid=OneDoor <{dial_ext}>\n"
        pjsip += "trust_id_outbound=yes\n"
        pjsip += "send_rpid=yes\n"
        pjsip += "send_pai=yes\n\n"
        pjsip += f"[{sip_user}_auth]\n"
        pjsip += "type=auth\n"
        pjsip += "auth_type=userpass\n"
        pjsip += f"username={sip_user}\n"
        pjsip += "password=one2345door\n\n"
        pjsip += f"[{sip_user}]\n"
        pjsip += "type=aor\n"
        pjsip += "max_contacts=1\n\n"

    # Generic door gateways (unregistered)
    generic_doors = [d for d in all_doors if d.get('call_mode') == 'generic']
    for i, door in enumerate(generic_doors):
        idx = i + 1
        ctx = f"generic_logic{idx}"
        pjsip += f"\n; --- Generic Gateway {idx}: {door['id']} ---\n"
        pjsip += f"[generic_gw_{idx}]\n"
        pjsip += "type=endpoint\n"
        pjsip += f"context={ctx}\n"
        pjsip += "disallow=all\n"
        pjsip += "allow=ulaw,alaw,g722,opus\n"
        pjsip += "transport=transport-udp\n"
        pjsip += "rtp_timeout=10\n"
        pjsip += "rtp_timeout_hold=30\n"
        pjsip += "direct_media=no\n"
        pjsip += f"aors=generic_gw_{idx}\n\n"
        pjsip += f"[generic_gw_{idx}]\n"
        pjsip += "type=aor\n"
        pjsip += "max_contacts=1\n\n"

    # WebRTC user endpoints (always generated)
    for u in users:
        pjsip += f"\n; --- WebRTC User: {u['pbx_username']} ---\n"
        pjsip += f"[{u['pbx_username']}]\n"
        pjsip += "type=aor\n"
        pjsip += "max_contacts=5\n"
        pjsip += "remove_existing=yes\n\n"
        pjsip += f"[{u['pbx_username']}-auth]\n"
        pjsip += "type=auth\n"
        pjsip += "auth_type=userpass\n"
        pjsip += f"username={u['pbx_username']}\n"
        pjsip += f"password={u['pbx_password']}\n"
        pjsip += "realm=asterisk\n\n"
        pjsip += f"[{u['pbx_username']}]\n"
        pjsip += "type=endpoint\n"
        pjsip += f"auth={u['pbx_username']}-auth\n"
        pjsip += f"aors={u['pbx_username']}\n"
        pjsip += "context=webrtc-inbound\n"
        pjsip += "rtp_timeout=10\n"
        pjsip += "rtp_timeout_hold=30\n"
        pjsip += "disallow=all\n"
        pjsip += "allow=ulaw,alaw,opus\n"
        pjsip += "transport=transport-ws\n"
        pjsip += "webrtc=yes\n"
        pjsip += "media_encryption=dtls\n"
        pjsip += "dtls_verify=no\n"
        pjsip += "dtls_setup=actpass\n"
        pjsip += f"dtls_cert_file={ASTERISK_DIR}/keys/asterisk.crt\n"
        pjsip += f"dtls_private_key={ASTERISK_DIR}/keys/asterisk.key\n"
        pjsip += f"dtls_ca_file={ASTERISK_DIR}/keys/ca.crt\n"
        pjsip += "dtls_auto_generate_cert=no\n"
        pjsip += "ice_support=yes\n"
        pjsip += "use_avpf=yes\n"
        pjsip += "rtcp_mux=yes\n"
        pjsip += "rewrite_contact=yes\n"
        pjsip += "rtp_symmetric=yes\n"
        pjsip += "force_rport=yes\n"
        pjsip += "media_use_received_transport=no\n"
        pjsip += "identify_by=username\n"
        pjsip += "direct_media=no\n"
        pjsip += f"from_domain={domain}\n"
        pjsip += f"contact_user={public_ip}\n"
        pjsip += f"media_address={public_ip}\n\n"

    with open(f"{ASTERISK_DIR}/pjsip.conf", "w") as f:
        f.write(pjsip)


def generate_extensions(sip_doors, generic_doors):
    """Generate extensions.conf for v050 architecture."""
    extensions = "; --- AUTO-GENERATED Extensions ---\n"
    extensions += f"; SIP doors: {len(sip_doors)} | Generic doors: {len(generic_doors)}\n\n"

    for idx, door in enumerate(sip_doors):
        dial_ext = door['dial_extension']
        sip_user = door.get('sip_username', 105 + idx)
        ctx = f"intercom_logic{idx+1}"
        next_ext = dial_ext + 1
        room = f"room_{dial_ext}"
        extensions += f"\n; SIP DOOR {idx+1}: {door['id']} | Extension {dial_ext}\n"
        extensions += f"[{ctx}]\n"
        extensions += f"exten => {dial_ext},1,NoOp(Inbound call to {dial_ext} from endpoint ${{CHANNEL(endpoint)}})\n"
        extensions += f' same => n,GotoIf($["${{CHANNEL(endpoint)}}" = "{sip_user}"]?aiphone-callback)\n'
        extensions += f" same => n,Goto(app-user)\n\n"
        extensions += f"exten => {dial_ext},n(aiphone-callback),NoOp(Door {idx+1} callback -> firing webhook)\n"
        extensions += f" same => n,System(/app/doorbell-webhook.sh {dial_ext})\n"
        extensions += f" same => n,Hangup()\n\n"
        extensions += f"exten => {dial_ext},n(app-user),NoOp(App user calling {dial_ext})\n"
        extensions += f' same => n,Set(CALLERID(all)="OneDoor" <{dial_ext}>)\n'
        extensions += f" same => n,Originate(Local/call_aiphone@{ctx},exten,call_aiphone,{ctx},1)\n"
        extensions += f" same => n,ConfBridge({room},default_bridge,app_user)\n"
        extensions += f" same => n,Hangup()\n\n"
        extensions += f"exten => call_aiphone,1,NoOp(Calling Door {idx+1} ({sip_user}))\n"
        extensions += f' same => n,Set(CALLERID(all)="OneDoor App" <{dial_ext}>)\n'
        extensions += f" same => n,Dial(PJSIP/{sip_user},30,G({ctx}^{next_ext}^1))\n"
        extensions += f" same => n,Hangup()\n\n"
        extensions += f"exten => {next_ext},1,NoOp(Door {idx+1} connected -> joining bridge)\n"
        extensions += f" same => n,Answer()\n"
        extensions += f" same => n,ConfBridge({room},default_bridge,aiphone)\n"
        extensions += f" same => n,Hangup()\n\n"

    # --- Generic door contexts ---
    for idx, door in enumerate(generic_doors):
        dial_ext = door['dial_extension']
        sip_port = door.get('sip_port', 5070 + idx)
        ctx = f"generic_logic{idx+1}"
        room = f"generic_room_{dial_ext}"
        gw_name = f"generic_gw_{idx+1}"
        next_ext = dial_ext + 1
        call_target = f"call_generic_door{idx+1}"
        extensions += f"\n; GENERIC DOOR {idx+1}: {door['id']} | Extension {dial_ext} | SIP Port: {sip_port}\n"
        extensions += f"[{ctx}]\n"
        extensions += f"exten => {dial_ext},1,NoOp(Inbound generic door {idx+1} webhook)\n"
        extensions += f" same => n,System(/app/doorbell-webhook.sh {dial_ext})\n"
        extensions += f" same => n,Hangup()\n\n"
        extensions += f"exten => {next_ext},1,NoOp(App user calling generic door {idx+1})\n"
        extensions += f" same => n,Originate(Local/{call_target}@{ctx},exten,{call_target},{ctx},1)\n"
        extensions += f" same => n,ConfBridge({room},default_bridge,app_user)\n"
        extensions += f" same => n,Hangup()\n\n"
        extensions += f"; Originate target: dial go2rtc\n"
        extensions += f"exten => {call_target},1,NoOp(Calling Generic Door {idx+1} (go2rtc))\n"
        extensions += f' same => n,Set(CALLERID(all)="OneDoor App" <{dial_ext}>)\n'
        extensions += f" same => n,Dial(PJSIP/{gw_name}/sip:127.0.0.1:{sip_port},30,G({ctx}^generic_connected{idx+1}^1))\n"
        extensions += f" same => n,Hangup()\n\n"
        extensions += f"; When go2rtc answers, it jumps here and joins the bridge as aiphone\n"
        extensions += f"exten => generic_connected{idx+1},1,NoOp(Generic door {idx+1} connected -> joining bridge as aiphone)\n"
        extensions += f" same => n,Answer()\n"
        extensions += f" same => n,ConfBridge({room},default_bridge,aiphone)\n"
        extensions += f" same => n,Hangup()\n\n"

    # --- WebRTC inbound context ---
    webrtc_sip_doors = [d for d in sip_doors if d.get('webrtc_extension')]
    webrtc_generic_doors = [d for d in generic_doors if d.get('webrtc_extension')]
    if webrtc_sip_doors or webrtc_generic_doors:
        extensions += "\n; WEBRTC USER EXTENSIONS\n"
        extensions += "[webrtc-inbound]\n"
        for idx, door in enumerate(sip_doors):
            webrtc_ext = door.get('webrtc_extension')
            if not webrtc_ext:
                continue
            dial_ext = door['dial_extension']
            room = f"room_{dial_ext}"
            ctx = f"intercom_logic{idx+1}"
            extensions += f"\nexten => {webrtc_ext},1,NoOp(WebRTC user calling SIP door {idx+1})\n"
            extensions += f" same => n,Originate(Local/call_aiphone@{ctx},exten,call_aiphone,{ctx},1)\n"
            extensions += f" same => n,ConfBridge({room},default_bridge,app_user)\n"
            extensions += f" same => n,Hangup()\n"
        for idx, door in enumerate(generic_doors):
            webrtc_ext = door.get('webrtc_extension')
            if not webrtc_ext:
                continue
            dial_ext = door['dial_extension']
            sip_port = door.get('sip_port', 5070 + idx)
            room = f"generic_room_{dial_ext}"
            gw_name = f"generic_gw_{idx+1}"
            g_ctx = f"generic_logic{idx+1}"
            call_target = f"call_generic_door{idx+1}"
            extensions += f"\nexten => {webrtc_ext},1,NoOp(WebRTC user calling generic door {idx+1})\n"
            extensions += f" same => n,Originate(Local/{call_target}@{g_ctx},exten,{call_target},{g_ctx},1)\n"
            extensions += f" same => n,ConfBridge({room},default_bridge,app_user)\n"
            extensions += f" same => n,Hangup()\n"

    with open(f"{ASTERISK_DIR}/extensions.conf", "w") as f:
        f.write(extensions)

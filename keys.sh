#!/bin/bash
KEY_DIR="/etc/asterisk/keys"
mkdir -p $KEY_DIR

if [ ! -f "$KEY_DIR/asterisk.key" ]; then
    echo "🔑 Generating new DTLS keys for Appliance..."
    # Generate CA
    openssl req -new -x509 -days 3650 -nodes -out "$KEY_DIR/ca.crt" -keyout "$KEY_DIR/ca.key" -subj "/CN=OneDoor-CA"
    # Generate Cert & Key
    openssl req -new -nodes -out "$KEY_DIR/asterisk.csr" -keyout "$KEY_DIR/asterisk.key" -subj "/CN=asterisk"
    openssl x509 -req -days 3650 -in "$KEY_DIR/asterisk.csr" -CA "$KEY_DIR/ca.crt" -CAkey "$KEY_DIR/ca.key" -CAcreateserial -out "$KEY_DIR/asterisk.crt"
    
    chmod 644 $KEY_DIR/*
    echo "✅ DTLS Keys created."
else
    echo "✅ Existing DTLS keys found."
fi

import sys, os, subprocess
from utils import load_yaml
from multi_parser import provision_multi
from legacy_parser import run_legacy

if not os.path.exists('/app/config.yaml'):
    print("❌ FATAL: /app/config.yaml not found!", flush=True)
    sys.exit(1)

master = load_yaml('/app/config.yaml')

if 'moredoors' in master:
    print("🚀 Provisioning Multi-Door...", flush=True)
    provision_multi(master)
elif 'go2rtc' in master:
    print("📜 Legacy config detected...", flush=True)
    run_legacy()
else:
    print("❌ Fatal: No valid configuration found.", flush=True)
    sys.exit(1)

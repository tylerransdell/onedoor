import sys, os
from utils import load_yaml
from multi_parser import provision_multi

if not os.path.exists('/app/config.yaml'):
    print("FATAL: /app/config.yaml not found!", flush=True)
    sys.exit(1)

master = load_yaml('/app/config.yaml')

if 'moredoors' not in master:
    print("Fatal: No valid configuration found. Missing 'moredoors' in config.yaml.", flush=True)
    sys.exit(1)

print("Provisioning Multi-Door...", flush=True)
provision_multi(master)

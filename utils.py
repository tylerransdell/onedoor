import yaml, secrets, string, shutil, os

def generate_pbx_password(length=12):
    return ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(length))

def load_yaml(path):
    with open(path, 'r') as f: return yaml.safe_load(f)

def write_yaml(path, data):
    class CustomDumper(yaml.Dumper):
        def increase_indent(self, flow=False, indentless=False): return super().increase_indent(flow, False)
    with open(path, 'w') as f: yaml.dump(data, f, Dumper=CustomDumper, default_flow_style=False, indent=2, sort_keys=False)

def sync_pbx_defaults(src, dest):
    if not os.path.exists(dest): os.makedirs(dest)
    for item in os.listdir(src):
        s, d = os.path.join(src, item), os.path.join(dest, item)
        if os.path.isdir(s):
            if item != 'keys':
                if os.path.exists(d): shutil.rmtree(d)
                shutil.copytree(s, d)
        else: shutil.copy2(s, d)

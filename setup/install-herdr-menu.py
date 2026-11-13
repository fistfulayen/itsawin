#!/usr/bin/env python3
"""Run on the Mac outside the agent sandbox, with Herdr open."""
import json
import os
from pathlib import Path
import subprocess
import sys
from menu_patch import patch_menu, patch_tabs

root = Path(__file__).resolve().parent.parent
home = Path(os.environ.get('HERDR_APP_HOME', str(Path.home() / '.config/herdr-app')))
app = str(Path.home() / '.local/bin/herdr-app')
def run(*args):
    subprocess.run([app, *args], check=True)
def clone(kind, name, target):
    path = home / ('mods' if kind == 'mod' else 'layouts') / (target if kind == 'mod' else target + '.json')
    if not path.exists():
        run('do', kind + '.clone', json.dumps({'name': name, 'as': target}))
    return path

try:
    menu = clone('mod', 'new-menu', 'itsawin-menu')
    tabs = clone('mod', 'tabs', 'itsawin-tabs')
    # Validate both patches before saving either one. Never edit shipped mods.
    menu_source = patch_menu((menu / 'main.js').read_text())
    tabs_source = patch_tabs((tabs / 'main.js').read_text())
    (menu / 'main.js').write_text(menu_source)
    (tabs / 'main.js').write_text(tabs_source)
    run('check', str(menu))
    run('check', str(tabs))
    subprocess.run([sys.executable, str(root / 'setup/install-launcher.py'), '--theme', 'p1', '--host-label', 'Mac'], check=True)
    layout = clone('layout', 'main', 'itsawin-layout')
    data = json.loads(layout.read_text())
    def replace(value):
        if isinstance(value, dict):
            if value.get('mod') == 'tabs':
                value['mod'] = 'itsawin-tabs'
            for child in value.values():
                replace(child)
        elif isinstance(value, list):
            for child in value:
                replace(child)
    replace(data)
    layout.write_text(json.dumps(data, indent=2) + '\n')
    subprocess.run([sys.executable, str(root / 'setup/default-shell.py'), '--plain'], check=True)
    run('do', 'layout.switch', json.dumps({'name': 'itsawin-layout'}))
    run('status')
    print('Installed. In +, Terminal opens a plain shell; itsawin opens WIN. Existing sessions are unchanged.')
except ValueError as e:
    raise SystemExit(str(e))
except subprocess.CalledProcessError as e:
    raise SystemExit(f'Installation stopped (exit {e.returncode}); see the error above.')

#!/usr/bin/env python3
"""Install a stable host-local entry point; preserve the invoking directory."""
import argparse
from pathlib import Path
import shlex
import shutil
import os
import tempfile
p = argparse.ArgumentParser()
p.add_argument('--theme', choices=['p1', 'p3'], required=True)
p.add_argument('--host-label', required=True)
a = p.parse_args()
root = Path(__file__).resolve().parent.parent
node = shutil.which('node')
if not node:
    raise SystemExit('Node.js is missing from PATH')
launcher = Path.home() / '.local/bin/itsawin'
launcher.parent.mkdir(parents=True, exist_ok=True)
command = [node, str(root / 'bin/win.mjs'), '--theme', a.theme, '--host-label', a.host_label]
fd, staged = tempfile.mkstemp(dir=launcher.parent)
try:
    with os.fdopen(fd, 'w') as f:
        f.write('#!/bin/sh\nexec ' + shlex.join(command) + ' "$@"\n')
    os.chmod(staged, 0o755)
    os.replace(staged, launcher)
finally:
    if os.path.exists(staged):
        os.unlink(staged)
print(f'Installed {launcher}')

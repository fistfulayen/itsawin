#!/usr/bin/env python3
"""Install a private WIN release and select p3 on the already-connected VPS."""
import argparse
import shlex
import io
from pathlib import Path
import subprocess
import sys
import tarfile
import time

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('target', help='SSH destination, e.g. user@server or an SSH config alias')
parser.add_argument('--theme', choices=['p1', 'p3'], default='p3')
parser.add_argument('--host-label', default='VPS')
args = parser.parse_args()
target = args.target
if target.startswith('-') or any(c.isspace() for c in target):
    parser.error('target must be an SSH host or user@host, not an option')
release = 'release-' + str(time.time_ns())
# Explicit allowlist: never copy local credentials, configurations or dependencies.
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode='w:gz') as archive:
    for name in ['bin', 'src', 'test', 'setup/prepare-pty.mjs',
                 'setup/default-shell.py', 'setup/install-launcher.py', 'package.json', 'package-lock.json',
                 'tty.mjs', 'README.md', 'LICENSE', 'NOTICE']:
        archive.add(root / name, arcname=name, filter=lambda info: None if '__pycache__' in info.name or info.name.endswith('.pyc') else info)

command = r'''
set -eu
stage='finding prerequisites'
trap 'code=$?; if [ "$code" -ne 0 ]; then echo "WIN install failed while $stage (exit $code). Herdr defaults have not been changed unless the final configuration step ran." >&2; fi' EXIT
export PATH="$HOME/.local/bin:$HOME/.volta/bin:$HOME/.local/share/fnm/aliases/default/bin:/usr/local/bin:$PATH"
# SSH commands do not normally load the interactive shell's Node manager.
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        # Version-manager startup scripts are not necessarily nounset-safe.
        set +u
        . "$NVM_DIR/nvm.sh" </dev/null
        set -u
    fi
fi
for program in node npm hc python3 tar; do
    if ! command -v "$program" >/dev/null 2>&1; then
        echo "Missing prerequisite: $program is not available in the VPS SSH environment." >&2
        echo "On the VPS, install/enable Node.js 20+ with npm, Python 3.11+, and hc, then retry." >&2
        exit 1
    fi
    echo "$program: $(command -v "$program")"
done
stage='checking Node and Python versions'
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) throw Error("Node.js 20+ required")'
python3 -c 'import tomllib' || { echo 'Python 3.11+ required'; exit 1; }
stage='unpacking the release'
mkdir -p "$HOME/code/itsawin/releases/RELEASE"
cd "$HOME/code/itsawin/releases/RELEASE"
tar -xzf -
stage='checking native build tools'
for program in make c++; do
    if ! command -v "$program" >/dev/null 2>&1; then
        echo "Missing native build tool: $program. On an Ubuntu/Debian VPS, run: sudo apt-get install build-essential" >&2
        exit 1
    fi
done
stage='installing dependencies'
npm ci --foreground-scripts
node setup/prepare-pty.mjs
stage='loading the native terminal module'
node -e 'require("node-pty"); console.log("Native terminal module loaded")'
stage='running terminal tests'
npm test
stage='configuring the VPS default shell'
python3 setup/install-launcher.py --theme THEME --host-label HOST_LABEL
python3 setup/default-shell.py --plain
'''.replace('RELEASE', release).replace('THEME', shlex.quote(args.theme)).replace('HOST_LABEL', shlex.quote(args.host_label))
print(f'Installing private WIN release on {target}. Existing terminals stay running.', flush=True)
result = subprocess.run(['ssh', target, command], input=buffer.getvalue())
if result.returncode:
    print('VPS installation did not complete. See the diagnostic above; fix it and rerun this command.', file=sys.stderr)
    sys.exit(result.returncode if result.returncode > 0 else 1)
print('Ready: choose itsawin in the customized Herdr + menu for amber WIN. Terminal opens a plain shell.')

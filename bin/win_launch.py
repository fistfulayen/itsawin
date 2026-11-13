"""Shared Herdr request builder for the Claude and Codex entry points.

Keep commands as argv arrays: project paths and IDs never become shell source.
Remote paths are resolved by WIN on the target host, not by this client.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import uuid


def main(agent):
    p = argparse.ArgumentParser(description=f'Open a resumed {agent} conversation inside WIN through Herdr.')
    p.add_argument('--session', required=True, help=f'{agent} conversation UUID')
    p.add_argument('--directory', required=True, help='Project folder on the target host (absolute or ~/...)')
    g = p.add_mutually_exclusive_group()
    g.add_argument('--machine', default='', help='Herdr machine name, e.g. vps; omitted means this Mac')
    g.add_argument('--space', help='Existing Herdr space ID, including its machine prefix for VPS spaces')
    p.add_argument('--name', default=f'{agent.title()} · WIN')
    if agent == 'claude':
        p.add_argument('--chrome', action=argparse.BooleanOptionalAction, default=True, help='Preserve Chrome integration (default: enabled)')
    p.add_argument('--dry-run', action='store_true')
    a = p.parse_args()
    try:
        session = str(uuid.UUID(a.session))
    except ValueError:
        p.error('--session must be a conversation UUID')
    if not (a.directory.startswith('/') or a.directory == '~' or a.directory.startswith('~/')):
        p.error('--directory must be absolute or start with ~/ on the target host')
    root = Path(__file__).resolve().parent.parent
    remote = bool(a.machine or (a.space and '/' in a.space))
    if remote:
        argv = ['/bin/sh', '-c', 'exec "$HOME/.local/bin/itsawin" "$@"', 'itsawin']
    else:
        node = shutil.which('node')
        if not node:
            p.error('Node.js is not on PATH')
        argv = [node, str(root / 'bin/win.mjs'), '--theme', 'p1', '--host-label', 'Mac']
    argv += [f'--{agent}-resume', session, '--cwd', a.directory]
    if agent == 'claude':
        argv += ['--chrome' if a.chrome else '--no-chrome']
    if a.space:
        command, payload = 'tab.new', {'space': a.space, 'name': a.name, 'argv': argv}
    else:
        command, payload = 'space.new', {'machine': a.machine, 'name': a.name, 'tab': a.name, 'argv': argv}
    # WIN resolves the project path on its host before launching the inner terminal.
    if a.directory.startswith('/'):
        payload['folder'] = a.directory
    if a.dry_run:
        print(json.dumps({'command': command, 'args': payload}, indent=2))
    else:
        result = subprocess.run([str(Path.home() / '.local/bin/herdr-app'), 'do', command, json.dumps(payload)])
        raise SystemExit(result.returncode)

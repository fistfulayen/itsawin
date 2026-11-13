#!/usr/bin/env python3
"""Configure the local Herdr core's default shell. Run outside the agent sandbox."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import time
import tomllib

parser = argparse.ArgumentParser()
parser.add_argument('--plain', action='store_true', help='Use the ordinary login shell')
parser.add_argument('--check', action='store_true', help='Preview without writing')
parser.add_argument('--theme', choices=['p1', 'p3'], default='p1')
parser.add_argument('--host-label', default=None)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
node = shutil.which('node')
if not node:
    raise SystemExit('Node.js is not on PATH')
config = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home() / '.config'))) / 'herdr-core/config.toml'
source = config.read_text() if config.exists() else ''
tomllib.loads(source)  # Never overwrite an invalid configuration.
# Only change the top-level shell key; preserve every unrelated line.
first_table = re.search(r'^\s*\[', source, re.M)
boundary = first_table.start() if first_table else len(source)
head, tail = source[:boundary], source[boundary:]
launcher = [node, str(root / 'bin/win.mjs'), '--theme', args.theme]
if args.host_label:
    launcher += ['--host-label', args.host_label]
if args.plain:
    launcher = ['/bin/sh', '-c', 'exec "${SHELL:-/bin/sh}" -l']
setting = 'shell = ' + json.dumps(launcher) + '\n'
old = tomllib.loads(source).get('shell')
if old is not None:
    # Refuse multiline values rather than risk replacing part of a TOML array.
    match = re.search(r'^shell\s*=\s*\[[^\n]*\][ \t]*(?:#.*)?$', head, re.M)
    if not match:
        raise SystemExit('Existing shell setting uses multiline/nonstandard formatting; leave it intact and edit it manually.')
    head = head[:match.start()] + setting.rstrip('\n') + head[match.end():]
else:
    head = setting + head
result = head + tail
assert tomllib.loads(result)['shell'] == launcher
print(f'Herdr configuration: {config}')
print(setting.rstrip())
if args.check:
    print('Preview only; nothing changed.')
elif result == source:
    print('Already configured.')
else:
    config.parent.mkdir(parents=True, exist_ok=True)
    if config.exists():
        backup = config.with_name(f'config.toml.before-win-{time.time_ns()}')
        shutil.copy2(config, backup)
        print(f'Previous configuration saved: {backup}')
    fd, staged = tempfile.mkstemp(dir=config.parent, prefix='.win-config-')
    try:
        with os.fdopen(fd, 'w') as file:
            file.write(result)
        os.replace(staged, config)
    finally:
        if os.path.exists(staged):
            os.unlink(staged)
    print(('Ordinary shell' if args.plain else 'WIN') + ' is now the default for NEW local Herdr terminals. No restart required.')
    print('Existing terminals are unchanged. Remove the top-level shell setting to undo.')

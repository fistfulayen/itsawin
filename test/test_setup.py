"""Exercise configuration and request generation without touching a real core."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'setup'))
from menu_patch import patch_menu, patch_tabs


class SetupTests(unittest.TestCase):
    def test_agent_requests(self):
        session = '12345678-abcd-4321-abcd-123456789012'
        for agent in ['claude', 'codex']:
            for flags, command in [([], 'space.new'), (['--machine', 'studio'], 'space.new'),
                                   (['--space', 'studio/s1'], 'tab.new')]:
                argv = [sys.executable, str(ROOT / f'bin/{agent}-win.py'), '--session', session,
                        '--directory', '/tmp/project with spaces', '--dry-run', *flags]
                payload = json.loads(subprocess.check_output(argv))
                self.assertEqual(payload['command'], command)
                args = payload['args']['argv']
                self.assertIn('--' + agent + '-resume', args)
                self.assertIn(session, args)
                self.assertIn('/tmp/project with spaces', args)
                self.assertEqual('--chrome' in args, agent == 'claude')
                if flags:
                    self.assertEqual(args[:2], ['/bin/sh', '-c'])

    def test_default_config_preserves_other_settings_and_backups(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'herdr-core/config.toml'
            config.parent.mkdir()
            config.write_text('shell = ["/bin/bash"]\n[other]\nkeep = true\n')
            env = dict(os.environ, XDG_CONFIG_HOME=directory)
            command = [sys.executable, str(ROOT / 'setup/default-shell.py')]
            subprocess.run(command + ['--theme', 'p3', '--host-label', 'Studio', '--check'],
                           env=env, check=True, capture_output=True)
            self.assertIn('/bin/bash', config.read_text())
            subprocess.run(command + ['--theme', 'p3', '--host-label', 'Studio'],
                           env=env, check=True, capture_output=True)
            self.assertIn('Studio', config.read_text())
            subprocess.run(command + ['--plain'], env=env, check=True, capture_output=True)
            self.assertNotIn('bin/win.mjs', config.read_text())
            self.assertIn('[other]\nkeep = true', config.read_text())
            self.assertEqual(len(list(config.parent.glob('config.toml.before-win-*'))), 2)

    def test_menu_patches_fail_on_drift_and_are_idempotent(self):
        menu = ('Math.min(491, 167 +\n'
                '      .child(div().px(9).pt(8).pb(4).text_size(11).text_color(t.dim).child("Start an agent"))')
        patched = patch_menu(menu)
        self.assertIn('this.row("itsawin"', patched)
        self.assertEqual(patch_menu(patched), patched)
        tabs = 'mod: "new-menu", width: 250, height: 512'
        patched_tabs = patch_tabs(tabs)
        self.assertIn('itsawin-menu', patched_tabs)
        self.assertEqual(patch_tabs(patched_tabs), patched_tabs)
        with self.assertRaises(ValueError):
            patch_menu('unknown upstream build')
        with self.assertRaises(ValueError):
            patch_tabs(tabs + tabs)


if __name__ == '__main__':
    unittest.main()

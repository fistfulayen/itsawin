# itsawin

**A working terminal inside a work of art.**

itsawin turns the windows in [Andreas Gysin’s Win-Win](https://itsa.win/) into
views onto persistent [Herdr](https://github.com/herdrdev/herdr-core) terminals.
Keep the cascading artwork, open a real shell when you need one, and return to
that session later. Built by a collector, for other collectors and curious tinkerers.

- Create shells or attach to existing sessions from **Window → Connect session…**.
- Choose the starting directory, including `~/project` on the current machine.
- Use green **p1** locally and amber **p3** remotely, or choose either explicitly.
- Add separate **Terminal** and **itsawin** choices to Herdr’s + menu.
- Resume Claude Code or Codex conversations directly inside artwork windows.
- Close a WIN window to detach its viewer while the core terminal keeps running.

This is an independent integration, not an official Win-Win or Herdr release.
**Andreas’s artwork is not included or relicensed.** Download it separately from
his site. Our integration is source available under a non-commercial license.

## Try it

Requires Node.js 20+, npm, and macOS or Linux. Real sessions require the newer
Herdr core (`hc`); the demo does not. The optional installers require Python 3.11+.
Linux needs `make`, a C++ compiler, and Python to build node-pty. On Debian/Ubuntu,
these are available through `build-essential` and `python3`.

```sh
git clone https://github.com/fistfulayen/itsawin.git
cd itsawin
npm ci
npm run artwork
npm run demo
```

`npm run artwork` downloads `https://itsa.win/tty.mjs`, verifies its exact SHA-256,
and saves a local, git-ignored copy. It does not execute the download. If the
artist updates the client, the check stops rather than silently adapting unknown
code. See [artwork compatibility](docs/architecture.md#artwork-compatibility).

To use real sessions, install Herdr from its [official project](https://github.com/herdrdev/herdr-app), then run:

```sh
npm start
# Or choose a theme and label:
npm start -- --theme p3 --host-label Studio
```

Run in an interactive terminal such as Herdr or Ghostty. Herdr core owns the
sessions even when another terminal app displays WIN. This is a Herdr-backed
viewer, not a tmux frontend or a replacement login shell.

## Use it

The session chooser opens on launch. Select **New Terminal…**, enter a name, and
choose its directory. Tab or clicking switches fields; Ctrl-U clears the active
field. Typing and pasting work. `~` expands on the host running WIN; relative paths
resolve from WIN’s starting folder. Missing or inaccessible folders leave the
form open with an error.

Existing sessions offer **Enter to connect** or **O to observe**. Interactive
attachment may become the terminal’s active input and resize owner. Avoid typing
into the same session from two viewers simultaneously.

The artwork’s original **Window → New** still creates its text editor.
**Window → Connect session…** opens the real-terminal chooser.

| Shortcut       | Action                                   |
| -------------- | ---------------------------------------- |
| Ctrl-G, N      | Open the session chooser                 |
| Ctrl-G, W      | Next artwork window                      |
| Ctrl-G, Z      | Zoom or restore                          |
| Ctrl-G, D      | Close the window and detach              |
| Ctrl-G, R      | Reconnect a disconnected viewer          |
| Ctrl-G, M      | Artwork menu                             |
| Ctrl-G, Q      | Quit WIN, leaving core terminals running |
| Ctrl-G twice   | Send a literal Ctrl-G                    |
| F2 in chooser  | Refresh sessions                         |
| Esc in chooser | Cancel                                   |

Ordinary keys, including Ctrl-C, go to the focused terminal. **`exit` or Ctrl-D can
end its shell**; closing the WIN window only detaches. Frames support dragging,
resizing, and zooming. The mouse wheel scrolls history unless the program requests
mouse input. Persistence depends on the core remaining alive; this project does
not promise recovery after a host reboot or core crash.

## Herdr menu and remote machines

With Herdr open, run from the checkout:

```sh
python3 setup/install-herdr-menu.py
```

This checks personal copies of Herdr’s menu and tab bar, switches to a cloned
`itsawin-layout`, installs `~/.local/bin/itsawin`, and configures new ordinary
Herdr terminals to run the login shell. Core configuration changes save a backup.
The + menu offers **Terminal** (plain shell) and **itsawin** (artwork desktop).
Existing terminals stay running. Shipped Herdr files are not edited.

Each machine runs its own WIN. Choose the host in Herdr’s sidebar; WIN lists only
that host’s sessions. To install on a machine already connected to Herdr:

```sh
python3 setup/deploy-vps.py user@server --theme p3 --host-label VPS
```

The SSH destination can also be an alias from your SSH config. The installer
copies a private release into `~/code/itsawin/releases/`, installs dependencies,
runs tests, installs that host’s launcher, and restores its plain-shell core
default. It copies your local artwork file for your use; no artwork is published
in this repository. Each additional host needs its own launcher before using the
custom menu there. WIN itself never opens an SSH connection.

To return to the shipped interface, select the `main` layout in Herdr. To undo a
core configuration change, restore the printed backup. To intentionally make WIN
the default instead of a menu choice:

```sh
python3 setup/default-shell.py --theme p1 --host-label Mac --check
python3 setup/default-shell.py --theme p1 --host-label Mac
# Return to a plain shell:
python3 setup/default-shell.py --plain
```

Menu patches are checked against the installed source structure and may need an
update when Herdr changes. The inspected baseline is Herdr app 0.1.15 / hc 0.1.21.

## Resume coding agents

From the machine running the Herdr desktop app:

```sh
python3 bin/claude-win.py --session CONVERSATION_UUID \
  --directory ~/code/my-project --name 'My project · Claude'

python3 bin/codex-win.py --session CONVERSATION_UUID \
  --directory ~/code/my-project --name 'My project · Codex'
```

Add `--machine vps` to create a remote space, or `--space SPACE_ID` to open a tab
in an existing space. Get exact space IDs from `herdr-app ls`; remote IDs include
the machine prefix. Quote remote home paths, for example `--directory '~/project'`,
so your local shell does not expand them. `--dry-run` prints the app request.

Claude launches with `--resume UUID --chrome`; add `--no-chrome` to disable Chrome
integration. Codex launches with `resume UUID`. The agent and its saved history
must already exist on the target host. This does not copy conversations between
machines or manage Chrome authentication.

Repeated sequential launches reuse a live WIN-managed terminal for that agent
and conversation. Changing flags does not reconfigure an already-running agent.
Do not launch concurrent migrations of the same conversation. Before migrating,
checkpoint work and stop the old agent cleanly. Test one conversation and verify
its history and integrations before moving the rest. `hc send` can deliver a note
rather than a literal `/exit` command: inspect the process instead of assuming it
exited. A successful Herdr launch is not proof that the agent resumed successfully.

## Development

```sh
npm test                 # unit/provider tests; artwork tests also run when tty.mjs exists
npm run test:setup       # Python installer/launcher tests
npm run format:check
npm run format
```

Tests use isolated fake-core fixtures and real PTYs; they never stop your Herdr
core or contact an AI service. The optional [GitHub Actions template](docs/github-actions.yml) tests Linux and
macOS without redistributing or downloading the artwork. To enable it, copy it to
`.github/workflows/test.yml` with a GitHub credential that permits workflow changes. Three artwork-dependent tests are skipped in that
case. To run the full suite, obtain the verified client with `npm run artwork`.
Live Herdr attachment and real agent resumes still need manual verification.

See [architecture](docs/architecture.md), [contributing](CONTRIBUTING.md), and
[third-party notices](NOTICE).

## Limits and troubleshooting

- The artwork is a single-cell, 16-color compositor. Colors are approximated;
  wide glyphs use placeholders. Images, hyperlinks, italics, and underlines are
  not rendered. It is not a full-fidelity native terminal replacement.
- `npm start -- --doctor` lists eligible sessions without opening the artwork.
  `WIN_HC=/absolute/path/to/hc` overrides core CLI discovery.
- A disconnected window can reconnect with Ctrl-G, R. A stopped core or ended
  shell cannot be recovered by reconnecting the viewer.
- If native module loading fails, check Node, build tools, and npm’s install-script
  policy. The package explicitly permits node-pty 1.1.0’s native build scripts.
- Keep shell startup files usable in a noninteractive launch environment. The
  remote installer supports nvm and common user-level Node locations.

## License and artwork

Required Notice: Copyright 2026 Ian Rogers. WIN integration code is licensed under PolyForm Noncommercial 1.0.0.

Our code may be used, modified, and shared for the purposes permitted by
[PolyForm Noncommercial 1.0.0](LICENSE). Commercial use is not granted. This is
**source-available software, not OSI-approved open source**. The license text is
controlling, including its provisions for non-commercial organizations.

**Win-Win (2024–26), Andreas Gysin / ertdfgcvb, remains all rights reserved.**
Neither this license nor ownership of an artwork token grants rights to
redistribute the artwork code. Dependencies retain their own licenses. See
[NOTICE](NOTICE). Thanks to Andreas for the artwork and to the Herdr, xterm.js,
and node-pty authors for the systems that make this integration possible.

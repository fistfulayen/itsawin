# Contributing

Issues and small, focused pull requests are welcome. Explain the user-visible
problem, the host/terminal combination, and how you verified the change.

- Read `docs/architecture.md` before changing terminal lifetime or input handling.
- Run `npm test`, `npm run test:setup`, and `npm run format:check`.
- For renderer/input changes, obtain the separately licensed artwork and run the
  full PTY tests, then check it interactively. Report checks you could not perform.
- Never commit artwork clients, generated caches, credentials, conversation
  histories, machine addresses, or screenshots containing private terminal data.
- Keep argument values out of shell command strings. Test paths with spaces and
  shell metacharacters, invalid directories, and failed launches.
- Do not stop existing user terminals or cores during tests.
- Contributions are provided under the repository's PolyForm Noncommercial 1.0.0
  license. Third-party code must retain its own license and attribution.

The optional menu integration is pinned to an inspected Herdr UI structure.
Unexpected anchors should produce a clear error rather than an approximate patch.

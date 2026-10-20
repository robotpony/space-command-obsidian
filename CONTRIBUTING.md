# Contributing

Space Command for Obsidian is a companion to Space Command and its workflows reflect that, but issues and pull requests are welcome.

## Before you start

- Skim [CLAUDE.md](CLAUDE.md) for build commands, architecture and the release checklist.
- Skim [DESIGN.md](DESIGN.md) for the write rules. Every tag write has to match Space Command's, so a change to a rule starts there, not in the plugin.
- Skim [plugin-conventions.md](plugin-conventions.md) for UI patterns, CSS naming and TypeScript conventions.
- For anything beyond a small fix, open an issue first to talk through the approach.

## Setup

```bash
npm install
npm run dev     # watch mode
npm test        # vitest suite
npm run build   # typecheck + production build
```

To try changes in Obsidian, run `./install.sh` to copy the built plugin into a vault (see the [README](README.md#install)).

## Pull requests

- Run `npm run build` and `npm test` before opening a PR; both must pass.
- If your change is user-visible, update `README.md` and add a `CHANGELOG.md` entry. Bump the version in `manifest.json` and `package.json` per the [release checklist](CLAUDE.md#release-checklist).
- Keep PRs focused. Unrelated cleanup makes a change harder to review; open a separate PR instead.

## Reporting bugs

[Open an issue](https://github.com/robotpony/space-command-obsidian/issues/new/choose) using the bug report template. It asks for the plugin version, your Obsidian version, and steps to reproduce.

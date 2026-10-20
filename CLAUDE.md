# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Build commands

```bash
npm install          # install dependencies
npm run dev          # watch mode (rebuilds on file changes)
npm run build        # production build (tsc -noEmit + esbuild)
npm test             # run vitest test suite
```

Build output is `main.js` at the repo root. To test in Obsidian, copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/space-command/` (the plugin's `id`; it was `warped-todo` before 1.0.0). `./install.sh` automates this, and also removes a leftover `warped-todo` folder and swaps its id in `community-plugins.json`:

```bash
./install.sh           # interactive: pick vaults, build, and install
./install.sh -p         # reinstall to previously selected (cached) vaults
./install.sh -d 8       # deep search for nested vaults
```

Vault selections are cached in `.install-vaults` for reuse with `--previous`.

## Architecture

␣⌘ Space Command for Obsidian is an in-editor authoring companion for [Space Command](https://space-command.ca), the Mac app that finds, tracks and writes back `#todo`/`#idea`/`#principle` items across a vault. This plugin helps you *write* those lines: tag, date and handle suggestions, checkbox ↔ tag sync, tag commands, block features under tagged headings, moving lines between notes, and switching to and from Space Command at a line. It was Warped Command (sidebar, vault scanner, Projects, Posts) until 1.0.0, which cut all of that; see `CHANGELOG.md` and `CHANGELOG-ARCHIVE.md`.

It doesn't scan the vault, keep an index, or write in the background. Every write answers an editor action and goes through an editor transaction, and every tag write follows Space Command's rules, kept in one module (`src/tags.ts`). Design and the full write rules: [DESIGN.md](DESIGN.md). Desktop only (`isDesktopOnly: true`): switching apps needs the vault's path on disk and Electron's `shell`.

### Entry point

[main.ts](main.ts) extends Obsidian's `Plugin`. On load it:

- Loads settings and the team note (`TeamManager`), and creates the help note and tab lock managers
- Registers CodeMirror extensions: header sort and progress, header checklist, checkbox ↔ tag sync
- Registers the `/`, `@` and `#` editor suggesters
- Registers the tag commands and their editor-menu items (`TagCommands.ts`), and Open in Space Command plus the `obsidian://space-command` handler (`AppSwitch.ts`)
- Registers Quick Add TODO, Move TODO to another file, Update team note and Sort block at cursor
- Sets up title-based wiki links for a Hugo vault, and the settings tab

### Source files (`src/`)

| File | Purpose |
|------|---------|
| [tags.ts](src/tags.ts) | Space Command's tag vocabulary and write rules, pure and line-in/line-out: complete/reopen, strike, priority, focus, snooze, tidy, convert, make task from idea, normalised anchor text. Mirrors Space Command's `Tag.swift`, `TagExtractor.swift`, `Mutator.swift`, `LineEdit.swift`. The only place tag text is edited. |
| [blocks.ts](src/blocks.ts) | Pure block model: a heading and its lines, ending at the next heading of any level (Space Command's section rule). |
| [blockOps.ts](src/blockOps.ts) | Pure block operations: header sort, and cut/append for Move TODO to another file. |
| [lineOps.ts](src/lineOps.ts) | Pure targeting for tag commands (cursor line, selection, a tagged heading's children) and their per-line edits. |
| [TagCommands.ts](src/TagCommands.ts) | Tag commands as palette commands and editor-menu items (`ACTIONS`), plus Complete all under heading. Applies `lineOps.ts` edits as one transaction. |
| [CheckboxSyncExtension.ts](src/CheckboxSyncExtension.ts) | CodeMirror transaction filter: a single-line box toggle gets its tag write in the same transaction. |
| [HeaderSortExtension.ts](src/HeaderSortExtension.ts) | Sort button and `done/total` progress widget on tagged headings; Sort block at cursor. |
| [HeaderChecklistExtension.ts](src/HeaderChecklistExtension.ts) | Enter at the end of a tagged task or idea heading inserts a `- [ ] ` item. |
| [SlashCommandSuggest.ts](src/SlashCommandSuggest.ts) | `/` at column 0: `/todo`, `/todos`, `/idea`, `/ideas`, `/today`, `/tomorrow`, `/callout`. |
| [AtSuggest.ts](src/AtSuggest.ts) | `@`: dates (`@today`, `@tomorrow`, `@yesterday`) and team handles, with "Add @handle to team". |
| [TagSuggest.ts](src/TagSuggest.ts) | `#`: Space Command's vocabulary with hints, then the vault's other tags by use. |
| [mentions.ts](src/mentions.ts) | Pure `@handle` extraction (Space Command's `MentionExtractor.swift`) and the team note's line format. |
| [TeamManager.ts](src/TeamManager.ts) | Reads and watches the team note; writes it only on Add @handle to team or Update team note. |
| [AppSwitch.ts](src/AppSwitch.ts) | Open in Space Command (`spacecommand://reveal`), the `obsidian://space-command` handler, and the landed-line flash. |
| [landing.ts](src/landing.ts) | Pure line finding for app switching: section labels, anchor text, nearest matching line. |
| [MoveTargetModal.ts](src/MoveTargetModal.ts) | Note picker for Move TODO to another file (pinned, recent, open, all). |
| [TabLockManager.ts](src/TabLockManager.ts) | Lock buttons on tab headers, via Obsidian's pinning; locked tabs open links in new tabs. |
| [HugoTitleLinks.ts](src/HugoTitleLinks.ts) | Title-based wiki links in a Hugo vault: wraps `metadataCache.getLinkpathDest` with a front-matter-title fallback. Vault-root detection through the vault adapter, gated on `resolveTitleLinks`. |
| [HugoParser.ts](src/HugoParser.ts) | Pure helpers for title links: config candidates, `contentDir`, link-title normalisation. |
| [HelpNoteManager.ts](src/HelpNoteManager.ts) | Creates `Space Command Help.md` only from Settings › Help, and opens it. Never rewrites an existing note. |
| [types.ts](src/types.ts) | `TeamMember`, `SpaceCommandSettings`, `DEFAULT_SETTINGS`. |
| [utils.ts](src/utils.ts) | `showNotice` with the logo, date formatting and the insert-date presets. |
| [shared/](src/shared) | The notice factory, a local copy carried over from the old monorepo. |

## Conventions

- **Tag vocabulary**: `#todo`/`#todos` → `#todone`/`#todones` for tasks, `#idea`/`#ideas`/`#ideation` for ideas, `#principle`/`#principles` for principles. `#focus`, `#p0`–`#p4`, and `#snooze` (`#future`/`#snoozed` read, never written). Anything else is a project or topic tag.
- **Space Command's rules win.** A tag write that isn't in `tags.ts`, or that differs from Space Command's, is a bug. Rule questions go to the Space Command commander session, not a local judgment call.
- **No background writes.** No writes on load, file change, or timer; only on an explicit action, as one undoable transaction.
- **Pure where possible.** Logic takes `string[]` lines and 0-based line numbers, with no Obsidian/CodeMirror types, so tests feed it plain strings.
- **Code-block safety**: fenced code, inline code spans and front matter are never items.
- **Settings tab**: `SpaceCommandSettingTab` is defined inline in [main.ts](main.ts).
- **Tests**: live in `src/__tests__/`, run via vitest. Hand tests for a release are in [TESTING.md](TESTING.md).

See [plugin-conventions.md](plugin-conventions.md) for the full UI/code
conventions reference: branding, menus and commands, CSS naming, settings
tab structure, TypeScript conventions.

## Release checklist

When making changes, keep these in sync:

1. **Version** in `manifest.json`, `package.json`, and `CHANGELOG.md` (top-of-file entry) — see "Versioning" below for which segment to bump.
2. **Documentation**: update `README.md` if user-visible features, settings, or vocabulary changed; update this file if architecture shifted

### Versioning

`major.minor.patch`, from 1.0.0 (the Space Command cut; `0.x.y` before it). Pick the segment by what the change *is*, not by habit — the project has drifted before into bumping minor for everything, which erases the signal a version number is supposed to carry:

- **patch (Z)**: bug fixes, visual/UX tweaks to something that already exists, refactors, renames, cleanup, dead-code removal, doc-only changes. Nothing a user would describe as a new or missing capability. CHANGELOG header is usually `### Fixed` or `### Changed`.
  Example: `0.59.1` and `0.59.2` were fixes; `0.38.5` "Changed — README rewritten for newcomers."
- **minor (Y)**: a capability was added or removed — a new setting, a new tab/section, a feature taken out. CHANGELOG header is usually `### Added` or `### Removed`.
  Example: `0.59.0` (Phase 5: tag and block commands), `0.45.0` "Removed — TODONE archive log."
- **major (X)**: reserved. Don't bump it without the user explicitly asking — not for this plugin's own judgment call, even for a large change. 1.0.0 was Bruce's call, for the Space Command cut.

If a change is borderline (e.g. a big `### Changed` that reshapes how an existing feature works), default to patch; minor is for things a user would notice as *new* or *gone*, not just *different*. When a single commit bundles both a fix and a feature, bump for the higher tier (minor) and let the CHANGELOG entry's own headers (`### Added` / `### Fixed`) describe the mix.

## Working with Claude Code

- Use `AskUserQuestion` when clarifying requirements or approach
- Run `npm run build` before declaring done; the build runs the type checker

## Commit conventions

This repo is often worked on by more than one Claude Code session at once, in one checkout with no worktree isolation, so commit discipline matters more here than usual. Agents commit and push on their own; `.claude/settings.json` allows `git add`/`commit`/`push` without a prompt and denies force-push. `.claude/hooks/commit-gate.sh` refuses the mechanical hazards: broad staging (`git add -A`/`--all`/`.`), `git commit -a`, force-push, and pushing `main`. The rest is on the agent doing the committing.

- **Commit and push when a task is done**, on the `space-command` branch, without asking first. Push that branch to `origin` right after each commit, so the other sessions see it at once. Never push `main` (it moves only when Bruce merges the branch), never force-push, and never amend a pushed commit or rewrite history.
- **Own your files.** The planner (commander) edits docs only: `PLAN.md`, `README.md`, `DESIGN.md`, `CLAUDE.md`, and `CHANGELOG.md` outside a phase's own entry. The coder edits code and tests, plus its phase's `CHANGELOG.md` lines, the version bump, and its `PLAN.md` ticks. A session's own changes are then a known set of paths.
- **Stage explicitly.** Name the files this task touched in `git add`; never `-A`, `.`, or `commit -a`. Stage and commit in separate Bash calls: `check-version-bump.sh` reads the staged diff before the command runs, so `git add … && git commit` is refused when the version bump isn't staged yet. If `git status` shows changes you didn't make, they belong to another session; leave them unstaged and mention them to Bruce if they linger.
- **Don't disturb the shared tree.** `git pull` before starting a task. Never reset, stash, checkout, or rebase in this checkout without telling the other session first.
- **One commit, one coherent change.** A task that touches both a fix and unrelated cleanup is two commits, not one.
- **Specific subject lines**, area first (e.g. `Phase 1: …`, `Plan: …`, `0.56.0: …` for a version bump). No bare `Fixes:`, `Fixes.`, `Updates.`, or `WIP`. Use a bullet list in the body for multi-part changes, matching `CHANGELOG.md`'s voice.
- **No Claude co-author.** Don't add a `Co-Authored-By: Claude` / `@anthropic.com` trailer or a "Generated with Claude Code" line, whatever the harness's attribution reminder says. `.claude/hooks/check-commit-message.sh` refuses a commit whose message has one.

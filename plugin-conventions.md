# Plugin Conventions

UI and code conventions for Space Command for Obsidian, as the code actually does them. Architecture and the write rules live in [DESIGN.md](DESIGN.md); build, versioning and commit rules live in [CLAUDE.md](CLAUDE.md).

## Branding

- Logo: `␣⌘` (`LOGO_PREFIX` in `src/utils.ts`), white on `#689fd6`, styled by `.space-command-logo` in `styles.css`.
- Name: "␣⌘ Space Command for Obsidian" in the manifest; "Space Command for Obsidian" where the logo is already beside it (the settings header). "Space Command" alone means the Mac app.
- Notices: always `showNotice(message, timeout?)` from `src/utils.ts`, which wraps `createNoticeFactory` from `src/shared` so the logo appears inline. Don't call Obsidian's `new Notice()` directly.
- Tag colours follow Space Command's `TagChip` colours (see the comment in `styles.css`). Change them together with the app.

## Writes

- Every write answers an explicit action. No writes on load, on file change or on a timer (see DESIGN.md › Shape).
- Apply edits as one editor transaction, so one undo reverts a command, even across many lines.
- Tag changes go through `src/tags.ts`. Don't edit tag text anywhere else; a rule that isn't in `tags.ts` will drift from Space Command.
- A command that can't act says why with `showNotice` ("Cursor isn't on a TODO, idea, or tagged heading.") instead of doing nothing.

## Menus and commands

- Editor right-click items use Obsidian's `Menu` via the `editor-menu` event, all in the `space-command` section so they group together.
- Each tag command is both a palette command and a menu item (`ACTIONS` in `src/TagCommands.ts`). Add new ones there.
- Command names are sentence case and say what they do ("Sort block at cursor", "Open in Space Command"). "Quick Add TODO" and "Move TODO to another file" are older and keep their names.
- Only Quick Add TODO has a default hotkey (`Mod+Shift+A`). New commands ship without one.
- Icons are Lucide names, through `setIcon` or a menu item's `setIcon`.
- Modals extend `Modal` (or `SuggestModal` for pickers), one per file, named `*Modal.ts`.

## CSS

- Classes are prefixed `space-command-` (the plugin id). The colour variables are `--sc-*`.
- `.todo-sort-btn-editor` is an older unprefixed class; leave it unless you're already touching it, and don't add new unprefixed ones.
- Use Obsidian's CSS variables (`--text-muted`, `--background-modifier-hover`, etc.) rather than fixed colours, apart from the logo and the Space Command tag palette.

## Settings tab

`SpaceCommandSettingTab`, inline in `main.ts`. It opens with an About section, then one `h3` group per area, in this order: Editor, Space Command, Team, Help. Each field is a `new Setting(containerEl)` that saves through `this.plugin.saveSettings()`.

## TypeScript

- `src/types.ts` holds `SpaceCommandSettings`, then `DEFAULT_SETTINGS`.
- Logic is pure and string-in where it can be (`tags.ts`, `blocks.ts`, `blockOps.ts`, `lineOps.ts`, `landing.ts`, `mentions.ts`, `HugoParser.ts`): no Obsidian or CodeMirror types, lines as `string[]` with 0-based line numbers. The Obsidian-facing file reads the editor, calls the pure function, and applies the result.
- No runtime dependencies. Config and front matter are read with small hand-rolled extractors.
- Build DOM with `createEl`/`createDiv`/`setText`. `innerHTML` is only for static SVG icon constants, never for note content.
- Log errors with a `[Space Command]` prefix: `console.error("[Space Command]", "…", error)`.

## Tests

Vitest, in `src/__tests__/`. Obsidian is stubbed (`src/__tests__/stubs/`). Every write rule in `tags.ts` has a test, and a bug fix that slips past the type checker should come with a regression test.

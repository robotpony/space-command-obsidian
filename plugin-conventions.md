# Plugin Conventions

UI and code conventions for Warped Command, as the code actually does them.
Architecture lives in [DESIGN.md](DESIGN.md); build, versioning, and commit
rules live in [CLAUDE.md](CLAUDE.md).

## Branding

- Logo: `␣⌘` (`LOGO_PREFIX` in `src/utils.ts`), white on `#689fd6`, styled by
  `.warped-todo-logo` in `styles.css`. Add `.clickable-logo` where clicking it
  opens the About modal.
- Notices: always `showNotice(message, timeout?)` from `src/utils.ts`, which
  wraps `createNoticeFactory` from `src/shared` so the logo appears inline.
  Don't call Obsidian's `new Notice()` directly.

## Sidebar

- One `ItemView`, `TodoSidebarView` (`src/SidebarView.ts`), view type
  `warped-todo-sidebar`, icon `square-check-big`. All four tabs (TODOs,
  Projects, Ideas, Posts) and Focus Mode render inside it. Don't add a
  second view for a new feature; add a tab or section.
- Lifecycle goes through `SidebarManager` (`src/shared`): `activate()` on
  layout ready when `showSidebarByDefault` is on, `toggle()` from the
  command and ribbon icon, `refresh()` after settings change.
- `render()` empties the container and rebuilds the whole view. No partial
  DOM patching. It runs in response to events (`todos-updated` from
  `TodoScanner`, `onSynced` from `ProjectSyncManager`), never on a timer.
- Layout:

  ```
  .warped-todo-sidebar
    .sidebar-header    title, tab buttons, focus toggle, kebab menu
    .sidebar-content   tag cloud, list, summary (or the focus card)
  ```

- Keep logic that doesn't need the `ItemView` out of `SidebarView.ts` so it
  can be unit-tested; `ProjectsSidebarView.ts` is the model for this.

## Menus and controls

- Kebab, sort, and right-click menus use Obsidian's `Menu`. Row context
  menus go through `ContextMenuHandler`.
- Icon buttons use Obsidian's `clickable-icon` class plus a plugin class
  for positioning. Icons come from `setIcon` (Lucide names).
- Settings dropdowns use `Setting.addDropdown`. No hand-built dropdowns.
- Modals extend `Modal` (or `SuggestModal` for pickers), one per file,
  named `*Modal.ts`.

## CSS

- New classes are prefixed `warped-todo-` (the plugin id, not the display
  name).
- Older unprefixed classes still exist (`sidebar-*`, `focus-card-*`,
  `todo-*`, `sc-*`). Leave them alone unless you're already touching that
  code, and don't add new unprefixed ones.
- Use Obsidian's CSS variables (`--text-muted`,
  `--background-modifier-hover`, etc.) rather than fixed colours, apart
  from the logo.
- When two views show the same kind of row (Projects list, Posts list),
  reuse the same classes rather than near-copies; drift between them has
  been a recurring bug.

## Settings tab

`WarpedTodoSettingTab`, inline in `main.ts`. It opens with an About section,
then one `h3` group per feature, in this order: Sidebar, TODOs, Projects,
Posts, Focus Mode, Team, Help. Each field is a `new Setting(containerEl)`
that saves through `this.plugin.saveSettings()`.

A feature reads only its own settings. Posts has its own `postsEditorApp`
rather than reading `projectsEditorApp`, even though the two often match.

## TypeScript

- `src/types.ts` holds the interfaces, then `DEFAULT_SETTINGS`.
- Services that produce data extend Obsidian's `Events` and `trigger()`
  named events; views subscribe in `onOpen` and unsubscribe in `onClose`.
- Parsers are pure and string-in (`StructuredFileParser`, `PlanParser`,
  `HugoParser`): no `fs`, no Obsidian API, so tests feed them plain
  strings. File I/O lives in a separate wrapper module.
- No runtime dependencies. YAML/TOML frontmatter is hand-parsed; git is
  called via `child_process.execFile`; watching uses `fs.watch`.
- Build DOM with `createEl`/`createDiv`/`setText`. `innerHTML` is only for
  static SVG icon constants, never for content from a note or repo.
- Errors the user needs to see go through `showNotice`. There's no shared
  `Result` type; catch where the failure can be handled and return
  `null`/`false` otherwise.

## Commands

- Only the most-used commands get a default hotkey, all `Mod+Shift`:
  T (toggle sidebar), A (quick add), C (copy as Slack), N (copy as Notion).
  New commands ship without one.
- Command names say what the command does ("Sync Projects," "Send
  selection to project"). Existing names mix title and sentence case;
  use sentence case for new ones.

## Tests

Vitest, in `src/__tests__/`. Obsidian is stubbed (`src/__tests__/stubs/`).
A bug fix that slips past the type checker should come with a regression
test.

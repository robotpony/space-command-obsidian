# Space Command for Obsidian: design

How the plugin works and the rules it keeps. What it does for a user is in [README.md](README.md); code conventions are in [plugin-conventions.md](plugin-conventions.md). The design before 1.0.0, when this was Warped Command with a sidebar, scanner, Projects and Posts, is in git history: `git show a3b77f3:DESIGN.md`.

## Shape

Space Command, the macOS app, finds and tracks the items in a vault and writes them back. This plugin only helps you write them, inside Obsidian's editor. So it has:

- **No index.** Nothing scans the vault on load or on change. A command reads the open document's lines when it runs. The two exceptions are small and read-only: **Update team note** and the `@` suggest read task lines across the vault once, on demand, for handles, and title links keep an index of front-matter titles in a Hugo vault.
- **No background writes.** Every write answers an editor action: a click, a keypress, a command, a menu item. Nothing writes on open, on file change or on a timer. Space Command re-finds a line before it writes and refuses if the line moved, so a reorder here can make it refuse, but can't corrupt anything.
- **Editor transactions.** Writes go through the `Editor` or a CodeMirror transaction, not `vault.modify` on a re-read file, so undo works and there's no read-modify-write race with Space Command. The exceptions are **Move TODO to another file** appending to a note that isn't open (`vault.process`) and the team note, both on explicit action.
- **Nothing outside the vault, and no front matter.** The plugin never writes either.

Pure logic lives in string-in, string-out modules with no Obsidian or CodeMirror types (`tags.ts`, `blocks.ts`, `blockOps.ts`, `lineOps.ts`, `landing.ts`, `mentions.ts`, `HugoParser.ts`), so the tests feed them plain lines. The Obsidian-facing files are thin: they read the editor, call the pure function and apply its edits.

## Space Command's write rules

Every tag write matches Space Command's own code (`Tags/Tag.swift`, `Tags/TagExtractor.swift`, `Mutations/Mutator.swift`, `Mutations/LineEdit.swift`). The rules live in one module, [src/tags.ts](src/tags.ts), with tests per rule. If Space Command changes a rule, this module changes with it.

Completing and reopening:

- Tags are renamed **in place**, never moved, and **aliases keep their form**: `#todo` ↔ `#todone`, `#todos` ↔ `#todones`. Case is kept: `#TODO` → `#TODONE`.
- A tagged line with a box: `- [ ] text #todo` ↔ `- [x] text #todone`.
- A plain bullet with no box: `- text #todo` completes to `- [x] text #todone`. The box is inserted.
- A box under a tagged heading toggles `[x]` only. The heading carries the tag, so no tag is written.
- A tagged heading with child lines is never completed from the heading. **Mark done** refuses there; **Complete all under heading** completes the open task children only, leaving ideas and principles alone.
- Ideas and principles complete by striking the line through (`~~…~~`), tags left outside the strike. Tasks are never struck.
- A line reads as done when it's struck, or when its box and tag disagree. A checked box with `#todo` means "complete the tag". A struck line is never "fixed".
- No date stamp, ever.

Other writes:

- Make a task from an idea: `#idea` → `#todo`, `#ideas` → `#todos`, in place.
- Set priority: replace the first `#pN` in place, drop any others, append when there's none. Remove priority drops them all. A priority inherited from the heading isn't on the line, so there's nothing to remove.
- Focus: append `#focus`; unfocus removes it.
- Snooze: append `#snooze`. Unsnooze removes every snooze tag on the line, `#future` and `#snoozed` included. Those two are read, never written or renamed.
- New tags are always appended at the end of the line.
- Convert to task: `- [ ] text #todo`; under a tagged heading, plain `- [ ] text`.
- Tidy tags reorders only the line's trailing run of tags (kind, priority, focus or snooze, project tags, handles) and collapses repeats. Tags inside the sentence or in code spans stay put, and aliases are never renamed.

A selection-wide toggle (focus, snooze) turns the tag on for every line unless all of them already have it, then off.

## Checkbox sync

[src/CheckboxSyncExtension.ts](src/CheckboxSyncExtension.ts) is a CodeMirror transaction filter. When an edit flips one line's box (a click in Live Preview, or typing `x` into `[ ]`), it appends the tag write from `tags.ts`'s `syncCheckboxToggle` to the same transaction, so the box and the tag undo together. Only single-line edits count: opening a file or an external write reaching the editor replaces many lines, so it's skipped, and nothing is written on open.

## Blocks

[src/blocks.ts](src/blocks.ts) is the block model: a heading plus the lines under it, stopping at the next heading of **any** level. That's Space Command's section rule (`TaggedLinesParser.swift`), so a `####` under a tagged `###` ends the `###`'s block. A heading opens a tagged section when it carries an open kind tag (`#todo(s)`, `#idea(s)`, `#ideation`, `#principle(s)`); a done heading (`#todone`) doesn't, and a child's own kind tag wins over the heading's.

Built on it:

- **Header sort** ([src/HeaderSortExtension.ts](src/HeaderSortExtension.ts), `blockOps.ts`): a button widget on tagged headings and the **Sort block at cursor** command. Order: open before done, then focus, P0–P4, no priority, snoozed. Stable, so a second press changes nothing. Sub-items move with their parent. Never automatic.
- **Heading progress**: a `done/total` widget beside the sort button, counting tasks only (not ideas, principles or snoozed tasks).
- **Header checklist** ([src/HeaderChecklistExtension.ts](src/HeaderChecklistExtension.ts)): Enter at the end of a tagged task or idea heading inserts `- [ ] ` on the next line.
- **Move TODO to another file** (`blockOps.ts`, `main.ts`): cuts the line and its sub-items, or a whole tagged heading block, and appends it to the chosen note. Nothing is left behind. A child moved out from under a tagged heading gains the heading's kind tag, so it's still an item.

## Switching between the apps

[src/AppSwitch.ts](src/AppSwitch.ts) and the pure [src/landing.ts](src/landing.ts). Neither direction writes to the vault.

- **To Space Command**: **Open in Space Command** opens `spacecommand://reveal?path=<absolute path>&line=<1-based>&text=<anchor>&heading=<section>` through Electron's `shell.openExternal`. Without an editor (Reading view) it sends just the path.
- **From Space Command**: the plugin registers `obsidian://space-command?vault=…&path=…&line=…&text=…&heading=…`. It opens the note, reusing a tab that already shows it, and lands on the item, then flashes the line (a fading CodeMirror line decoration). Space Command checks for the plugin's folder and enabled id before it sends this URL, and falls back to `obsidian://open` without it.
- **Anchor text** is the item's *normalised* text, matching Space Command's `Model/Anchor.swift` (`ItemText.normalized`): the line without the list marker, box, vocabulary and state tags, stamps or `~~`, trimmed. Both apps send and match the same value.
- **Landing**: the given line if its normalised text matches; otherwise the matching line nearest the given line, with `heading` breaking ties; with no match, the given line, clamped to the file. Front matter and fenced code are never items.

## Team note and mentions

[src/mentions.ts](src/mentions.ts) follows Space Command's `Tags/MentionExtractor.swift`: a mention starts at an `@` at the start of a line, after whitespace or after `(`, and the handle starts with a letter. So email addresses, `/@user` in URLs and `@2026-10-17` aren't mentions, and `@today`/`@tomorrow`/`@yesterday` are dates.

[src/TeamManager.ts](src/TeamManager.ts) reads the team note (`team.md` by default) on load and when it changes. It writes only on **Add @handle to team** or **Update team note**, never in the background.

## Title-based wiki links

[src/HugoTitleLinks.ts](src/HugoTitleLinks.ts), with the pure parts in [src/HugoParser.ts](src/HugoParser.ts).

Hugo sites with a wiki-link render hook (Fugu's `_markup/render-link.html`) write links by page title, while files are kebab-case slugs. Obsidian resolves by filename only; `aliases` feed its link suggester, not resolution, and Hugo owns that key for URL redirects anyway. So in a Hugo vault the plugin wraps `metadataCache.getLinkpathDest`: Obsidian's own lookup runs first, and only an empty result falls back to a normalised-title index (`TitleLinkIndex`), so filename matches always win.

- **Normalisation** (`normalizeLinkTitle`) copies the render hook's rule: lowercase, collapse each `[^a-z0-9]+` run to one space, trim. Keep the two in step.
- **Index scope** matches the hook's `site.RegularPages`: markdown under `contentDir`, minus `_index.md`. Drafts are included. Duplicate titles pick the first path in sort order.
- **Why `getLinkpathDest`**: in Obsidian 1.14's app.js, `getFirstLinkpathDest`, `isUnresolved` (the `is-unresolved` link class), `openLinkText` (click) and `resolveLinks` (`resolvedLinks`/`unresolvedLinks`, which back backlinks and the graph) all route through it. These are internal call paths, not public API; re-check them when Obsidian changes link resolution.
- **Re-resolution**: after the index changes (enable, disable, or a title edit, debounced 500 ms), every note is re-queued through the internal `queueFileForLinkResolution` so the link graph catches up. It's skipped if that method disappears.
- **Detection** is vault-only: `detectVaultContentPrefix` looks for a Hugo config (`hugo.toml`, `config.yaml` and the like, at the root or under `config/_default/`) at the vault root, through the vault adapter, and reads its `contentDir`. Gated on the `resolveTitleLinks` setting, on by default. Unload restores the original method unless another plugin has wrapped it since; then the wrapper stays in the chain as a pass-through.
- **Not covered**: the render hook's glossary fallback (`[[Term]]` → a `##` heading in the glossary page). The link suggester still inserts filenames.

## Decisions

- **No runtime dependencies.** Config and front matter are read with small hand-rolled extractors, not a YAML or TOML library.
- **Desktop only.** `isDesktopOnly` stays `true`: Open in Space Command needs the vault's absolute path and Electron's `shell`, and the settings tab's team-file picker uses Electron's dialog. The editor features would work on mobile, but Space Command is a Mac app.
- **The id changed at 1.0.0** (`warped-todo` → `space-command`). Nothing migrates; Bruce was the only user. `install.sh` removes the old folder and swaps the enabled id.
- **Tab lock stays** although it has nothing to do with tasks. It uses Obsidian's own pinning, so a locked tab opens links in a new tab.

# Plan: Warped Command → Space Command for Obsidian

Status: **approved by Bruce 2026-10-19**, coordinated with and reviewed by the space-command commander session. The write rules below mirror Space Command's own code (`Sources/SpaceCommandCore/Mutations/Mutator.swift`, `Tags/Tag.swift`). Replaces `TODO.md`'s queue; those items were all sidebar or docs cleanup that this plan removes.

Space Command's side of this plan: `~/projects/utilities/warped-space-command/docs/design/obsidian-command.md` (decided 2026-10-17) and that repo's `PLAN.md` › Helper · obsidian-command. Where this file and obsidian-command.md differ, the 2026-10-19 decisions below are newer; the commander updates obsidian-command.md to match.

## Goal

Cut Warped Command down to an in-editor authoring companion for Space Command. Space Command (the Swift app, 0.65.x) does the finding, tracking and writing back: tasks, ideas, projects, focus, posts, mutations. This plugin helps you *write* tasks in a vault: tags, dates, handles, checklists, blocks, and moving lines around. It doesn't scan the vault or show a sidebar.

## Decisions

From obsidian-command.md (2026-10-17):

- It's warped-command, cut down, replacing `warped-todo` in place. Bruce is the only user, so nothing migrates (no settings carry-over).
- Plugin id `space-command`, display name "␣⌘ Space Command for Obsidian". Distributed as a zip from space-command.ca, not community plugins.
- **Space Command's tag rules win.** No date stamps, no `#moved` or `#today`, snooze written as `#snooze`. Full rules in "Space Command's write rules" below.
- Dropped: sidebars, Stats, scanner, focus mode, projects and project sync, Send to project, Hugo posts and New post, Export scan snapshot, clickable links in lists.

Bruce's answers (2026-10-19), by question number:

1. **Tab lock: kept** (overrides obsidian-command.md, which dropped it).
2. **Slack/Notion converters: dropped.** Slack lives on as Space Command's Clipboard transform (0.36.0).
3. **Title-based wiki links: kept** (`HugoTitleLinks.ts`), with `HugoParser.ts` trimmed to what it uses.
4. **Handles: a visible vault note, `team.md`**, keeping today's file and its path setting (overrides the data.json recommendation). Written only on explicit action, never in the background; see Phase 4.
5. **Obsidian → Space Command: yes** (commander's question 57). `spacecommand://reveal`, and look for better ways to land on a line.
6. **Space Command → Obsidian at a line: yes** (commander's question 58). The plugin's own protocol handler.
7. **1.0.0**, built on a long-lived branch (see "How the work runs").
8. **Repo and npm package keep their names**; the rename lands with the docs in Phase 7.
9. **Tidy tags reorders only the trailing run** of tags.
10. **Header sort (sort todo blocks) stays.**
11. **Block features added** (Phase 5): selection-wide tag ops, progress on headings, convert list to tasks, complete all under heading. The commander checked the last one: no conflict.
12. **"Complete all under heading" completes task children only**, leaving ideas and principles alone, so a mixed block doesn't get lines struck through.

## How the work runs

- **Branch `space-command`**, long-lived; `main` keeps the current plugin until the branch merges at 1.0.0.
- Worked directly in this checkout, no worktree (Bruce, 2026-10-19): only two agents (the planner and the coder) touch the tree, and no humans. Both stay on the branch; hotfixes for `main` wait or go through Bruce.
- Each phase bumps `package.json`/`manifest.json` from where they stand, by CLAUDE.md's patch/minor rule, never as far as 1.0.0 (Bruce, 2026-10-19), so a test build's number says which phase it carries. Phase 1 is 0.56.0. `CHANGELOG.md` still gets one `1.0.0` entry, built up phase by phase (`### Removed`, `### Changed`, `### Added`). Patches to `main` in the meantime keep their own versions and are merged into the branch as they land.
- Each phase ends with `npm run build` and `npm test` green, and is committed and pushed on the branch when done, without asking (Bruce, 2026-10-19; see CLAUDE.md's Commit conventions).

## Rules for every phase

From the commander, so the two apps never fight over a file:

- No background or on-open writes to vault files. Every write is a direct response to an editor action or command. (The help note's one-time first-install write is the only exception; see Phase 7.)
- Edits go through the editor (`Editor`/CodeMirror transactions) where possible, not `vault.modify` on a re-read file, so undo works and there's no read-modify-write race with Space Command.
- Header sort and line/block moves run only on explicit command or click, never on file change. Space Command re-finds a line before writing and refuses if it moved, so a reorder can make it refuse; it can't corrupt anything.
- Never date-stamp completions; never rename `#future`/`#snoozed`.
- Never write frontmatter or anything outside the vault.

## Space Command's write rules

Every write the plugin makes (Phases 1, 3 and 5) matches these exactly. They live in one module, `src/tags.ts`, with tests per rule.

Completion and reopening:

- Tags are renamed **in place**, never moved, and **aliases keep their form**: `#todo` ↔ `#todone`, `#todos` ↔ `#todones`.
- A tagged line with a box: `- [ ] text #todo` ↔ `- [x] text #todone`.
- A plain bullet with no box: `- text #todo` completes to `- [x] text #todone`. The box is inserted.
- A box under a tagged `###` heading: toggles `[x]` only. The heading carries the tag, so no tag is written.
- A tagged `###` heading with child lines: refuse ("Complete the items under this heading one by one"). Never toggle a whole block from the heading itself.
- Standalone report headings in BUGS.md-style files (Space Command appends "✅ RESOLVED"): leave them to Space Command; the plugin doesn't touch them.
- Ideas and principles ("Let Go") complete by striking the line through (`~~…~~`), with the tags left alone. Tasks are never struck.
- Read as done: a struck line, or a box and tag that disagree. A checked box with `#todo` means "complete the tag". Never "fix" a struck line.
- No date stamp, ever.

Other tag writes:

- Make a task from an idea: `#idea` → `#todo`, `#ideas` → `#todos`, in place.
- Set priority: replace the first `#pN` in place, drop any others, append when there's none. "None" removes them all. A priority inherited from the heading isn't on the line, so there's nothing to remove.
- Focus: append `#focus`; unfocus removes it.
- Snooze: append `#snooze`. Unsnooze removes *every* snooze tag on the line, `#future` and `#snoozed` included. They're never renamed, but they are removed.
- New tags are always appended at the end of the line.
- Convert line to task: `- [ ] text #todo`; under a tagged `###` heading, plain `- [ ] text`.

## Phase 0: Set up

- [x] Create branch `space-command` from `main` after committing this plan (2026-10-19).
- [ ] Point `install.sh -p` at a test vault only, so the branch build doesn't replace the working `warped-todo` in Bruce's daily vaults until 1.0.0.

## Phase 1: Decouple the kept helpers from the scanner

Three kept helpers reach through `TodoScanner`'s index to `TodoProcessor`. Make each work from the editor alone, so Phase 2 can delete both classes.

- [x] **Checkbox ↔ tag sync** (`main.ts:198`, the document `change` listener). Today it waits 100 ms, re-reads the whole file, finds the first `[x]` + `#todo` line, and calls `processor.completeTodo` through the scanner. Replace it with a CodeMirror extension (alongside `HeaderChecklistExtension`) that reacts to the checkbox toggle on the changed line and applies "Space Command's write rules" as an editor transaction (aliases kept, nothing under a tagged `###` gets a tag, struck lines untouched). Keep the existing uncheck-revert behaviour (`uncheckRevert.test.ts`), minus dates.
- [x] **Header sort** (`HeaderSortExtension.ts`). The button looks up the header in `scanner.getTodos()` and calls `processor.sortHeaderChildren`. Move the sort into a pure function over the header's child lines (priority from `#p0`–`#p4`/`#focus`), applied as one editor transaction on click. Add a "Sort block at cursor" command beside the button. Explicit only; no auto-sort.
- [x] **Move TODO to another file** (`main.ts:336`). Today it finds the item in the scanner and calls `processor.moveTodo`, which leaves `#moved @date` behind. New behaviour: cut the line (or the `###` block with its children) at the cursor and append it to the chosen file; nothing is left behind. Reuse `MoveTargetModal`. Pull the block-cutting logic out of `HeaderBlockMover.ts` (which today serves only repo-file completion) into a pure helper; drop its git-status gate and repo plumbing.
- [x] **Block model**: one pure helper that, given a document and a line, returns the block it belongs to (tagged heading + child lines, stopping at the next heading of any level: Space Command's TaggedLinesParser rule, confirmed by the commander 2026-10-19, replacing the earlier "same or higher level"). Sort, move, and all the Phase 5 block features use it.
- [x] Tests: the checkbox rule (every line shape above), the header sort, the block model and the block cut.

## Phase 2: Strip

`### Removed` in the 1.0.0 entry. Delete, then fix the build until `npm run build` and `npm test` pass.

**Done 2026-10-19 (0.57.0).** As in the table, plus: the Priority tags setting went too (Phase 5's vocabulary comes from `src/tags.ts`), and Hugo title links detect the vault-root config through the vault adapter, so the only Node APIs left are `path`/`electron` in the settings tab's file picker and `os` in `TeamManager`.

| Area | Files | Notes |
|---|---|---|
| Sidebar, Stats, tag cloud, focus mode | `SidebarView.ts`, `ContextMenuHandler.ts`, `src/shared/plugin/SidebarManager.ts`, `prototype/` | Also the ribbon and commands: Toggle TODO Sidebar, Refresh TODOs, Toggle Projects Tab |
| Todo subsystem | `TodoScanner.ts`, `TodoProcessor.ts`, `ProjectManager.ts` | After Phase 1 nothing kept depends on them. `inferredFileTag` goes with the scanner (closes the old TODO.md decision item) |
| Projects | `ProjectScanner.ts`, `ProjectSyncManager.ts`, `ProjectMetadata.ts`, `PlanParser.ts`, `StructuredFileParser.ts`, `ProjectItemMutator.ts`, `ProjectQueue.ts`, `SendToProjectModal.ts`, `ProjectsSidebarView.ts`, `HeaderBlockMover.ts` (after Phase 1 extracts the block cut) | Commands: Send selection to project, Sync Projects. Removes all `fs`/`child_process` use |
| Posts | `HugoScanner.ts`, `NewHugoPostModal.ts`, most of `HugoParser.ts` | Keep what `HugoTitleLinks.ts` uses (config `contentDir`, frontmatter `title`) |
| Snapshot | `ScanSnapshot.ts`, `buildScanSnapshot` in `main.ts` | Command: Export scan snapshot |
| Converters | `SlackConverter.ts`, `NotionConverter.ts`, `notionConverter.test.ts` | Commands and editor-menu items: Copy as Slack/Notion |
| Settings | settings tab in `main.ts`, `types.ts` | Drop: sidebar default, clickable links, completion date format, active TODOs limit, projects folders/base/depth/excludes/auto-open/sort, terminal/editor app, exclude-from-auto-tagging, focus queue limit/persist, default assignee. Keep: insert date format, tab lock buttons, resolve title links, team file path and Manage team file, priority tags (if Phase 5 uses it) |
| Shared | `utils.ts`, `styles.css`, tests in `src/__tests__/` | Drop everything only the removed files used; most of `styles.css` goes. Delete the tests for removed modules |
| Manifest | `manifest.json` | `isDesktopOnly` can become `false` once no Node APIs remain, except Phase 6's absolute path. Decide in Phase 7 |

Kept as-is: `TabLockManager.ts`, `HugoTitleLinks.ts`, `SlashCommandSuggest.ts`, `HeaderChecklistExtension.ts`, `MoveTargetModal.ts`, `HelpNoteManager.ts`, `src/shared/ui`. Reworked in later phases: `AtSuggest.ts`, `TeamManager.ts`.

Expected size: about 75% of the TypeScript and most of the CSS.

## Phase 3: Match Space Command's tag rules

`### Changed` in the 1.0.0 entry.

**Done 2026-10-19 (0.57.1).** The write functions live in `src/tags.ts` for Phase 5's commands to call; nothing new is wired to the editor yet. Two points follow Space Command's code over this plan's wording: Let Go *checks* an idea's box when it has one (`Mutator.complete`) and strikes only a line without one, and reopen unstrikes a struck line. `#principles` reads as a principle, as in `Tag.swift`.

- [x] Completion follows "Space Command's write rules": no date, aliases kept (`#todos` → `#todones`), box inserted on a plain bullet, ideas/principles struck rather than retagged, headings with children refused. The "Completion date format" setting and its custom-format field go.
- [x] Nothing writes `#moved` or `#today`; `/today` and `/tomorrow` still insert *dates* (authoring help, no meaning to Space Command).
- [x] Anything that snoozes writes `#snooze`; `#future`/`#snoozed` are recognized (e.g. for styling), never renamed, and removed only by unsnooze.
- [x] Recognize the full vocabulary in one place (`src/tags.ts`, new): `#todo`/`#todos`, `#todone`/`#todones`, `#idea`/`#ideas`/`#ideation`, `#principle`, `#focus`, `#p0`–`#p4`, `#snooze` (+ `#future`, `#snoozed` read aliases). Anything else is a project/category tag. Code-fence and inline-backtick tags are never items. This module mirrors Space Command's `README.md` › Tags and is what Phase 5 builds on.
- [x] `HeaderChecklistExtension` auto-checklist triggers on the same tag set (today it's `#todo(s)`/`#idea(s)` only; add `#ideation`, agreed with the commander).

## Phase 4: Handles in a visible team note

Bruce wants the handle list visible in the vault (question 4), so `team.md` stays, written only when you act.

**Done 2026-10-19 (0.58.0).** Mentions are read by `src/mentions.ts`, mirroring Space Command's `MentionExtractor.swift`: an `@` after `(` counts too, and handles are compared case-insensitively. "Task lines" are lines with an open or done task tag, plus the children of a tagged task heading. Default assignee had already gone in Phase 2.

- [x] Keep `TeamManager` reading `team.md` (path setting kept) and watching it for your own edits.
- [x] Remove the debounced background auto-add of unknown `@mentions` as you type (`flushPendingAdds`).
- [x] Handles reach `team.md` only on explicit action:
  - choosing "Add @handle to team" from the `@` suggest list when the typed handle is new, and
  - an **Update team note** command that gathers the `@handle`s used on task lines across the vault (files whose `metadataCache` tags include a task tag), using Space Command's exclusion rule (not emails, `@YYYY-MM-DD`, `@today`/`@tomorrow`/`@yesterday`), and appends the missing ones.
- [x] `AtSuggest` offers `team.md`'s handles first, then handles seen in the vault's tasks this session (gathered in memory from `metadataCache` on first `@`, no scan at load, no writes).
- [x] Default assignee setting goes (it served the sidebar's assignee filter).
- [x] `@` date suggestions stay as-is, with the insert-date format setting.
- [ ] Space Command ignores `team.md`; it gathers handles from the tasks it indexes. The commander records this note as the helper's handle list.

## Phase 5: Tag and block helpers (new)

`### Added` in the 1.0.0 entry. Everything here is an editor action on the current line, selection, or block; none of it scans.

**Done 2026-10-19 (0.59.0).** Commands live in `src/TagCommands.ts` over pure targeting in `src/lineOps.ts`; section children follow TaggedLinesParser (`blockOps.sectionChildren`: checkbox items at any depth, plain bullets at the outer level). Choices made in the build: a multi-line selection leaves headings out, so a block's priority isn't doubled onto its heading; Mark done on a tagged heading refuses and points at Complete all under heading (the other tag commands act on the heading's children); Convert line to task and Convert list to tasks are one command, Convert to tasks. `@handle` chips aren't coloured: Obsidian doesn't mark mentions, so that would need an editor extension.

Tags:

- [x] **Tag suggest on `#`**: the vocabulary from `src/tags.ts` first (with a one-word hint: "priority", "snooze", "focus"), then project tags already in the vault from `metadataCache.getTags()`.
- [x] **Commands and editor right-click entries** for the line under the cursor, each following "Space Command's write rules": Set priority › P0–P4 / none, Toggle focus, Toggle snooze, Mark done / reopen (Let Go for ideas and principles), Convert line to task, Make task from idea. Replaces today's editor menu, which only had the converters and Send to project.
- [x] **Tag styling**: CSS for the vocabulary tags in Live Preview/Reading view, copied from Space Command's `TagChip.colours` (`App/Sources/ItemRow.swift`) so the help pages, the app and Obsidian agree: `#p0` Terracotta, `#p1` Clay, `#p2` Amber, `#p3` Dim, `#p4` Faint, each as ink on a 14% tint; ideas Sage; snooze Dim on a dashed Faint chip; other tags and `@handles` Dim on Overlay; done lines Faint. Hex values from Space Command's `Palette`. Lean on Obsidian's `.tag[href="#p0"]` selectors; no editor extension needed.
- [x] **Tidy tags** command (explicit only): reorder the line's *trailing run* of tags in a canonical order (kind, priority, focus/snooze, project tags, handles) and collapse duplicates. Tags inside the sentence or in code spans stay where they are. Never renames an alias.

Blocks (question 11):

- [x] **Selection-wide tag ops**: the tag commands above apply to every task line in the selection, or to the children of the block at the cursor when the cursor is on a tagged heading. One editor transaction, so one undo. Replaces the sidebar tag cloud's bulk focus/snooze. Each line follows the per-line rule, so items under a tagged `###` never gain a kind tag.
- [x] **Progress on headings**: a read-only "3/7" beside a tagged heading in Live Preview, next to the sort button, counted with the "read as done" rule (checked box, `#todone`, or struck). It counts open and done task children, ideas excluded, the same way Space Command counts (confirmed by the commander). Never writes.
- [x] **Convert list to tasks**: turn the selected bullets (or plain lines) into tasks. Under a tagged `###` heading they become plain `- [x]`; elsewhere `- [x] … #todo`. Lines that are already tasks are left alone.
- [x] **Complete all under heading**: an explicit command (never a click on the heading) that completes each open **task** child by the per-line rule, in one transaction, and never touches the heading line. Children already done are skipped. Idea and principle children are left alone, so a mixed block doesn't get lines struck through unexpectedly (question 12). Checked with the commander: no conflict. Space Command refuses completion from the heading because the heading is only a label; the section counts as done when all its items are, so completing every child leaves exactly that state. Squash Done is app-side only and writes nothing.

## Phase 6: Switching between the apps (new)

Jumping to a line is the weak spot today (`obsidian://open` has no line without Advanced URI), so both directions carry a 1-based line and the handler is ours.

- [ ] **Open in Space Command**: command, editor menu item, optional ribbon icon. Opens `spacecommand://reveal?path=<percent-encoded absolute path>&line=<1-based>` (line omitted when there's no cursor). A plugin can't tell whether Space Command is installed, so the command always shows; a setting hides it, and when no app handles the URL, macOS says so. The absolute path comes from the vault adapter's base path, so this part stays desktop-only.
- [ ] **Open at line from Space Command**: `registerObsidianProtocolHandler("space-command", …)` taking `vault` (so Obsidian routes the action to the right vault window; without it a custom action goes to the last-focused vault), `path` (vault-relative; an absolute path is accepted too) and a 1-based `line`. Opens the file, puts the cursor on the line, and scrolls it to the centre. Check the `vault=` routing against Obsidian's protocol-handler docs before building.
- [ ] **Better line landing**, agreed with the commander and written into obsidian-command.md. Both URLs carry `text=` alongside `line=`, and optionally `heading=`. Space Command sends the same values and accepts them on `spacecommand://reveal`.
  - `text` is the item's *normalised* text, matching Space Command's anchor (`Model/Anchor.swift`, `ItemText.normalized`): the line without the list marker, the box, the vocabulary/state tags and stamps, trimmed. The plugin normalises candidate lines the same way, in `src/tags.ts`.
  - Landing order: the given line if its normalised text matches; otherwise the matching line nearest the given line, with `heading=` (the section heading) breaking ties; no match → the given line, clamped to the file.
  - Then briefly highlight the line (a CodeMirror line decoration that fades).
  - "Open in Space Command" sends the cursor line's normalised text and section heading the same way.
- [ ] Space Command side (commander's work, approved): the URL scheme, passing `line` (and `text`) to the plugin's handler when it detects the plugin (read-only: `<vault>/.obsidian/plugins/space-command/manifest.json` and the id in `.obsidian/community-plugins.json`), falling back to `obsidian://open`.

## Phase 7 (later): Rename, docs, distribution, merge

You said docs come after the code. This phase is where the rebrand lands in one go.

- [ ] Plugin id `warped-todo` → `space-command`, name "␣⌘ Space Command for Obsidian", version 1.0.0. Update `install.sh` (and remove the old `warped-todo` folder it installed).
- [ ] Rewrite `README.md`, `CLAUDE.md`, `DESIGN.md` (largely deleted), `plugin-conventions.md`, `TROUBLESHOOTING.md`, `CONTRIBUTING.md`; archive `CHANGELOG.md`'s pre-cut history; empty `BUGS.md`.
- [ ] Help note rewritten to point at Space Command; created once on first install only (already the rule), and through Settings › Help on demand.
- [ ] Notice/branding in `src/shared/ui`: keep `␣⌘`, rename CSS prefixes as part of the styles purge.
- [ ] Release zip (`main.js`, `manifest.json`, `styles.css`) with one-step-per-line install instructions; a page and link on space-command.ca (Space Command side).
- [ ] Merge `space-command` into `main`; push only when Bruce asks.
- [ ] Hand the result back to the commander so obsidian-command.md and Space Command's PLAN.md get ticked.

## What stays, at a glance

- Slash commands: `/todo`, `/todos`, `/idea`, `/ideas`, `/today`, `/tomorrow`, `/callout`
- `@` suggest: dates (with insert-date format) and handles from `team.md` and the vault's tasks
- Quick Add TODO (`Mod+Shift+A`)
- Header auto-checklist, header sort button and command
- Checkbox ↔ `#todo`/`#todone` sync, Space Command's rule
- Move TODO line or `###` block to another file
- Tab lock, title-based wiki links
- Help note
- New: tag suggest, tag commands and menu, tag styling, tidy tags, selection-wide tag ops, heading progress, convert list to tasks, complete all under heading, open in Space Command, open-at-line handler

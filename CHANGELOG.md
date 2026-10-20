# Changelog

All notable changes to ␣⌘ Space Command for Obsidian. History from before 1.0.0, when the plugin was Warped Command, is in [CHANGELOG-ARCHIVE.md](CHANGELOG-ARCHIVE.md).

## [1.0.0] - Unreleased

Built on the `space-command` branch; see PLAN.md. Filled in phase by phase.
Branch test builds carry their own 0.x numbers (Phase 1 is 0.56.0,
Phase 2 is 0.57.0, Phase 3 is 0.57.1, Phase 4 is 0.58.0, Phase 5 is 0.59.0, Phase 6 is 0.60.0, the rename is 1.0.0; 0.59.1 and 0.59.2 are fixes).

### Removed

- The sidebar and everything in it: the TODOs, Ideas, Projects and Posts
  tabs, the tag cloud, Focus Mode, Stats and the About modal, the
  right-click item menu, and the ribbon icon. Commands removed with it:
  Toggle TODO Sidebar, Refresh TODOs, Toggle Projects Tab.
- The vault scanner and its background writes. Nothing rewrites a note on
  change any more: no auto-added `#todone @date`, `#moved` stamps, or
  `#todo` cleanup, and no file-name project tags. Space Command does the
  finding and tracking.
- Projects: the repo scan, project-note sync, PLAN.md summaries, repo-file
  mutations, and the Send selection to project and Sync Projects
  commands. All Node `fs`/`child_process` use goes with it.
- Hugo Posts and New post. Title-based wiki links stay, and now find the
  vault-root Hugo config through the vault adapter instead of Node `fs`.
- The Export scan snapshot command.
- Copy as Slack and Copy as Notion (commands, hotkeys and editor menu
  items). Slack lives on as Space Command's Clipboard transform.
- Settings: Show sidebar by default, Make links clickable, Completion date
  format, Active TODOs limit, Default projects folder, Exclude folders
  from auto-tagging, Priority tags, every Projects and Posts setting,
  Focus Mode's queue limit and persistence, and Default assignee. Dropped
  keys fall out of `data.json` on the next save.
- The background auto-add of unknown `@mentions` to the team note. It's
  written only when you ask (see Added).
- About 2,200 lines of sidebar CSS.

### Changed

- Renamed to ␣⌘ Space Command for Obsidian. The plugin id is now
  `space-command` (was `warped-todo`), so Obsidian treats it as a new plugin
  and settings start fresh. The repo is `space-command-obsidian`, and CSS
  classes use the `space-command-` prefix.
- `./install.sh` removes the old `warped-todo` folder from each vault and
  switches its entry in `community-plugins.json` to `space-command`.
- The help note is now `Space Command Help.md`, rewritten for writing tasks
  for Space Command instead of the old sidebar.
- Checkbox ↔ tag sync is now a CodeMirror transaction filter, following
  Space Command's write rules (`src/tags.ts`). The tag change rides on
  the toggle in one transaction, so a single undo reverts both. Aliases
  keep their form (`#todos` ↔ `#todones`). No date stamp is written; a
  legacy `@date` directly after `#todone` is dropped on reopen. A box
  under a tagged heading toggles only, struck lines are left alone, and
  idea/principle lines write nothing. Only single-line edits trigger it,
  so opening a file or an external write never does.
- Header sort works from the editor alone (no vault scan). It applies as
  one transaction and orders open before done, then `#focus`,
  `#p0`–`#p4`, unprioritized and snoozed. It sorts each run of list items
  on its own, with sub-items kept under their parent. It no longer
  reverses on a second press.
- Move TODO to another file cuts the line, with its indented sub-items,
  or a tagged heading's whole block, and appends it to the chosen file.
  Nothing is left behind (no `#moved @date`). A child leaving a tagged
  heading gains the heading's kind tag (`#todo`, `#todone`, `#idea` or
  `#principle`). It also works on idea and principle lines.
- Sections follow Space Command's rule: a heading at any level carrying
  an open kind tag starts one, a done heading doesn't, and the next
  heading of any level ends it (`src/blocks.ts`).
- Tags are read Space Command's way (`src/tags.ts`, mirroring its
  `TagExtractor`): a `#` at the start of a line or after a space, so
  `a#b` and URL fragments aren't tags; `#123` is an issue number, not a
  tag; nested tags like `#area/sub` read whole; and tags in code spans
  of any backtick count are skipped. `#principles` reads as a principle.
- A line tagged both `#todo` and `#idea` reads as an idea, as in Space
  Command (idea over principle over task), so Mark done strikes it
  through rather than renaming `#todo`.
- Completion renames every `#todo` on the line and keeps the tag's case
  (`#TODO` → `#TODONE`).
- `src/tags.ts` now holds the full vocabulary and every write rule the
  editor commands will use: Let Go for ideas and principles (a box is
  checked; a line without one is struck through, tags left outside),
  reopen (unchecks, renames back, unstrikes), set priority, focus,
  snooze (always `#snooze`; unsnooze removes `#future` and `#snoozed`
  too), make task from idea, and convert line to task. New tags go
  before trailing whitespace, so a hard break stays one.
- The header auto-checklist also triggers on `#ideation` headings, and
  ignores tags in code spans.
- The help note no longer says completion writes a date.
- The help note is created only when you ask, from Settings › Help ›
  Create help note (Open help note once it exists). Nothing is created
  or opened on install, and the "help note seen" setting is gone.

### Added

- **Sort block at cursor** command, beside the header sort button.
- **Update team note** command: appends the `@handle`s used on the
  vault's task lines that the team note doesn't list yet.
- **Add @handle to team** in the `@` suggest list, offered when the typed
  handle isn't in the team note.
- The `@` suggest list also offers handles seen on the vault's task lines,
  after the team note's own, gathered on the first `@` of the session.
  Mentions follow Space Command's rule: an `@` at line start, after a
  space or after `(`, so emails and `@2026-10-17` aren't handles.
- **Tag commands**, in the command palette and the editor's right-click
  menu, each following Space Command's write rules: Mark done / reopen
  (Let Go for ideas and principles), Toggle focus, Toggle snooze, Set
  priority P0–P4 (a Priority submenu in the right-click menu), Remove
  priority, Convert to tasks, Make task from idea, and Tidy tags. They
  act on the cursor's line, on every item in a selection, or on a
  tagged heading's children when the cursor is on the heading (except
  Mark done, which refuses there and points at Complete all under
  heading). Each run
  is one edit, so one undo. A toggle over several lines goes one way
  for all: on when any line is off.
- **Tidy tags** reorders the trailing run of tags and `@handle`s (kind,
  priority, focus/snooze, project tags, handles) and drops repeats.
  Tags inside the sentence or in code spans stay put; nothing is renamed.
- **Convert to tasks** takes a line or a selected list: `- [ ] … #todo`,
  or plain `- [ ]` under a tagged heading. Lines that are already items
  are left alone.
- **Complete all under heading** completes each open task under the
  tagged heading at the cursor, in one edit. The heading line, ideas,
  principles and done items are left alone.
- **Tag suggest on `#`**: Space Command's tags first, each with a hint
  ("priority", "snooze", "focus"), then the vault's other tags by use.
  It takes over from Obsidian's own tag suggest.
- **Progress on headings**: a read-only "3/7" beside a tagged heading in
  Live Preview, counting its task items the way Space Command does
  (ideas and snoozed items left out; checked, `#todone` or struck is
  done). Items under a heading follow Space Command's rule: checkbox
  items at any depth, plain bullets at the outer level only.
- **Tag colours** from Space Command's palette in Live Preview and
  Reading view: `#p0` Terracotta, `#p1` Clay, `#p2` Amber, `#p3` Dim,
  `#p4` Faint, ideas Sage, snooze on a dashed chip, other tags Dim, and
  tags on checked lines Faint.
- **Open in Space Command**: a command and editor menu item (and an
  optional ribbon icon) that open `spacecommand://reveal` for the note,
  with the cursor's line, its item text and its section heading. A
  setting hides it when Space Command isn't installed.
- **Open at a line from Space Command**: `obsidian://space-command` with
  `vault`, `path` (vault-relative or absolute), a 1-based `line`, and
  optionally `text` and `heading`. It opens the note (reusing a tab that
  shows it), lands on the item and flashes the line. When the item has
  moved, it finds the line whose text matches nearest the given line,
  the heading breaking ties, normalising text the way Space Command's
  anchors do (no list marker, box, tags, date stamps or `~~`).

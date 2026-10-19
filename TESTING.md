# Testing

Hand checks for Bruce, done at his own pace, with results recorded here for later sessions. Each test has its own number (W1, W2, …). The W keeps them apart from Space Command's T numbers in its `TESTING.md`.

How to run a test:

1. Run `./install.sh` (or `./install.sh -p`) to build and install into a test vault, and reload Obsidian.
2. Check that Settings › Community plugins shows the version the test names, or a later one.
3. Follow the test's steps in a scratch note.
4. Write what happened on its Result line, and tick it.

A bug goes in `BUGS.md`. A question about Space Command's rules goes to the commander. The round trip between the apps is Space Command's T15, so it isn't repeated here.

### Hand tests #todo

- [ ] W1. Nothing writes in the background (0.57.0).
    1. Open a few notes with `#todo` lines, edit one of them, and switch between notes.
    2. Run `git status` (or check the files' mtimes) in the vault.
    3. Only the note you edited should have changed. Nothing should add `@date`, `#moved` or project tags.
    Result:
- [ ] W2. Checkbox ↔ tag sync (0.57.0).
    1. On `- [ ] Buy milk #todo`, click the box: it should become `- [x] Buy milk #todone`, with no date.
    2. Press Cmd+Z once: both the box and the tag should revert.
    3. Repeat with `#todos`: it should become `#todones`.
    4. Under a `### Errands #todo` heading, tick a plain `- [ ] eggs`: only the box changes.
    5. Tick a box on an `#idea` line: no tag is written.
    Result:
- [ ] W3. Slash and @ suggest (0.58.0).
    1. At the start of a line, type `/todo`, `/idea`, `/today` and `/callout` and pick each one.
    2. Type `@tod`: `@today` should be offered and insert the date in your format.
    3. Type `@` and a handle from `team.md`, then one that isn't there: the second should offer **Add @handle to team**.
    4. Check that an email address and `@2026-10-17` aren't treated as handles.
    Result:
- [ ] W4. Update team note (0.58.0).
    1. Put a new `@handle` on a task line somewhere in the vault.
    2. Run **Update team note**: it should append that handle to `team.md`, and nothing else.
    Result:
- [ ] W5. Tag suggest and colours (0.59.0).
    1. Type `#p`: Space Command's tags come first with hints ("priority"), then the vault's own tags.
    2. In Live Preview, check that `#focus`, `#p0`–`#p4` and `#snooze` are coloured.
    Result:
- [ ] W6. Tag commands on one line (0.59.0). From the command palette, then from the right-click menu:
    1. **Mark done / reopen** on a task, then on an `#idea` (it should strike the line through, leaving the tags outside).
    2. **Toggle focus**, **Toggle snooze** (writes `#snooze`; turning it off also removes `#future`/`#snoozed`).
    3. **Set priority** from the Priority submenu, then **Remove priority**.
    4. **Make task from idea**.
    5. Undo each one: one Cmd+Z per command.
    Result:
- [ ] W7. Tag commands over a selection and a heading (0.59.0).
    1. Select three task lines, one already focused, and run **Toggle focus**: all three should end up focused.
    2. Put the cursor on a tagged heading and run **Set priority P1**: its children get it, not the heading.
    3. Run **Mark done** on a heading: it should refuse and point you at Complete all under heading.
    Result:
- [ ] W8. Tidy tags (0.59.0).
    1. On `- [ ] Call #client @sam #p1 #todo #p1`, run **Tidy tags**: it should become `#todo #p1 #client @sam`, with the repeat gone.
    2. A tag in the middle of the sentence or in backticks stays where it is.
    Result:
- [ ] W9. Convert to tasks and Complete all under heading (0.59.0).
    1. Select a plain bullet list and run **Convert to tasks**: each line becomes `- [ ] … #todo`. Under a tagged heading, each becomes a plain `- [ ]`.
    2. Under a `### Trip #todo` heading with tasks, an idea and a done item, run **Complete all under heading**: only the open tasks complete, in one undo.
    Result:
- [ ] W10. Heading progress (0.59.0).
    1. In Live Preview, a tagged heading shows a count like "2/5" beside it.
    2. Tick an item: the count updates. Add an idea or a snoozed task: the count shouldn't change.
    Result:
- [ ] W11. Header sort and Sort block at cursor (0.57.0, 0.59.0).
    1. Under a tagged heading, mix done, `#focus`, `#p2`, unprioritized and snoozed items, with sub-items.
    2. Press the header sort button: open before done, then focus, P0–P4, unprioritized, snoozed. Sub-items stay under their parents.
    3. Press it again: the order shouldn't flip.
    4. Run **Sort block at cursor**: same result.
    Result:
- [ ] W12. Move TODO to another file (0.57.0).
    1. On a task with sub-items, run **Move TODO to another file** and pick a note: the line and its sub-items move, and nothing is left behind.
    2. Move a child out from under a `### … #todo` heading: it should gain `#todo`.
    3. Move a whole tagged heading block.
    Result:
- [ ] W13. Quick Add, tab lock and title links.
    1. Press Cmd+Shift+A, add a TODO, and check where it lands.
    2. Lock a tab, then click a link in it: the link should open in a new tab.
    3. In a Hugo vault, `[[Page Title]]` should resolve to the note whose front-matter title matches.
    Result:
- [ ] W14. Open in Space Command (0.60.0).
    1. Put the cursor on a task and run **Open in Space Command** (command, editor menu, or ribbon if it's on): Space Command's panel should show that task.
    2. With the setting off, the command and menu item should be hidden.
    3. A link from Space Command should land on the task, briefly highlighted, even after you've moved the line a few rows. (Space Command's T15 covers the full round trip.)
    Result:
- [ ] W15. Help note (0.59.2).
    1. A fresh install creates no note and opens nothing.
    2. Settings › Help › Create help note makes it. After that the button reads Open help note.
    Result:

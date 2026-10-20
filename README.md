# ␣⌘ Space Command for Obsidian

![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Platform: Desktop only](https://img.shields.io/badge/platform-desktop--only-lightgrey)
![Obsidian: 1.14+](https://img.shields.io/badge/obsidian-1.14%2B-7c3aed)

Write tasks in your vault for [Space Command](https://space-command.ca). Space Command finds, tracks and completes the `#todo`, `#idea` and `#principle` lines across your notes and repos. This plugin is the other half: it helps you write those lines in Obsidian, with the same tag rules, so the two apps never disagree about a file.

- **Tags as you type.** `/todo`, `@today`, `#focus`: suggestions for Space Command's tags, dates and the handles in your team note.
- **Checkboxes that mean something.** Tick a box and `#todo` becomes `#todone` in place, the way Space Command writes it.
- **Tag commands.** Done, focus, snooze, priority and tidy tags, on a line, a selection or a whole heading, from the right-click menu.
- **Blocks.** Tag a heading once and the list under it is a block you can sort, count, complete or move.
- **Switch apps at the line.** Open the task under your cursor in Space Command, and land on the right line when Space Command sends you back.

The plugin doesn't scan your vault or keep a list. It only writes when you act in the editor, never in the background.

## Contents

- [Install](#install)
- [Writing tasks](#writing-tasks)
- [Suggestions as you type](#suggestions-as-you-type)
- [Tag commands](#tag-commands)
- [Blocks under a heading](#blocks-under-a-heading)
- [Switching between the apps](#switching-between-the-apps)
- [Team note](#team-note)
- [Other features](#other-features)
- [Commands](#commands)
- [Settings](#settings)
- [Upgrading from Warped Command](#upgrading-from-warped-command)
- [Changelog, contributing and licence](#changelog-contributing-and-licence)

## Install

You need Obsidian 1.14 or later, on desktop. Space Command is optional, but most of the point.

### From the release zip

1. Download the zip from [space-command.ca](https://space-command.ca).
2. Unzip it. You get a `space-command` folder with `main.js`, `manifest.json` and `styles.css`.
3. Move that folder into `<vault>/.obsidian/plugins/`.
4. In Obsidian, open Settings › Community plugins.
5. Turn on "␣⌘ Space Command for Obsidian".

### From source

```bash
git clone git@github.com:robotpony/space-command-obsidian.git
cd space-command-obsidian
npm install
./install.sh
```

`install.sh` builds the plugin and asks which vaults to install it into. `./install.sh -p` reinstalls to the same vaults without asking, and `./install.sh -d 8` searches deeper for nested vaults.

To install by hand instead, run `npm run build` and copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/space-command/`.

Having trouble? See [Troubleshooting](TROUBLESHOOTING.md).

## Writing tasks

Put a tag on any line:

```markdown
- [ ] Review the API spec #todo
- [ ] Ship the release notes #todo #focus #p1
A lighter onboarding flow for repeat users #idea
Prefer plain text over clever formats #principle
```

| Tag | Meaning |
|---|---|
| `#todo` / `#todos` | A task (`#todone` / `#todones` once done) |
| `#idea` / `#ideas` / `#ideation` | An idea, not yet a task |
| `#principle` / `#principles` | A guiding principle |
| `#focus` | The thing to do next |
| `#p0`–`#p4` | Priority, `#p0` highest |
| `#snooze` | Not now (`#future` and `#snoozed` are read the same way) |

Any other tag is a project or topic, and `@handle` assigns a task to someone.

To tag a group of tasks once, tag the heading. Every list item under it, up to the next heading of any level, belongs to it:

```markdown
### Standup notes #todos
- [ ] Check token refresh logic @sarah #p1
- [ ] Write a regression test once the fix lands
```

Press Enter at the end of a tagged heading and you get a checklist item to fill in.

### Completing a task

Click the box. The plugin follows Space Command's rules:

- `- [ ] text #todo` becomes `- [x] text #todone`, in place. `#todos` becomes `#todones`, and the case is kept (`#TODO` → `#TODONE`).
- A box under a tagged heading only toggles: the heading carries the tag.
- Unticking reverses it.
- No date is ever stamped.
- The box and the tag change in one edit, so one undo reverts both.

Ideas and principles are finished by striking the line through, which **Mark done / reopen** does for you (see [Tag commands](#tag-commands)).

## Suggestions as you type

### `/` at the start of a line

| Command | Inserts |
|---|---|
| `/todo` | `- [ ] #todo ` |
| `/todos` | A `#todos` heading and a blank item |
| `/idea` | `- [ ] #idea ` |
| `/ideas` | An `#ideas` heading and a blank item |
| `/today`, `/tomorrow` | The date, in your insert format |
| `/callout` | An Obsidian callout block |

### `@` anywhere

`@today`, `@tomorrow` and `@yesterday` insert the date, in the "Insert date format" setting (default `dddd, MMMM Do`, like "Tuesday, July 10th"). Other names come from your [team note](#team-note), and a handle that isn't there yet offers **Add @handle to team**. An email address and `@2026-10-17` aren't treated as handles.

### `#` after a space

Space Command's tags come first, each with a short hint ("priority", "snooze"), then the other tags in your vault, most used first. In Live Preview and Reading view, priority, idea and snooze tags are coloured the way Space Command colours them.

## Tag commands

Right-click in the editor, or use the command palette. Each command works on the line at the cursor, on every task or idea in a selection, or, on a tagged heading, on the items under it. One undo reverts the whole command.

| Command | What it does |
|---|---|
| Mark done / reopen | Completes or reopens a task. Strikes an idea or principle through, or un-strikes it. On a tagged heading it refuses; use Complete all under heading |
| Toggle focus | Adds or removes `#focus` |
| Toggle snooze | Adds `#snooze`, or removes every snooze tag (`#snooze`, `#snoozed`, `#future`) |
| Priority › P0–P4 | Replaces the line's priority, or adds one |
| Remove priority | Removes `#p0`–`#p4` |
| Make task from idea | `#idea` → `#todo`, `#ideas` → `#todos`, in place |
| Convert to tasks | Turns plain lines or bullets into `- [ ] … #todo`. Under a tagged heading they become plain `- [ ]` items |
| Tidy tags | Reorders the tags at the end of the line (kind, priority, focus or snooze, projects, handles) and drops repeats. Tags inside the sentence or in backticks stay put |

New tags always go at the end of the line, and existing ones are renamed where they are.

## Blocks under a heading

A tagged heading and the lines under it make a block:

- **Progress.** In Live Preview, the heading shows how many of its tasks are done, like `2/5`. Ideas and snoozed tasks don't count.
- **Sort.** The sort button beside the heading, or **Sort block at cursor**, orders the items: open before done, then focus, P0–P4, no priority, snoozed. Sub-items stay with their parents. It only runs when you ask.
- **Complete all under heading** completes the open tasks in the block, and leaves ideas and principles alone.
- **Move TODO to another file** cuts the line at the cursor, with its sub-items, or a whole tagged heading block, and appends it to a note you pick. Nothing is left behind. A task moved out from under a tagged heading gains `#todo`, so it's still a task.

## Switching between the apps

**Open in Space Command**, from the command palette, the editor's right-click menu or an optional ribbon icon, shows the task under your cursor in Space Command.

Going the other way, Space Command opens notes with an `obsidian://space-command` link carrying the note, the line and the item's text. The plugin opens the note and lands on the item, even if it has moved a few lines since, then flashes the line briefly.

Neither direction writes anything. If you don't use Space Command, turn off "Show Open in Space Command" in Settings to hide the command and menu item.

## Team note

Handles live in a vault note, `team.md` by default (set the path in Settings › Team):

```markdown
- @bruce — Bruce Alderson (me)
- @eric.m — Eric Mitchell
- @dana — Dana Park
```

Mark yourself with `(me)`. The plugin reads the note on load and whenever you edit it. It only writes to it when you ask: **Add @handle to team** in the `@` suggestions, or the **Update team note** command, which adds every handle used on a task line in the vault that isn't listed yet. If the note doesn't exist, Settings › Team offers to create one.

## Other features

- **Quick Add TODO** (`Cmd/Ctrl+Shift+A`) starts a `- [ ] #todo ` item on an empty line, or adds `#todo` to the end of the current one.
- **Tab lock** adds a padlock to Obsidian's tab headers. A locked tab opens the links you click in a new tab. Turn it on in Settings › Editor.
- **Title links in a Hugo vault.** If the vault is a Hugo site and its pages link by title (`[[Cherry tomato and garlic spaghetti]]` for `cherry-tomato-and-garlic-spaghetti.md`), the plugin resolves those links by each page's front-matter `title`, so clicking, hover preview, backlinks and the graph all work. Files are never changed. Turn it off with "Resolve wiki links by page title".
- **Help note.** Settings › Help › Create help note makes `Space Command Help.md`, a note of live examples to try. It's created only when you ask, and never rewritten.

## Commands

| Command | Default hotkey |
|---|---|
| Quick Add TODO | `Cmd/Ctrl+Shift+A` |
| Mark done / reopen | — |
| Toggle focus | — |
| Toggle snooze | — |
| Set priority: P0 … P4 | — |
| Remove priority | — |
| Make task from idea | — |
| Convert to tasks | — |
| Tidy tags | — |
| Complete all under heading | — |
| Sort block at cursor | — |
| Move TODO to another file | — |
| Open in Space Command | — |
| Update team note | — |

Set your own hotkeys in Settings › Hotkeys.

## Settings

| Section | Setting | Default |
|---|---|---|
| Editor | Insert date format, used by `@today` and `/today` | `dddd, MMMM Do` |
| Editor | Show tab lock buttons | Off |
| Editor | Resolve wiki links by page title (Hugo vaults) | On |
| Space Command | Show Open in Space Command | On |
| Space Command | Ribbon icon | Off |
| Team | Team file path | `team.md` |

## Upgrading from Warped Command

This plugin used to be Warped Command, with a sidebar, Projects, Posts and a vault scanner. Space Command does all of that now, so 1.0.0 drops them and keeps the writing tools. The full list is in the [changelog](CHANGELOG.md).

The plugin id changed from `warped-todo` to `space-command`, so Obsidian sees a new plugin:

- `./install.sh` removes the old `warped-todo` folder and switches it on under the new id. If you install by hand, delete `<vault>/.obsidian/plugins/warped-todo/` yourself and turn the new plugin on.
- Settings start fresh. Your team note is untouched, but if it isn't at `team.md`, set its path again.
- The old help note, `Warped Command Help.md`, is yours to keep or delete.

## Changelog, contributing and licence

Every change is in [CHANGELOG.md](CHANGELOG.md); history before 1.0.0 is in [CHANGELOG-ARCHIVE.md](CHANGELOG-ARCHIVE.md). Found a bug? [Open an issue](https://github.com/robotpony/space-command-obsidian/issues). See [CONTRIBUTING.md](CONTRIBUTING.md) to help.

MIT, see [LICENSE](LICENSE).

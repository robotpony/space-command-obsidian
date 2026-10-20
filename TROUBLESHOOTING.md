# Troubleshooting

See the [README](README.md) for what the plugin does and how to install it. This page covers what to do when something isn't working.

**Ticking a box didn't change the tag.**
That's on purpose in three cases. A box under a tagged heading only toggles, because the heading carries the tag. A box on an idea or principle writes no tag; use **Mark done / reopen** to strike it through. A struck-through line is already done and is left alone.

**A tag command says "Nothing to change."**
Tag commands act on lines with a task, idea or principle tag, or on the items under a tagged heading. Put the cursor on one, or select the lines. **Convert to tasks** is the one that works on plain lines. **Move TODO to another file** says "Cursor isn't on a TODO, idea, or tagged heading." for the same reason.

**Mark done refuses on a heading.**
A whole block is never completed from its heading, so ideas under it don't get struck by accident. Complete the items one by one, or run **Complete all under heading**, which completes the open tasks only.

**Open in Space Command does nothing, or says it couldn't open Space Command.**
Check that Space Command is installed and has been opened at least once, so macOS knows its `spacecommand://` links. If you don't use Space Command, turn off Settings › Space Command › "Show Open in Space Command".

**A link from Space Command opens the note but not the right line.**
The plugin lands on the line whose text matches the item, nearest to where Space Command last saw it. If the item's text changed too, it falls back to the line number. Check that you're on Space Command 0.72.0 or later.

**`[[Page Title]]` links in my Hugo vault still show as unresolved.**
Title links only work when the vault's own root is the Hugo site, with `hugo.toml`, `config.yaml` or similar there or under `config/_default/`. The page must sit under the site's `contentDir` and have a `title` in its front matter. Check that "Resolve wiki links by page title" is on.

**My handles aren't suggested after `@`.**
Check Settings › Team › "Team file path" points at your team note, and that each line looks like `- @handle — Name`.

**The plugin isn't available on my phone.**
It's desktop only. Switching to Space Command needs the Mac app, and the vault's path on disk.

**I upgraded from Warped Command and my settings are gone.**
Expected: the plugin id changed from `warped-todo` to `space-command`, so Obsidian treats it as a new plugin. Set the team file path again if yours isn't `team.md`. If the old Warped Command is still listed under Community plugins, delete `<vault>/.obsidian/plugins/warped-todo/`. See [Upgrading from Warped Command](README.md#upgrading-from-warped-command).

**Still stuck?**
[Open an issue](https://github.com/robotpony/space-command-obsidian/issues) with your plugin version (Settings › Community plugins), Obsidian version, and steps to reproduce.

## Known limitations

- **Desktop only.**
- **Not in Obsidian's Community Plugins list.** Install from the zip on [space-command.ca](https://space-command.ca), or from source.
- **No list of your tasks in Obsidian.** That's Space Command's job; this plugin doesn't scan the vault.

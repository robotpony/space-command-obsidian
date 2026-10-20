import { App, TFile } from "obsidian";

/** Fixed vault-root path for the help note. Not user-configurable
 * (unlike teamFilePath) — it's plugin-authored seed content, not something
 * that needs pointing at an existing file. */
export const HELP_NOTE_PATH = "Space Command Help.md";

function buildHelpNoteContent(): string {
  return `> [!warning] Live example
> This note is a live example, not documentation. Everything below works exactly like it would in any other note in your vault. Try it.

## Complete a task

Click the checkbox. The plugin rewrites the tag in place to \`#todone\`, and
Space Command sees it as done.

- [ ] Try checking this box #todo

## Tag a group of tasks

Tag a heading with \`#todos\` and skip tagging each line underneath. Press
Enter at the end of the heading and you get a checklist to fill in. The
heading shows how many are done.

## Standup notes #todos
- [ ] First task in the group
- [ ] Second task in the group

## Capture an idea

\`#idea\` works the same way. Right-click it and choose "Make task from idea"
when it's ready to become a task.

Worth trying: a lighter onboarding flow for repeat users. #idea

## Set priority and focus

Add \`#focus\` to put something at the top of Space Command's queue, or
\`#p0\`–\`#p4\` for a priority tier. Right-click a line for the same
choices, plus snooze and tidy tags.

- [ ] Ship the thing #todo #focus

## Write faster

- Type \`/\` at the start of a line for \`/todo\`, \`/idea\`, \`/today\`, and callouts.
- Type \`@\` for dates (\`@today\`, \`@tomorrow\`) and the handles in your team note.
- Type \`#\` for the tags Space Command knows.

## Where to go next

Run "Open in Space Command" from the command palette to see this line in
Space Command. For everything else, see the
[full README](https://github.com/robotpony/space-command-obsidian/blob/main/README.md).

---

This note is yours now. Delete it, edit it, or leave it as a running
scratchpad. The plugin never overwrites it, and won't bring it back if you
delete it. To get a fresh copy, use Settings → Help → "Create help note".
`;
}

/** The help note, created only from Settings → Help, never on install or
 * load. Content is written once, on creation, and never rewritten — see the
 * note's own closing paragraph. Opening it again recreates it if deleted. */
export class HelpNoteManager {
  constructor(private app: App) {}

  /** Returns the existing help note, or creates it with seed content if missing. */
  async ensureNoteExists(): Promise<TFile> {
    const existing = this.app.vault.getAbstractFileByPath(HELP_NOTE_PATH);
    if (existing instanceof TFile) return existing;
    return this.app.vault.create(HELP_NOTE_PATH, buildHelpNoteContent());
  }

  /** Creates the note if needed, then opens it in the active leaf. */
  async open(): Promise<void> {
    const file = await this.ensureNoteExists();
    await this.app.workspace.getLeaf(false).openFile(file);
  }
}

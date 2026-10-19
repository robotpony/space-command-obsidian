import { App, TFile } from "obsidian";

/** Fixed vault-root path for the first-use help note. Not user-configurable
 * (unlike teamFilePath) — it's plugin-authored seed content, not something
 * that needs pointing at an existing file. */
export const HELP_NOTE_PATH = "Warped Command Help.md";

/** First two dot-separated segments of a semver-ish string, e.g. "0.46.0" -> "0.46".
 * This project keeps major reserved at 0 (see CLAUDE.md's versioning rules) and bumps
 * minor for new/removed capability, so major.minor together is the segment that actually
 * tracks "something changed worth knowing about." */
export function majorMinor(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

function buildHelpNoteContent(): string {
  return `> [!warning] Live example
> This note is a live example, not documentation. Everything below works exactly like it would in any other note in your vault. Try it.

## Complete a task

Click the checkbox. The plugin rewrites the tag in place to \`#todone\`.

- [ ] Try checking this box #todo

## Tag a group of tasks

Tag a heading with \`#todos\` and skip tagging each line underneath. All of
them show up together in the sidebar, under that heading.

## Standup notes #todos
- [ ] First task in the group
- [ ] Second task in the group

## Capture an idea

\`#idea\` works the same way, but lives in its own tab.

Worth trying: a lighter onboarding flow for repeat users. #idea

## Set priority and focus

Add \`#focus\` to put something at the top of the queue, or \`#p0\`–\`#p4\` for a
priority tier.

- [ ] Ship the thing #todo #focus

## Where to go next

Open the sidebar with \`Cmd/Ctrl+Shift+T\` if it isn't already open. For
everything else, including Projects, mentions, header TODOs, and editor
shortcuts, see the [full README](https://github.com/robotpony/warped-command/blob/main/README.md).

---

This note is yours now. Delete it, edit it, or leave it as a running
scratchpad. Warped Command never overwrites it, and won't bring it back
if you delete it. To get a fresh copy, use Settings → Help → "Show
onboarding doc again".
`;
}

/** Creates and reveals the first-use help note. Content is written once, on
 * creation, and never rewritten — see the note's own closing paragraph.
 * Auto-revealed only on first install (settings.helpNoteLastSeenVersion
 * empty); after that only the Settings button calls open(), which recreates
 * the note if the user deleted it. */
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

import { App, TFile, Events } from "obsidian";
import { TeamMember } from "./types";
import { appendTeamLines, parseTeam, taskLineHandles, uniqueHandles } from "./mentions";
import { DONE_TAGS, TASK_TAGS } from "./tags";

const TASK_TAG_NAMES: readonly string[] = [...TASK_TAGS, ...DONE_TAGS];

/**
 * The team note (`team.md`, path in settings): read on load and whenever
 * you edit it. It's written only on an explicit action, "Add @handle to
 * team" in the `@` suggest list or the Update team note command, never in
 * the background (PLAN.md › Phase 4).
 */
export class TeamManager extends Events {
  private app: App;
  private filePath: string;
  private members: TeamMember[] = [];
  /** Handles on the vault's task lines, gathered on first use this session. */
  private seenHandles: string[] | null = null;

  constructor(app: App, filePath: string) {
    super();
    this.app = app;
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    await this.parse();
  }

  setFilePath(filePath: string): void {
    this.filePath = filePath;
    this.parse();
  }

  getTeam(): TeamMember[] {
    return this.members;
  }

  resolveMe(): string | null {
    const me = this.members.find(m => m.isMe);
    return me?.handle ?? null;
  }

  isKnownHandle(handle: string): boolean {
    const key = handle.toLowerCase();
    if (key === "me") return true;
    return this.members.some(m => m.handle.toLowerCase() === key);
  }

  /**
   * Handles used on task lines across the vault, minus `@me`. Reads only
   * files whose cached tags include a task tag. Cached for the session;
   * `refresh` gathers again.
   */
  async getSeenHandles(refresh = false): Promise<string[]> {
    if (this.seenHandles && !refresh) return this.seenHandles;
    const found: string[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const tags = this.app.metadataCache.getFileCache(file)?.tags ?? [];
      if (!tags.some(t => TASK_TAG_NAMES.includes(t.tag.toLowerCase()))) continue;
      found.push(...taskLineHandles(await this.app.vault.cachedRead(file)));
    }
    this.seenHandles = uniqueHandles(found, ["me"]);
    return this.seenHandles;
  }

  /**
   * Appends a line per handle not already in the team note, creating the
   * note if there isn't one. Returns the handles actually added.
   */
  async addHandles(handles: string[]): Promise<string[]> {
    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) {
      const starter = this.starterContent();
      const added = uniqueHandles(handles, ["me", ...parseTeam(starter).map(m => m.handle)]);
      if (added.length === 0) return [];
      await this.app.vault.create(this.filePath, appendTeamLines(starter, added));
      await this.parse();
      return added;
    }

    let added: string[] = [];
    await this.app.vault.process(file, (content) => {
      added = uniqueHandles(handles, ["me", ...parseTeam(content).map(m => m.handle)]);
      return appendTeamLines(content, added);
    });
    if (added.length > 0) await this.parse();
    return added;
  }

  async createTeamFile(): Promise<TFile> {
    const file = await this.app.vault.create(this.filePath, this.starterContent());
    await this.parse();
    return file;
  }

  private starterContent(): string {
    let username = "me";
    try {
      username = require("os").userInfo().username || "me";
    } catch { /* fallback */ }
    return `# Team\n\n- @${username} — ${username} (me)\n`;
  }

  watchFile(): void {
    this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.path === this.filePath) {
        this.parse();
      }
    });
    this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.path === this.filePath) {
        this.parse();
      }
    });
    this.app.vault.on("delete", (file) => {
      if (file instanceof TFile && file.path === this.filePath) {
        this.members = [];
        this.trigger("team-updated");
      }
    });
  }

  private async parse(): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    this.members = file instanceof TFile ? parseTeam(await this.app.vault.read(file)) : [];
    this.trigger("team-updated");
  }
}

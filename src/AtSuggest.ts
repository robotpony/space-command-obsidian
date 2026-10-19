import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
} from "obsidian";
import { WarpedTodoSettings, TeamMember } from "./types";
import { TeamManager } from "./TeamManager";
import { formatDate, showNotice } from "./utils";
import { isValidHandle } from "./mentions";

interface AtSuggestion {
  /** "add" offers to put a new handle in the team note, on explicit choice only. */
  kind: "date" | "user" | "add";
  id: string;
  label: string;
  description: string;
  icon: string;
  getDate?: () => Date;
  handle?: string;
}

export class AtSuggest extends EditorSuggest<AtSuggestion> {
  private settings: WarpedTodoSettings;
  private teamManager: TeamManager;

  constructor(app: App, settings: WarpedTodoSettings, teamManager: TeamManager) {
    super(app);
    this.settings = settings;
    this.teamManager = teamManager;
  }

  private getDateOptions(): AtSuggestion[] {
    return [
      {
        kind: "date", id: "date", label: "@date",
        description: "Today's date", icon: "📅",
        getDate: () => new Date(),
      },
      {
        kind: "date", id: "today", label: "@today",
        description: "Today's date", icon: "📅",
        getDate: () => new Date(),
      },
      {
        kind: "date", id: "tomorrow", label: "@tomorrow",
        description: "Tomorrow's date", icon: "📆",
        getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d; },
      },
      {
        kind: "date", id: "yesterday", label: "@yesterday",
        description: "Yesterday's date", icon: "📆",
        getDate: () => { const d = new Date(); d.setDate(d.getDate() - 1); return d; },
      },
    ];
  }

  /** `@me`, then team-note members, then handles seen on the vault's task lines. */
  private async getUserOptions(): Promise<AtSuggestion[]> {
    const team = this.teamManager.getTeam();
    const options: AtSuggestion[] = [];

    const meHandle = this.teamManager.resolveMe();
    if (meHandle) {
      const meMember = team.find(m => m.isMe);
      options.push({
        kind: "user", id: "me", label: "@me",
        description: meMember?.name ?? meHandle,
        icon: "👤", handle: "me",
      });
    }

    for (const member of team) {
      options.push({
        kind: "user", id: member.handle, label: `@${member.handle}`,
        description: member.name,
        icon: "👤", handle: member.handle,
      });
    }

    for (const handle of await this.teamManager.getSeenHandles()) {
      if (this.teamManager.isKnownHandle(handle)) continue;
      options.push({
        kind: "user", id: handle, label: `@${handle}`,
        description: "Seen in tasks",
        icon: "👤", handle,
      });
    }

    return options;
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const beforeCursor = line.substring(0, cursor.ch);

    // Space Command's mention rule: `@` at line start, after whitespace or `(`.
    const match = beforeCursor.match(/(?:^|[\s(])@([\p{L}\p{N}_.-]*)$/u);
    if (!match) return null;

    const atIndex = beforeCursor.length - match[1].length - 1;
    return {
      start: { line: cursor.line, ch: atIndex },
      end: cursor,
      // Case kept, so "Add @handle to team" writes it as typed.
      query: match[1],
    };
  }

  async getSuggestions(context: EditorSuggestContext): Promise<AtSuggestion[]> {
    const query = context.query.toLowerCase();
    const dateOptions = this.getDateOptions();
    const userOptions = await this.getUserOptions();
    const all = [...dateOptions, ...userOptions];

    if (!query) return all;

    const matches = all.filter((opt) => opt.id.toLowerCase().includes(query));
    const typed = context.query;
    const isDateWord = dateOptions.some((opt) => opt.id === query);
    if (isValidHandle(typed) && !isDateWord && !this.teamManager.isKnownHandle(typed)) {
      matches.push({
        kind: "add", id: typed, label: `Add @${typed} to team`,
        description: "Writes it to the team note",
        icon: "➕", handle: typed,
      });
    }
    return matches;
  }

  renderSuggestion(item: AtSuggestion, el: HTMLElement): void {
    el.addClass("warped-todo-suggestion");

    const iconSpan = el.createEl("span", { cls: "suggestion-icon" });
    iconSpan.textContent = item.icon;

    const textContainer = el.createEl("div", { cls: "suggestion-content" });
    textContainer.createEl("span", { cls: "suggestion-name", text: item.label });

    if (item.kind === "date" && item.getDate) {
      const date = formatDate(item.getDate(), this.settings.insertDateFormat);
      textContainer.createEl("span", { cls: "suggestion-description", text: date });
    } else {
      textContainer.createEl("span", { cls: "suggestion-description", text: item.description });
    }
  }

  selectSuggestion(item: AtSuggestion, evt: MouseEvent | KeyboardEvent): void {
    const editor = this.context?.editor;
    if (!editor || !this.context) return;

    const start = this.context.start;
    const end = this.context.end;

    if (item.kind === "date" && item.getDate) {
      const date = formatDate(item.getDate(), this.settings.insertDateFormat);
      editor.replaceRange(date, start, end);
      editor.setCursor({ line: start.line, ch: start.ch + date.length });
    } else if (item.handle) {
      const text = `@${item.handle} `;
      editor.replaceRange(text, start, end);
      editor.setCursor({ line: start.line, ch: start.ch + text.length });
      if (item.kind === "add") void this.addToTeam(item.handle);
    }
  }

  private async addToTeam(handle: string): Promise<void> {
    try {
      const added = await this.teamManager.addHandles([handle]);
      if (added.length > 0) showNotice(`Added @${handle} to ${this.settings.teamFilePath}`);
    } catch (e) {
      showNotice(`Couldn't add @${handle} to the team note: ${e instanceof Error ? e.message : e}`);
    }
  }
}

import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
} from "obsidian";
import { isVocabularyTag } from "./tags";

interface TagSuggestion {
  tag: string;
  hint: string;
}

/** Space Command's vocabulary, with a one-word hint. Read-only aliases are offered only when typed toward. */
const VOCABULARY: (TagSuggestion & { alias?: boolean })[] = [
  { tag: "#todo", hint: "task" },
  { tag: "#todone", hint: "done" },
  { tag: "#idea", hint: "idea" },
  { tag: "#principle", hint: "principle" },
  { tag: "#focus", hint: "focus" },
  { tag: "#p0", hint: "priority" },
  { tag: "#p1", hint: "priority" },
  { tag: "#p2", hint: "priority" },
  { tag: "#p3", hint: "priority" },
  { tag: "#p4", hint: "priority" },
  { tag: "#snooze", hint: "snooze" },
  { tag: "#todos", hint: "tasks", alias: true },
  { tag: "#todones", hint: "done", alias: true },
  { tag: "#ideas", hint: "ideas", alias: true },
  { tag: "#ideation", hint: "idea", alias: true },
  { tag: "#principles", hint: "principle", alias: true },
];

/**
 * Tag suggest on `#`: the vocabulary first, then the vault's other tags by
 * use. Moved ahead of Obsidian's own tag suggest, which it covers.
 */
export class TagSuggest extends EditorSuggest<TagSuggestion> {
  constructor(app: App) {
    super(app);
    this.limit = 40;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    const before = editor.getLine(cursor.line).substring(0, cursor.ch);
    // Space Command's tag rule: `#` at line start or after whitespace.
    const match = before.match(/(?:^|\s)#([\p{L}\p{N}_/-]*)$/u);
    if (!match) return null;
    // `#` alone at column 0 is probably a heading on its way.
    if (match[1] === "" && before === "#") return null;
    return {
      start: { line: cursor.line, ch: cursor.ch - match[1].length - 1 },
      end: cursor,
      query: match[1].toLowerCase(),
    };
  }

  getSuggestions(context: EditorSuggestContext): TagSuggestion[] {
    const query = context.query;
    const matches = (tag: string) => tag.slice(1).toLowerCase().includes(query);
    const vocabulary = VOCABULARY.filter((v) => (v.alias ? query.length > 0 : true) && matches(v.tag));

    const counts = (this.app.metadataCache as unknown as { getTags?: () => Record<string, number> }).getTags?.() ?? {};
    const vault = Object.entries(counts)
      .filter(([tag]) => !isVocabularyTag(tag) && matches(tag))
      .sort((a, b) => {
        const prefix = Number(b[0].slice(1).toLowerCase().startsWith(query)) - Number(a[0].slice(1).toLowerCase().startsWith(query));
        return prefix || b[1] - a[1] || a[0].localeCompare(b[0]);
      })
      .map(([tag, count]) => ({ tag, hint: String(count) }));

    return [...vocabulary, ...vault];
  }

  renderSuggestion(item: TagSuggestion, el: HTMLElement): void {
    el.addClass("space-command-suggestion");
    const content = el.createEl("div", { cls: "suggestion-content" });
    content.createEl("span", { cls: "suggestion-name", text: item.tag });
    content.createEl("span", { cls: "suggestion-description", text: item.hint });
  }

  selectSuggestion(item: TagSuggestion, _evt: MouseEvent | KeyboardEvent): void {
    if (!this.context) return;
    const { editor, start, end } = this.context;
    const text = `${item.tag} `;
    editor.replaceRange(text, start, end);
    editor.setCursor({ line: start.line, ch: start.ch + text.length });
  }
}

/** Registers the tag suggest ahead of Obsidian's built-in one (the first suggest to trigger wins). */
export function registerTagSuggest(plugin: { app: App; registerEditorSuggest: (s: EditorSuggest<unknown>) => void }): void {
  const suggest = new TagSuggest(plugin.app);
  plugin.registerEditorSuggest(suggest);
  const manager = (plugin.app.workspace as unknown as { editorSuggest?: { suggests?: EditorSuggest<unknown>[] } }).editorSuggest;
  const list = manager?.suggests;
  if (!list) return;
  const index = list.indexOf(suggest as EditorSuggest<unknown>);
  if (index > 0) {
    list.splice(index, 1);
    list.unshift(suggest as EditorSuggest<unknown>);
  }
}

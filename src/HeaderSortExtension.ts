import {
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  Decoration,
  DecorationSet,
  EditorView,
} from "@codemirror/view";
import { RangeSetBuilder, Text } from "@codemirror/state";
import { Editor, editorInfoField, MarkdownFileInfo } from "obsidian";
import { blockAtHeading } from "./blocks";
import { hasCheckbox, headingProgress, sortableBlockAt, sortBlock, toCharChange } from "./blockOps";
import { hasAnyTag, TASK_TAGS } from "./tags";
import { taskFileKind } from "./taskFiles";
import { showNotice } from "./utils";

// SVG icon for sort button
const SORT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5h10"/><path d="M11 9h7"/><path d="M11 13h4"/><path d="m3 17 3 3 3-3"/><path d="M6 18V4"/></svg>`;

function docLines(doc: Text): string[] {
  const lines: string[] = [];
  for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);
  return lines;
}

/** Path of the note an editor view shows, if any. */
function viewPath(view: EditorView): string | null {
  return view.state.field(editorInfoField, false)?.file?.path ?? null;
}

/** Sorts the block at `line` in `lines` (sortableBlockAt); returns the change to apply, or a notice when there's nothing to do. */
function sortChange(lines: string[], line: number, path: string | null) {
  const block = sortableBlockAt(lines, line, path);
  if (!block) return { notice: "Cursor isn't in a tagged heading's block." };
  const edit = sortBlock(lines, block);
  if (!edit) return { notice: "Items already sorted." };
  return { change: toCharChange(lines, edit) };
}

/**
 * Widget that renders a sort button inline after header TODO text. Sorts
 * the heading's block in one editor transaction on click; never on change.
 */
class SortButtonWidget extends WidgetType {
  constructor(private lineNumber: number) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "todo-sort-btn-editor clickable-icon";
    btn.setAttribute("aria-label", "Sort children");
    btn.innerHTML = SORT_ICON;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Re-read the heading's line from the button's position, in case the
      // document moved since the widget was drawn.
      const line = view.state.doc.lineAt(view.posAtDOM(btn)).number - 1;
      const result = sortChange(docLines(view.state.doc), line, viewPath(view));
      if (result.change) {
        view.dispatch({ changes: result.change });
        showNotice("Sorted items.");
      } else {
        showNotice(result.notice!);
      }
    });

    return btn;
  }

  eq(other: SortButtonWidget): boolean {
    return this.lineNumber === other.lineNumber;
  }

  ignoreEvent(): boolean {
    return false; // Allow click events
  }
}

/**
 * Read-only "3/7" beside a tagged heading: its task children done over
 * all (blockOps.headingProgress). Never writes.
 */
class ProgressWidget extends WidgetType {
  constructor(private done: number, private total: number) {
    super();
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "space-command-heading-progress";
    if (this.done === this.total) el.classList.add("is-complete");
    el.textContent = `${this.done}/${this.total}`;
    el.setAttribute("aria-label", `${this.done} of ${this.total} done`);
    return el;
  }

  eq(other: ProgressWidget): boolean {
    return this.done === other.done && this.total === other.total;
  }
}

/**
 * A heading whose block has at least two child lines: a `#todo`/`#todos`
 * heading, or in a well-known task file (PLAN.md, TODO.md, …) any heading
 * with a checkbox under it.
 */
function isSortableHeading(lines: string[], lineNumber: number, inTaskFile: boolean): boolean {
  const line = lines[lineNumber];
  if (!/^#{1,6}\s/.test(line)) return false;
  const tagged = hasAnyTag(line, TASK_TAGS);
  if (!tagged && !inTaskFile) return false;
  const block = blockAtHeading(lines, lineNumber);
  if (!block || (!tagged && !hasCheckbox(lines, block))) return false;
  let children = 0;
  for (let i = block.headingLine + 1; i < block.end; i++) {
    if (lines[i].trim() !== "" && ++children >= 2) return true;
  }
  return false;
}

/**
 * Create the ViewPlugin for header sort buttons.
 */
export function createHeaderSortPlugin() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        let lines: string[] | null = null;
        const inTaskFile = taskFileKind(viewPath(view)) === "task";

        // Iterate through visible lines
        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos < to) {
            const line = view.state.doc.lineAt(pos);
            // Cheap pre-check before splitting the document.
            if (inTaskFile ? /^#{1,6}\s/.test(line.text) : /^#{1,6}\s.*#(?:todos?|ideas?|ideation|principles?)\b/i.test(line.text)) {
              lines ??= docLines(view.state.doc);
              const progress = headingProgress(lines, line.number - 1);
              if (progress) {
                builder.add(
                  line.to,
                  line.to,
                  Decoration.widget({ widget: new ProgressWidget(progress.done, progress.total), side: 1 })
                );
              }
              if (isSortableHeading(lines, line.number - 1, inTaskFile)) {
                builder.add(
                  line.to,
                  line.to,
                  Decoration.widget({ widget: new SortButtonWidget(line.number - 1), side: 1 })
                );
              }
            }
            pos = line.to + 1;
          }
        }

        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

/** "Sort block at cursor" command: sorts the block containing the cursor (sortableBlockAt), as one undoable edit. */
export function sortBlockAtCursor(editor: Editor, ctx: MarkdownFileInfo): void {
  const lines = editor.getValue().split("\n");
  const result = sortChange(lines, editor.getCursor().line, ctx.file?.path ?? null);
  if (!result.change) {
    showNotice(result.notice!);
    return;
  }
  const { from, to, insert } = result.change;
  editor.replaceRange(insert, editor.offsetToPos(from), editor.offsetToPos(to));
  showNotice("Sorted items.");
}

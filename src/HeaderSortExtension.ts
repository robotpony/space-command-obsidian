import {
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  Decoration,
  DecorationSet,
  EditorView,
} from "@codemirror/view";
import { RangeSetBuilder, Text } from "@codemirror/state";
import { Editor } from "obsidian";
import { blockAtHeading } from "./blocks";
import { headingProgress, sortBlock, taggedBlockAt, toCharChange } from "./blockOps";
import { hasAnyTag, TASK_TAGS } from "./tags";
import { showNotice } from "./utils";

// SVG icon for sort button
const SORT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5h10"/><path d="M11 9h7"/><path d="M11 13h4"/><path d="m3 17 3 3 3-3"/><path d="M6 18V4"/></svg>`;

function docLines(doc: Text): string[] {
  const lines: string[] = [];
  for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);
  return lines;
}

/** Sorts the tagged block at `line` in `lines`; returns the change to apply, or a notice when there's nothing to do. */
function sortChange(lines: string[], line: number) {
  const block = taggedBlockAt(lines, line);
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
      const result = sortChange(docLines(view.state.doc), line);
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

/** A `#todo`/`#todos` heading whose block has at least two child lines. */
function isSortableHeading(lines: string[], lineNumber: number): boolean {
  const line = lines[lineNumber];
  if (!/^#{1,6}\s/.test(line) || !hasAnyTag(line, TASK_TAGS)) return false;
  const block = blockAtHeading(lines, lineNumber);
  if (!block) return false;
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

        // Iterate through visible lines
        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos < to) {
            const line = view.state.doc.lineAt(pos);
            // Cheap pre-check before splitting the document.
            if (/^#{1,6}\s.*#(?:todos?|ideas?|ideation|principles?)\b/i.test(line.text)) {
              lines ??= docLines(view.state.doc);
              const progress = headingProgress(lines, line.number - 1);
              if (progress) {
                builder.add(
                  line.to,
                  line.to,
                  Decoration.widget({ widget: new ProgressWidget(progress.done, progress.total), side: 1 })
                );
              }
              if (isSortableHeading(lines, line.number - 1)) {
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

/** "Sort block at cursor" command: sorts the tagged block containing the cursor, as one undoable edit. */
export function sortBlockAtCursor(editor: Editor): void {
  const lines = editor.getValue().split("\n");
  const result = sortChange(lines, editor.getCursor().line);
  if (!result.change) {
    showNotice(result.notice!);
    return;
  }
  const { from, to, insert } = result.change;
  editor.replaceRange(insert, editor.offsetToPos(from), editor.offsetToPos(to));
  showNotice("Sorted items.");
}

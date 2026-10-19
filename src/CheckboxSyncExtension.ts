import { EditorState, Text, Transaction, TransactionSpec } from "@codemirror/state";
import { findBlock } from "./blocks";
import { boxState, syncCheckboxToggle, taggedHeadingKind } from "./tags";

/**
 * Checkbox ↔ tag sync as a CodeMirror transaction filter. When an edit
 * flips one line's task box (a click in Live Preview, or typing `x` into
 * `[ ]`), the tag write from tags.ts's `syncCheckboxToggle` is appended to
 * the same transaction, so the toggle and its tag change undo together.
 *
 * Only single-line edits count: a whole-document replace (opening a file,
 * an external write reaching the editor) spans lines and is skipped, so
 * nothing is written on open or in the background.
 */

function docLines(doc: Text): string[] {
  const lines: string[] = [];
  for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);
  return lines;
}

function syncEdits(tr: Transaction): { from: number; to: number; insert: string }[] {
  const edits: { from: number; to: number; insert: string }[] = [];
  const seen = new Set<number>();
  let lines: string[] | null = null;

  tr.changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
    const oldLine = tr.startState.doc.lineAt(fromA);
    if (toA > oldLine.to || inserted.lines > 1) return;

    const newLine = tr.newDoc.lineAt(fromB);
    if (seen.has(newLine.number)) return;
    const before = boxState(oldLine.text);
    const after = boxState(newLine.text);
    if (before === null || after === null || before === after) return;
    seen.add(newLine.number);

    lines ??= docLines(tr.newDoc);
    const block = findBlock(lines, newLine.number - 1);
    const headingKind = block && block.headingLine !== newLine.number - 1
      ? taggedHeadingKind(lines[block.headingLine]) ?? undefined
      : undefined;

    const rewritten = syncCheckboxToggle(newLine.text, { headingKind });
    if (rewritten !== null && rewritten !== newLine.text) {
      edits.push({ from: newLine.from, to: newLine.to, insert: rewritten });
    }
  });

  return edits;
}

export function createCheckboxSyncExtension() {
  return EditorState.transactionFilter.of((tr): Transaction | readonly (Transaction | TransactionSpec)[] => {
    if (!tr.docChanged) return tr;
    const edits = syncEdits(tr);
    if (edits.length === 0) return tr;
    return [tr, { changes: edits, sequential: true }];
  });
}

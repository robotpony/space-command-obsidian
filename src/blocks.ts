/**
 * Pure block model over a document's lines: a heading plus the lines under
 * it, stopping at the next heading of *any* level — Space Command's section
 * rule (TaggedLinesParser.swift), so a `####` under a tagged `###` ends the
 * `###`'s block. Header sort, move, and the checkbox sync's "under a
 * tagged heading" check all use it.
 * No Obsidian or CodeMirror types — callers pass `string[]` and 0-based
 * line numbers.
 */

export interface Block {
  /** 0-based line of the heading. */
  headingLine: number;
  /** Heading level, 1–6. */
  level: number;
  /** Exclusive end: one past the last non-blank line of the block. */
  end: number;
}

/** Heading level (1–6) of a markdown ATX heading line, or 0 if it isn't one. */
export function headingLevel(line: string): number {
  const match = line.match(/^(#{1,6})\s+\S/);
  return match ? match[1].length : 0;
}

const FENCE = /^\s*(```|~~~)/;

/** Per-line flag: true for lines inside (or opening/closing) a code fence. */
export function fencedLines(lines: string[]): boolean[] {
  const fenced: boolean[] = new Array(lines.length).fill(false);
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      fenced[i] = true;
      open = !open;
    } else {
      fenced[i] = open;
    }
  }
  return fenced;
}

/** Block for the heading at `headingLine`, or null if that line isn't a heading. */
export function blockAtHeading(lines: string[], headingLine: number, fenced = fencedLines(lines)): Block | null {
  if (fenced[headingLine]) return null;
  const level = headingLevel(lines[headingLine] ?? "");
  if (!level) return null;

  let end = headingLine + 1;
  while (end < lines.length && (fenced[end] || !headingLevel(lines[end]))) end++;
  while (end > headingLine + 1 && lines[end - 1].trim() === "") end--;
  return { headingLine, level, end };
}

/**
 * The block containing `line` — that of the nearest heading at or above it —
 * if that heading passes `accept` (any heading by default), else null.
 * A heading line belongs to its own block.
 */
export function findBlock(
  lines: string[],
  line: number,
  accept: (heading: string) => boolean = () => true
): Block | null {
  if (line < 0 || line >= lines.length) return null;
  const fenced = fencedLines(lines);
  for (let i = line; i >= 0; i--) {
    if (fenced[i] || !headingLevel(lines[i])) continue;
    // A trailing blank line past the block's `end` still sits under the
    // heading, so this block is still the answer for it.
    return accept(lines[i]) ? blockAtHeading(lines, i, fenced) : null;
  }
  return null;
}

const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s/;

/** Indent width of a list item line, or -1 if it isn't one. */
export function listIndent(line: string): number {
  const match = line.match(LIST_ITEM);
  return match ? match[1].replace(/\t/g, "    ").length : -1;
}

function indentWidth(line: string): number {
  return (line.match(/^\s*/)?.[0] ?? "").replace(/\t/g, "    ").length;
}

/**
 * Exclusive end of the list item at `line` plus its deeper-indented
 * continuation lines (sub-items, wrapped text). Blank lines end it.
 */
export function listItemEnd(lines: string[], line: number): number {
  const indent = listIndent(lines[line] ?? "");
  if (indent < 0) return line + 1;
  let end = line + 1;
  while (end < lines.length && lines[end].trim() !== "" && indentWidth(lines[end]) > indent) end++;
  return end;
}

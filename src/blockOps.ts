/**
 * Pure line operations over the block model (blocks.ts): header sort and the
 * cut/append halves of "Move TODO to another file". Callers apply the result
 * as one editor transaction (sort, cut) or one `vault.process` (append to an
 * unopened target).
 */

import { Block, blockAtHeading, findBlock, headingLevel, listIndent, listItemEnd } from "./blocks";
import {
  appendTag,
  boxState,
  completeTaskLine,
  DONE_TAGS,
  hasAnyTag,
  isSnoozed,
  isTaggedHeading,
  ItemKind,
  KIND_TAGS,
  kindTagForDetachedChild,
  lineTags,
  ownKind,
  priorityRank,
  readsAsDone,
  taggedHeadingKind,
} from "./tags";
import { taskFileKind } from "./taskFiles";

/** A replacement of lines `[from, to)` with `lines`. */
export interface LineEdit {
  from: number;
  to: number;
  lines: string[];
}

/** Tagged-heading block at or around `line`, or null. */
export function taggedBlockAt(lines: string[], line: number): Block | null {
  return findBlock(lines, line, isTaggedHeading);
}

/** True when the block has a checkbox item under its heading. */
export function hasCheckbox(lines: string[], block: Block): boolean {
  for (let i = block.headingLine + 1; i < block.end; i++) {
    if (boxState(lines[i]) !== null) return true;
  }
  return false;
}

/**
 * Block to sort at or around `line`: a tagged heading's, or in a
 * well-known task file (taskFiles.ts), any heading's whose block has a
 * checkbox, since Space Command reads those boxes without tags.
 */
export function sortableBlockAt(lines: string[], line: number, path?: string | null): Block | null {
  const tagged = taggedBlockAt(lines, line);
  if (tagged || !taskFileKind(path)) return tagged;
  const block = findBlock(lines, line);
  return block && hasCheckbox(lines, block) ? block : null;
}

/** A child item of a tagged heading's section. */
export interface SectionChild {
  /** 0-based line. */
  line: number;
  /** Its own kind tag wins over the heading's. */
  kind: ItemKind;
}

/**
 * The items under a tagged heading, by Space Command's rule
 * (TaggedLinesParser.swift): every checkbox item at any depth, and plain
 * bullets at the section's outer level (the first list item's indent);
 * deeper plain bullets are notes on the item above. Lines that are only
 * markers and tags aren't items. Empty for a heading that doesn't open a
 * section (untagged, or done).
 */
export function sectionChildren(lines: string[], block: Block): SectionChild[] {
  const headingKind = taggedHeadingKind(lines[block.headingLine]);
  if (!headingKind) return [];
  const children: SectionChild[] = [];
  let outer: number | null = null;
  for (let i = block.headingLine + 1; i < block.end; i++) {
    const indent = listIndent(lines[i]);
    if (indent < 0) continue;
    outer ??= indent;
    if (boxState(lines[i]) === null && indent > outer) continue;
    if (!hasContent(lines[i])) continue;
    const own = ownKind(lines[i]) ?? (hasAnyTag(lines[i], DONE_TAGS) ? "task" : null);
    children.push({ line: i, kind: own ?? headingKind });
  }
  return children;
}

/** True when the line has text beyond its list marker, box and tags. */
function hasContent(line: string): boolean {
  const body = line.replace(/^\s*(?:[-*+]|\d+[.)])\s*(?:\[[ xX]\]\s*)?/, "");
  const tags = new Set(lineTags(body));
  return body.split(/\s+/).some((word) => word !== "" && !tags.has(word.toLowerCase()));
}

/**
 * "3/7" for a tagged heading: its task children done over all, as Space
 * Command counts progress. Ideas and principles aren't progress, and
 * snoozed items are set aside. Null when it has no task children.
 */
export function headingProgress(lines: string[], headingLine: number): { done: number; total: number } | null {
  const block = blockAtHeading(lines, headingLine);
  if (!block) return null;
  let done = 0;
  let total = 0;
  for (const child of sectionChildren(lines, block)) {
    if (child.kind !== "task" || isSnoozed(lines[child.line])) continue;
    total++;
    if (readsAsDone(lines[child.line])) done++;
  }
  return total > 0 ? { done, total } : null;
}

/**
 * "Complete all under heading": each open task child completed by the
 * per-line rule, as one edit over the block's body. The heading line is
 * never touched; idea and principle children and done children are left
 * alone. Null when nothing is open.
 */
export function completeAllInBlock(lines: string[], block: Block): LineEdit | null {
  const headingKind = taggedHeadingKind(lines[block.headingLine]) ?? undefined;
  const from = block.headingLine + 1;
  const out = lines.slice(from, block.end);
  let changed = false;
  for (const child of sectionChildren(lines, block)) {
    if (child.kind !== "task" || readsAsDone(lines[child.line])) continue;
    const result = completeTaskLine(lines[child.line], { headingKind });
    if (!result.ok) continue;
    out[child.line - from] = result.line;
    changed = true;
  }
  return changed ? { from, to: block.end, lines: out } : null;
}

/**
 * Sorts the children of a tagged heading's block: open before done, then by
 * priority (`#focus`, `#p0`–`#p4`, none, snoozed), stable otherwise. Each
 * contiguous run of top-level list items sorts on its own — blank lines,
 * paragraphs and bold subheadings stay put and split runs — and an item's
 * indented sub-lines travel with it. Returns null when the order wouldn't
 * change.
 */
export function sortBlock(lines: string[], block: Block): LineEdit | null {
  const from = block.headingLine + 1;
  const body = lines.slice(from, block.end);
  const out: string[] = [];

  let i = 0;
  while (i < body.length) {
    const indent = listIndent(body[i]);
    if (indent < 0) {
      out.push(body[i++]);
      continue;
    }
    // Collect a run of sibling items at this indent.
    const units: string[][] = [];
    while (i < body.length && listIndent(body[i]) === indent) {
      const end = listItemEnd(body, i);
      units.push(body.slice(i, end));
      i = end;
    }
    const ranked = units.map((unit, index) => ({ unit, index, done: readsAsDone(unit[0]), rank: priorityRank(unit[0]) }));
    ranked.sort((a, b) =>
      Number(a.done) - Number(b.done) ||
      (a.done ? 0 : a.rank - b.rank) ||
      a.index - b.index
    );
    for (const { unit } of ranked) out.push(...unit);
  }

  if (out.every((line, idx) => line === body[idx])) return null;
  return { from, to: block.end, lines: out };
}

/** What a move cuts from the source: the edit to apply there, and the lines to append to the target. */
export interface CutResult {
  edit: LineEdit;
  moved: string[];
  /** A whole heading block, which gets a blank line before it in the target. */
  isBlock: boolean;
}

/**
 * Whether "Move TODO to another file" applies at `line`: a line carrying a
 * kind tag (a tagged heading included), or a non-blank child of a tagged
 * heading's block.
 */
export function isMovableLine(lines: string[], line: number): boolean {
  const text = lines[line];
  if (text === undefined || text.trim() === "") return false;
  if (hasAnyTag(text, KIND_TAGS)) return true;
  if (headingLevel(text)) return false;
  return taggedBlockAt(lines, line) !== null;
}

/**
 * Cut for "Move TODO to another file" at `line`: a heading line takes its
 * whole block; a list item takes itself and its indented sub-lines; any
 * other non-blank line takes itself. A child leaving a tagged heading gets
 * the heading's kind tag appended so it's still an item in the target.
 * One blank line left doubled by the cut is removed with it. Null on a
 * blank line.
 */
export function cutForMove(lines: string[], line: number): CutResult | null {
  if (line < 0 || line >= lines.length || lines[line].trim() === "") return null;

  let from = line;
  let to: number;
  let isBlock = false;
  let moved: string[];

  if (headingLevel(lines[line])) {
    const block = blockAtHeading(lines, line)!;
    to = block.end;
    isBlock = true;
    moved = lines.slice(from, to);
  } else {
    to = listIndent(lines[line]) >= 0 ? listItemEnd(lines, line) : line + 1;
    moved = lines.slice(from, to);
    const parent = taggedBlockAt(lines, line);
    if (parent) {
      const tag = kindTagForDetachedChild(moved[0], lines[parent.headingLine]);
      if (tag) moved[0] = appendTag(moved[0], tag);
    }
  }

  // Don't leave two blank lines (or a leading blank) where the cut was.
  const blankBefore = from === 0 || lines[from - 1].trim() === "";
  const blankAfter = to < lines.length && lines[to].trim() === "";
  if (blankBefore && blankAfter) to++;

  return { edit: { from, to, lines: [] }, moved, isBlock };
}

/**
 * Target file content with `moved` appended at the end. A block gets a
 * blank line before it; a single line joins whatever ends the file. The
 * result always ends with one newline.
 */
export function appendMoved(content: string, moved: string[], isBlock: boolean): string {
  const trimmed = content.replace(/\s+$/, "");
  const text = moved.join("\n");
  if (!trimmed) return `${text}\n`;
  return `${trimmed}${isBlock ? "\n\n" : "\n"}${text}\n`;
}

/** A character-offset change over the document `lines.join("\n")`. */
export interface CharChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * Turns a line edit into one character change over `lines.join("\n")`, so
 * the editor applies it as a single transaction. Handles the last line,
 * which has no newline after it.
 */
export function toCharChange(lines: string[], edit: LineEdit): CharChange {
  const offset = (line: number) => {
    let pos = 0;
    for (let i = 0; i < line; i++) pos += lines[i].length + 1;
    return pos;
  };
  const docLength = offset(lines.length) - 1;

  if (edit.to < lines.length) {
    return { from: offset(edit.from), to: offset(edit.to), insert: edit.lines.map((l) => `${l}\n`).join("") };
  }
  // Edit runs to the end of the document: no newline follows the last line.
  if (edit.lines.length > 0) {
    return { from: offset(edit.from), to: docLength, insert: edit.lines.join("\n") };
  }
  // Deleting through the end: also take the newline before the cut.
  return { from: Math.max(0, offset(edit.from) - 1), to: docLength, insert: "" };
}

/**
 * The editor's tag commands over lines, pure: which lines a command acts on
 * (the cursor's line, every item in a selection, or a tagged heading's
 * children) and the per-line write from tags.ts for each. Callers apply the
 * returned edits as one editor transaction, so one undo reverts them all.
 */

import { blockAtHeading, fencedLines, findBlock, headingLevel } from "./blocks";
import { sectionChildren } from "./blockOps";
import {
  completeLine,
  DONE_TAGS,
  hasAnyTag,
  KIND_TAGS,
  LineContext,
  readsAsDone,
  reopenLine,
  taggedHeadingKind,
  WriteResult,
} from "./tags";

/** Where a command acts: the primary selection, 0-based lines. */
export interface Selection {
  fromLine: number;
  toLine: number;
  /** Column of the selection's end; a selection ending at column 0 leaves that line out. */
  toCh: number;
}

/** The write-rule context for `line`: the tagged heading it sits under, and whether it's a heading with children. */
export function lineContext(lines: string[], line: number): LineContext {
  const block = findBlock(lines, line);
  if (!block) return {};
  if (block.headingLine === line) {
    return { headingHasChildren: sectionChildren(lines, block).length > 0 };
  }
  return { headingKind: taggedHeadingKind(lines[block.headingLine]) ?? undefined };
}

/** True for a line Space Command reads as an item: a kind tag of its own, or a child of a tagged heading. */
function isItemLine(lines: string[], line: number): boolean {
  if (headingLevel(lines[line])) return false;
  if (hasAnyTag(lines[line], [...KIND_TAGS, ...DONE_TAGS])) return true;
  const block = findBlock(lines, line);
  return !!block && sectionChildren(lines, block).some((c) => c.line === line);
}

/**
 * Lines a tag command acts on:
 * - a selection over several lines: each item line in it (headings left
 *   out, so a block's priority isn't doubled onto its heading);
 * - the cursor on a tagged heading with children: those children;
 * - otherwise the cursor's line.
 * With `anyLine`, a selection takes every non-blank, non-heading line
 * (Convert to tasks turns plain lines into items).
 */
export function targetLines(lines: string[], sel: Selection, anyLine = false): number[] {
  let last = sel.toLine;
  if (last > sel.fromLine && sel.toCh === 0) last--;
  const fenced = fencedLines(lines);

  if (last > sel.fromLine) {
    const out: number[] = [];
    for (let i = sel.fromLine; i <= last; i++) {
      if (fenced[i] || lines[i].trim() === "" || headingLevel(lines[i])) continue;
      if (anyLine || isItemLine(lines, i)) out.push(i);
    }
    return out;
  }

  const line = sel.fromLine;
  const block = blockAtHeading(lines, line);
  if (block && taggedHeadingKind(lines[line])) {
    const children = sectionChildren(lines, block);
    if (children.length > 0) return children.map((c) => c.line);
  }
  return [line];
}

/** One line's replacement. */
export interface LineChange {
  line: number;
  text: string;
}

export interface OpResult {
  changes: LineChange[];
  /** Why the first refused line was refused, when nothing changed. */
  reason?: string;
}

export type LineOp = (line: string, ctx: LineContext) => WriteResult;

/** Runs `op` on each target line; refused lines are skipped. */
export function applyOp(lines: string[], targets: number[], op: LineOp): OpResult {
  const changes: LineChange[] = [];
  let reason: string | undefined;
  for (const line of targets) {
    const result = op(lines[line], lineContext(lines, line));
    if (result.ok) {
      if (result.line !== lines[line]) changes.push({ line, text: result.line });
    } else {
      reason ??= result.reason;
    }
  }
  return changes.length > 0 ? { changes } : { changes, reason: reason ?? "Nothing to change." };
}

/**
 * A toggle over several lines picks one direction: on for every line
 * when any is off, else off for all. `isOn` reads a line; `on`/`off` write.
 */
export function applyToggle(
  lines: string[],
  targets: number[],
  isOn: (line: string, ctx: LineContext) => boolean,
  on: LineOp,
  off: LineOp
): OpResult {
  const anyOff = targets.some((t) => !isOn(lines[t], lineContext(lines, t)));
  const pending = anyOff ? targets.filter((t) => !isOn(lines[t], lineContext(lines, t))) : targets;
  return applyOp(lines, pending, anyOff ? on : off);
}

/** Mark done / reopen: done when any target is open, else reopen them all. */
export function toggleDone(lines: string[], targets: number[]): OpResult {
  return applyToggle(lines, targets, (line) => readsAsDone(line), completeLine, (line) => reopenLine(line));
}

/** Toggle focus or snooze across targets, one direction for all. */
export function toggleTag(
  lines: string[],
  targets: number[],
  isOn: (line: string) => boolean,
  toggle: LineOp
): OpResult {
  return applyToggle(lines, targets, (line) => isOn(line), toggle, toggle);
}

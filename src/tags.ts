/**
 * Space Command's write rules, one place (PLAN.md › "Space Command's write
 * rules"). Pure, line-in/line-out. Phase 1 starts it with completion,
 * reopening, and the checkbox-toggle sync; Phase 3 adds the rest of the
 * vocabulary.
 *
 * Rules kept here: tags are renamed in place and keep their alias form
 * (#todo ↔ #todone, #todos ↔ #todones); no date stamp is ever written; a
 * struck line is never "fixed"; a line under a tagged heading never gains
 * a tag. Section rules follow Space Command's TaggedLinesParser.swift: any
 * heading level opens a section when it carries an open kind tag, a done
 * heading (`#todone`) doesn't, and a child's own kind tag wins over the
 * heading's.
 */

import { headingLevel } from "./blocks";

export const TASK_TAGS = ["#todo", "#todos"] as const;
export const DONE_TAGS = ["#todone", "#todones"] as const;
export const IDEA_TAGS = ["#idea", "#ideas", "#ideation"] as const;
export const PRINCIPLE_TAGS = ["#principle"] as const;
export const KIND_TAGS: readonly string[] = [...TASK_TAGS, ...DONE_TAGS, ...IDEA_TAGS, ...PRINCIPLE_TAGS];

export type ItemKind = "task" | "idea" | "principle";

/** Where a line sits, as far as the write rules care. */
export interface LineContext {
  /** Kind of the tagged heading the line sits under, if any; the heading carries the tag. */
  headingKind?: ItemKind;
  /** The line is a tagged heading with child lines (completion refuses). */
  headingHasChildren?: boolean;
}

export type WriteResult = { ok: true; line: string } | { ok: false; reason: string };

/** Splits a line into alternating [text, code, text, code, …] around inline code spans. */
function splitCode(line: string): string[] {
  return line.split(/(`[^`]*`)/);
}

/** Tags on the line outside code spans, lower-cased. */
export function lineTags(line: string): string[] {
  return splitCode(line)
    .filter((_, i) => i % 2 === 0)
    .flatMap((part) => part.match(/#[\w-]+/g) ?? [])
    .map((t) => t.toLowerCase());
}

export function hasAnyTag(line: string, tags: readonly string[]): boolean {
  return lineTags(line).some((t) => tags.includes(t));
}

/** Kind named by the line's own open kind tag, if any (task over idea over principle). */
export function ownKind(line: string): ItemKind | null {
  if (hasAnyTag(line, TASK_TAGS)) return "task";
  if (hasAnyTag(line, IDEA_TAGS)) return "idea";
  if (hasAnyTag(line, PRINCIPLE_TAGS)) return "principle";
  return null;
}

/**
 * Kind of a heading that opens a tagged section, or null. A done heading
 * (`#todone`/`#todones`) closes rather than opens one.
 */
export function taggedHeadingKind(line: string): ItemKind | null {
  if (!headingLevel(line) || hasAnyTag(line, DONE_TAGS)) return null;
  return ownKind(line);
}

export function isTaggedHeading(line: string): boolean {
  return taggedHeadingKind(line) !== null;
}

/**
 * Renames the first `from` tag outside code spans to `to`, in place. An
 * `@date` stamp directly after it is dropped when `dropStamp` is set (for
 * reopening legacy `#todone @2026-05-08` lines). Matching is
 * case-insensitive; `#todo` never matches inside `#todos`.
 */
function renameTag(line: string, from: string, to: string, dropStamp = false): string {
  const stamp = dropStamp ? String.raw`(?:\s+@\d{4}-\d{2}-\d{2})?` : "";
  const re = new RegExp(`${from}(?![\\w-])${stamp}`, "i");
  const parts = splitCode(line);
  for (let i = 0; i < parts.length; i += 2) {
    if (re.test(parts[i])) {
      parts[i] = parts[i].replace(re, to);
      return parts.join("");
    }
  }
  return line;
}

const BOX = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;
const BULLET = /^(\s*(?:[-*+]|\d+[.)])\s+)/;

/** true/false for a checked/unchecked task box, null for a line without one. */
export function boxState(line: string): boolean | null {
  const match = line.match(BOX);
  return match ? match[2] !== " " : null;
}

function setBox(line: string, checked: boolean): string {
  return line.replace(BOX, `$1[${checked ? "x" : " "}]`);
}

/** `~~…~~` around the line's text (after any list marker and box): Space Command's "Let Go". */
export function isStruck(line: string): boolean {
  const body = line.replace(BOX, "").replace(BULLET, "").trim();
  return /^~~.+~~/.test(body);
}

/** Done tag for a task tag, keeping its alias form. */
function doneFormOf(line: string): [string, string] | null {
  if (hasAnyTag(line, ["#todos"])) return ["#todos", "#todones"];
  if (hasAnyTag(line, ["#todo"])) return ["#todo", "#todone"];
  return null;
}

function openFormOf(line: string): [string, string] | null {
  if (hasAnyTag(line, ["#todones"])) return ["#todones", "#todos"];
  if (hasAnyTag(line, ["#todone"])) return ["#todone", "#todo"];
  return null;
}

/**
 * Complete a task line (Space Command's rule):
 * - `- [ ] text #todo` → `- [x] text #todone` (aliases kept)
 * - `- text #todo` → `- [x] text #todone` (box inserted)
 * - under a tagged heading: the box toggles, no tag is written
 * - a tagged heading with children: refused
 * - a struck line, or one already done: refused, left alone
 */
export function completeTaskLine(line: string, ctx: LineContext = {}): WriteResult {
  if (isStruck(line)) return { ok: false, reason: "That line is already done." };

  if (headingLevel(line)) {
    if (ctx.headingHasChildren) {
      return { ok: false, reason: "Complete the items under this heading one by one." };
    }
    const rename = doneFormOf(line);
    if (!rename) return { ok: false, reason: "That heading isn't a task." };
    return { ok: true, line: renameTag(line, ...rename) };
  }

  const box = boxState(line);
  const rename = doneFormOf(line);

  if (hasAnyTag(line, [...IDEA_TAGS, ...PRINCIPLE_TAGS]) && !rename) {
    return { ok: false, reason: "That line isn't a task." };
  }

  if (ctx.headingKind === "task" && !rename && !hasAnyTag(line, DONE_TAGS)) {
    if (box === true) return { ok: false, reason: "That item is already done." };
    if (box === false) return { ok: true, line: setBox(line, true) };
    if (BULLET.test(line)) return { ok: true, line: line.replace(BULLET, "$1[x] ") };
    return { ok: false, reason: "That line isn't a task." };
  }

  if (!rename) {
    return hasAnyTag(line, DONE_TAGS)
      ? { ok: false, reason: "That item is already done." }
      : { ok: false, reason: "That line isn't a task." };
  }

  let out = renameTag(line, ...rename);
  if (box === false) out = setBox(out, true);
  else if (box === null && BULLET.test(out)) out = out.replace(BULLET, "$1[x] ");
  return { ok: true, line: out };
}

/**
 * Reopen a done task line: `#todone` → `#todo` (aliases kept), box
 * unchecked. Under a tagged heading only the box changes. A struck line
 * is left alone.
 */
export function reopenTaskLine(line: string, ctx: LineContext = {}): WriteResult {
  if (isStruck(line)) return { ok: false, reason: "That line is struck through; reopen it by hand." };

  const box = boxState(line);
  const rename = openFormOf(line);

  if (!rename) {
    if (ctx.headingKind === "task" && !ownKind(line) && box === true) return { ok: true, line: setBox(line, false) };
    return { ok: false, reason: "That item isn't done." };
  }

  let out = renameTag(line, ...rename, true);
  if (box === true) out = setBox(out, false);
  return { ok: true, line: out };
}

/**
 * The tag write that follows a checkbox toggle, or null for none. `line`
 * is the line *after* the toggle; its box state says which way it went.
 * - checked with `#todo(s)` → `#todone(s)`; unchecked with `#todone(s)` → `#todo(s)`
 * - under a tagged heading: nothing (the heading carries the tag)
 * - struck lines, idea and principle lines: nothing
 */
export function syncCheckboxToggle(line: string, ctx: LineContext = {}): string | null {
  const box = boxState(line);
  if (box === null || isStruck(line)) return null;
  if (hasAnyTag(line, [...IDEA_TAGS, ...PRINCIPLE_TAGS])) return null;

  // Under a tagged heading the box is the whole state — unless the child
  // carries its own task tag, which then follows the box like any other line.
  if (ctx.headingKind && !hasAnyTag(line, [...TASK_TAGS, ...DONE_TAGS])) return null;

  const rename = box ? doneFormOf(line) : openFormOf(line);
  if (!rename) return null;
  // Both forms present (e.g. `#todo … #todone`): the line already reads done/open.
  if (box && hasAnyTag(line, DONE_TAGS)) return null;
  if (!box && hasAnyTag(line, TASK_TAGS)) return null;

  return renameTag(line, ...rename, !box);
}

/**
 * Kind tag to append to a child line leaving its tagged heading (moved to
 * another file), so it stays an item there. Null when the line already
 * carries a kind tag or the heading has none.
 */
export function kindTagForDetachedChild(line: string, heading: string): string | null {
  if (hasAnyTag(line, KIND_TAGS)) return null;
  switch (taggedHeadingKind(heading)) {
    case "task": return boxState(line) === true ? "#todone" : "#todo";
    case "idea": return "#idea";
    case "principle": return "#principle";
    default: return null;
  }
}

/** Appends a tag at the end of the line (Space Command: new tags always go last). */
export function appendTag(line: string, tag: string): string {
  return `${line.trimEnd()} ${tag}`;
}

/** Read-as-done: a struck line, a checked box, or a done tag. */
export function readsAsDone(line: string): boolean {
  return isStruck(line) || boxState(line) === true || hasAnyTag(line, DONE_TAGS);
}

/**
 * Sort rank for a task line by priority: `#focus` first, then `#p0`–`#p4`,
 * then unprioritized, then snoozed. Lower sorts first.
 */
export function priorityRank(line: string): number {
  const tags = lineTags(line);
  if (tags.includes("#focus")) return 0;
  for (let p = 0; p <= 4; p++) if (tags.includes(`#p${p}`)) return 1 + p;
  if (tags.some((t) => t === "#snooze" || t === "#snoozed" || t === "#future")) return 7;
  return 6;
}

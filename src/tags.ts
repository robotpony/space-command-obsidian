/**
 * Space Command's tag vocabulary and write rules, one place (PLAN.md ›
 * "Space Command's write rules"). Pure, line-in/line-out. Mirrors Space
 * Command's `Tags/Tag.swift`, `Tags/TagExtractor.swift`,
 * `Mutations/Mutator.swift` and `Mutations/LineEdit.swift`.
 *
 * Rules kept here: tags are renamed in place and keep their alias form
 * (#todo ↔ #todone, #todos ↔ #todones) and their case (#TODO → #TODONE);
 * new tags go at the end of the line; no date stamp is ever written; a
 * struck line is never "fixed" by the checkbox sync; a line under a tagged
 * heading never gains a kind tag. Section rules follow Space Command's
 * TaggedLinesParser.swift: any heading level opens a section when it
 * carries an open kind tag, a done heading (`#todone`) doesn't, and a
 * child's own kind tag wins over the heading's.
 */

import { headingLevel } from "./blocks";

export const TASK_TAGS = ["#todo", "#todos"] as const;
export const DONE_TAGS = ["#todone", "#todones"] as const;
export const IDEA_TAGS = ["#idea", "#ideas", "#ideation"] as const;
export const PRINCIPLE_TAGS = ["#principle", "#principles"] as const;
export const KIND_TAGS: readonly string[] = [...TASK_TAGS, ...DONE_TAGS, ...IDEA_TAGS, ...PRINCIPLE_TAGS];
export const FOCUS_TAG = "#focus";
export const PRIORITY_TAGS = ["#p0", "#p1", "#p2", "#p3", "#p4"] as const;
/** The tag snooze writes. */
export const SNOOZE_TAG = "#snooze";
/** Read as snoozed; `#future` and `#snoozed` are never written or renamed, only removed by unsnooze. */
export const SNOOZE_TAGS = [SNOOZE_TAG, "#snoozed", "#future"] as const;

export type ItemKind = "task" | "idea" | "principle";

/** What a tag means to Space Command. Every tag outside the vocabulary is a project/category tag. */
export type TagRole = "todo" | "todone" | "idea" | "principle" | "focus" | "priority" | "snooze" | "category";

export function tagRole(tag: string): TagRole {
  const name = tag.toLowerCase();
  if ((TASK_TAGS as readonly string[]).includes(name)) return "todo";
  if ((DONE_TAGS as readonly string[]).includes(name)) return "todone";
  if ((IDEA_TAGS as readonly string[]).includes(name)) return "idea";
  if ((PRINCIPLE_TAGS as readonly string[]).includes(name)) return "principle";
  if (name === FOCUS_TAG) return "focus";
  if ((PRIORITY_TAGS as readonly string[]).includes(name)) return "priority";
  if ((SNOOZE_TAGS as readonly string[]).includes(name)) return "snooze";
  return "category";
}

export function isVocabularyTag(tag: string): boolean {
  return tagRole(tag) !== "category";
}

/** Where a line sits, as far as the write rules care. */
export interface LineContext {
  /** Kind of the tagged heading the line sits under, if any; the heading carries the tag. */
  headingKind?: ItemKind;
  /** The line is a tagged heading with child lines (completion refuses). */
  headingHasChildren?: boolean;
}

export type WriteResult = { ok: true; line: string } | { ok: false; reason: string };

// MARK: - Finding tags

/** A tag as written on a line. */
export interface FoundTag {
  /** As written, `#` included (`#Todos`). */
  raw: string;
  /** Lower-cased, `#` included. */
  name: string;
  /** UTF-16 offsets in the line, `#` included; `to` is exclusive. */
  from: number;
  to: number;
}

/**
 * Per-index flag: true inside an inline code span, backticks included. A
 * run of N backticks opens a span that closes at the next run of exactly
 * N; an unclosed run is literal text (TagExtractor.codeSpanMask).
 */
export function codeSpanMask(line: string): boolean[] {
  const mask: boolean[] = new Array(line.length).fill(false);
  const runLength = (from: number) => {
    let end = from;
    while (line[end] === "`") end++;
    return end - from;
  };
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") { i++; continue; }
    const open = runLength(i);
    let search = i + open;
    let closed = false;
    while (search < line.length) {
      if (line[search] === "`") {
        const run = runLength(search);
        if (run === open) {
          mask.fill(true, i, search + run);
          i = search + run;
          closed = true;
          break;
        }
        search += run;
      } else {
        search++;
      }
    }
    if (!closed) i += open;
  }
  return mask;
}

const TAG = /#[\p{L}\p{N}_/-]+/gu;

/**
 * Tags on a line, Space Command's way: a `#` at the start of the line or
 * after whitespace, running over letters, digits, `_`, `-` and `/`, with at
 * least one non-digit (`#123` is an issue number). Tags in inline code
 * spans are skipped; fenced code is the caller's job.
 */
export function findTags(line: string): FoundTag[] {
  const mask = codeSpanMask(line);
  const tags: FoundTag[] = [];
  for (const match of line.matchAll(TAG)) {
    const from = match.index!;
    if (mask[from] || (from > 0 && !/\s/.test(line[from - 1]))) continue;
    if (/^#\d+$/.test(match[0])) continue;
    tags.push({ raw: match[0], name: match[0].toLowerCase(), from, to: from + match[0].length });
  }
  return tags;
}

/** Tags on the line outside code spans, lower-cased. */
export function lineTags(line: string): string[] {
  return findTags(line).map((t) => t.name);
}

export function hasAnyTag(line: string, tags: readonly string[]): boolean {
  return lineTags(line).some((t) => tags.includes(t));
}

/**
 * Kind named by the line's own open kind tag, if any: idea over principle
 * over task, as in TaggedLinesParser.kind(of:): a line tagged `#todo` and
 * `#idea` is an idea not yet made a task.
 */
export function ownKind(line: string): ItemKind | null {
  if (hasAnyTag(line, IDEA_TAGS)) return "idea";
  if (hasAnyTag(line, PRINCIPLE_TAGS)) return "principle";
  if (hasAnyTag(line, TASK_TAGS)) return "task";
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

// MARK: - Line edits

function splice(line: string, from: number, to: number, insert: string): string {
  return line.slice(0, from) + insert + line.slice(to);
}

/** `to`, written in the case style of `tag` (`#TODO` → `#TODONE`). */
function inCaseOf(tag: FoundTag, to: string): string {
  const shouted = tag.raw === tag.raw.toUpperCase() && tag.raw !== tag.raw.toLowerCase();
  return shouted ? to.toUpperCase() : to;
}

/**
 * Renames every tag named in `renames` (lower-case name → new tag), in
 * place. With `dropStamp`, an `@YYYY-MM-DD` directly after a renamed tag
 * goes too (for reopening legacy `#todone @2026-05-08` lines).
 */
function renameTags(line: string, renames: Record<string, string>, dropStamp = false): string {
  const tags = findTags(line).filter((t) => t.name in renames);
  // Right to left, so earlier offsets stay valid.
  for (const tag of tags.reverse()) {
    let to = tag.to;
    if (dropStamp) {
      const stamp = line.slice(to).match(/^\s+@\d{4}-\d{2}-\d{2}(?![\w-])/);
      if (stamp) to += stamp[0].length;
    }
    line = splice(line, tag.from, to, inCaseOf(tag, renames[tag.name]));
  }
  return line;
}

/** Removes each tag and one space beside it (the one before, else the one after). */
function removeTags(line: string, tags: FoundTag[]): string {
  for (const tag of [...tags].sort((a, b) => b.from - a.from)) {
    let { from, to } = tag;
    if (from > 0 && line[from - 1] === " ") from--;
    else if (line[to] === " ") to++;
    line = splice(line, from, to, "");
  }
  return line;
}

function tagsWithRole(line: string, role: TagRole): FoundTag[] {
  return findTags(line).filter((t) => tagRole(t.name) === role);
}

/**
 * Appends a tag at the end of the line's text, before any trailing
 * whitespace, so a Markdown hard break stays one (Space Command: new tags
 * always go last).
 */
export function appendTag(line: string, tag: string): string {
  const end = line.trimEnd().length;
  return splice(line, end, end, end === 0 ? tag : ` ${tag}`);
}

const BOX = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;
const BULLET = /^(\s*(?:[-*+]|\d+[.)])\s+)/;
const CONTENT_START = /^(?:\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?|#{1,6}\s+|\s*)/;

/** true/false for a checked/unchecked task box, null for a line without one. */
export function boxState(line: string): boolean | null {
  const match = line.match(BOX);
  return match ? match[2] !== " " : null;
}

function setBox(line: string, checked: boolean): string {
  return line.replace(BOX, `$1[${checked ? "x" : " "}]`);
}

/**
 * Span of the item's own text: after the list marker and box (or heading
 * marks, or indent), before the trailing run of tags and whitespace
 * (LineEdit.textSpan).
 */
function textSpan(line: string): [number, number] {
  const start = line.match(CONTENT_START)![0].length;
  const tags = findTags(line).filter((t) => t.from >= start);
  let end = line.length;
  for (;;) {
    while (end > start && /[ \t]/.test(line[end - 1])) end--;
    const last = tags[tags.length - 1];
    if (!last || last.to !== end) break;
    end = last.from;
    tags.pop();
  }
  return [start, Math.max(start, end)];
}

/** `~~…~~` around the line's text (after any list marker and box): Space Command's "Let Go". */
export function isStruck(line: string): boolean {
  const body = line.replace(BOX, "").replace(BULLET, "").trim();
  return /^~~.+~~/.test(body);
}

/** Wraps the item's text in `~~`, leaving trailing tags outside. Null when there's no text. */
function strikeThrough(line: string): string | null {
  const [start, end] = textSpan(line);
  if (end === start) return null;
  return splice(splice(line, end, end, "~~"), start, start, "~~");
}

/** Removes the `~~` wrapping the item's text, or null when it isn't wrapped. */
function unstrike(line: string): string | null {
  const [start, end] = textSpan(line);
  const text = line.slice(start, end);
  if (text.length < 4 || !text.startsWith("~~") || !text.endsWith("~~")) return null;
  return splice(splice(line, end - 2, end, ""), start, start + 2, "");
}

const DONE_FORM: Record<string, string> = { "#todo": "#todone", "#todos": "#todones" };
const OPEN_FORM: Record<string, string> = { "#todone": "#todo", "#todones": "#todos" };
const TASK_FORM_OF_IDEA: Record<string, string> = { "#idea": "#todo", "#ideas": "#todos", "#ideation": "#todo" };

// MARK: - Completion

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

  const hasTask = hasAnyTag(line, TASK_TAGS);

  if (headingLevel(line)) {
    if (ctx.headingHasChildren) {
      return { ok: false, reason: "Complete the items under this heading one by one." };
    }
    if (!hasTask) return { ok: false, reason: "That heading isn't a task." };
    return { ok: true, line: renameTags(line, DONE_FORM) };
  }

  const box = boxState(line);

  if (hasAnyTag(line, [...IDEA_TAGS, ...PRINCIPLE_TAGS]) && !hasTask) {
    return { ok: false, reason: "That line isn't a task." };
  }

  if (ctx.headingKind === "task" && !hasTask && !hasAnyTag(line, DONE_TAGS)) {
    if (box === true) return { ok: false, reason: "That item is already done." };
    if (box === false) return { ok: true, line: setBox(line, true) };
    if (BULLET.test(line)) return { ok: true, line: line.replace(BULLET, "$1[x] ") };
    return { ok: false, reason: "That line isn't a task." };
  }

  if (!hasTask) {
    return hasAnyTag(line, DONE_TAGS)
      ? { ok: false, reason: "That item is already done." }
      : { ok: false, reason: "That line isn't a task." };
  }

  let out = renameTags(line, DONE_FORM);
  if (box === false) out = setBox(out, true);
  else if (box === null && BULLET.test(out)) out = out.replace(BULLET, "$1[x] ");
  return { ok: true, line: out };
}

/**
 * "Let Go" an idea or principle: tags are left alone. A box is checked
 * (Space Command's Mutator checks a box when there is one); a line with
 * no box is struck through, trailing tags left outside the `~~`.
 */
export function letGoLine(line: string, ctx: LineContext = {}): WriteResult {
  if (isStruck(line) || boxState(line) === true) return { ok: false, reason: "That line is already done." };
  if (headingLevel(line) && ctx.headingHasChildren) {
    return { ok: false, reason: "Complete the items under this heading one by one." };
  }
  if (boxState(line) === false) return { ok: true, line: setBox(line, true) };
  const struck = strikeThrough(line);
  return struck ? { ok: true, line: struck } : { ok: false, reason: "That line has no text to strike through." };
}

/**
 * Mark done, whatever the line is: tasks by `completeTaskLine`, ideas and
 * principles by `letGoLine`. A child's own kind tag wins over its heading's.
 */
export function completeLine(line: string, ctx: LineContext = {}): WriteResult {
  const kind = ownKind(line) ?? (hasAnyTag(line, DONE_TAGS) ? "task" : ctx.headingKind ?? "task");
  return kind === "task" ? completeTaskLine(line, ctx) : letGoLine(line, ctx);
}

/**
 * Reopen a done line (Space Command's rule): the box unchecked,
 * `#todone` → `#todo` (aliases kept, a legacy `@date` after it dropped),
 * and a struck line unstruck. Under a tagged heading that's only the box.
 */
export function reopenLine(line: string): WriteResult {
  let out = line;
  if (boxState(out) === true) out = setBox(out, false);
  out = renameTags(out, OPEN_FORM, true);
  out = unstrike(out) ?? out;
  return out !== line ? { ok: true, line: out } : { ok: false, reason: "That item isn't done." };
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

  // Both forms present (e.g. `#todo … #todone`): the line already reads done/open.
  if (box && (hasAnyTag(line, DONE_TAGS) || !hasAnyTag(line, TASK_TAGS))) return null;
  if (!box && (hasAnyTag(line, TASK_TAGS) || !hasAnyTag(line, DONE_TAGS))) return null;

  return box ? renameTags(line, DONE_FORM) : renameTags(line, OPEN_FORM, true);
}

// MARK: - Other tag writes

/**
 * Set priority 0–4, or null for none: the first `#pN` is replaced in
 * place and any others dropped; appended when there's none. A priority
 * inherited from a heading isn't on the line, so "none" refuses there.
 */
export function setPriority(line: string, priority: number | null): WriteResult {
  const existing = tagsWithRole(line, "priority");
  if (priority === null) {
    if (existing.length === 0) return { ok: false, reason: "It has no priority." };
    return { ok: true, line: removeTags(line, existing) };
  }
  const tag = PRIORITY_TAGS[priority];
  if (!tag) return { ok: false, reason: `There's no priority ${priority}.` };
  if (existing.length === 0) return { ok: true, line: appendTag(line, tag) };
  if (existing.length === 1 && existing[0].name === tag) return { ok: false, reason: `Already ${tag}.` };
  const [first, ...others] = existing;
  // `first` is leftmost, so removing the others leaves its offsets valid.
  const trimmed = removeTags(line, others);
  return { ok: true, line: splice(trimmed, first.from, first.to, tag) };
}

export function isFocused(line: string): boolean {
  return tagsWithRole(line, "focus").length > 0;
}

/** Focus appends `#focus`; unfocus removes every `#focus` on the line. */
export function toggleFocus(line: string): WriteResult {
  const focus = tagsWithRole(line, "focus");
  return focus.length
    ? { ok: true, line: removeTags(line, focus) }
    : { ok: true, line: appendTag(line, FOCUS_TAG) };
}

export function isSnoozed(line: string): boolean {
  return tagsWithRole(line, "snooze").length > 0;
}

/** Snooze appends `#snooze`; never `#future` or `#snoozed`. */
export function snoozeLine(line: string): WriteResult {
  if (isSnoozed(line)) return { ok: false, reason: "Already snoozed." };
  return { ok: true, line: appendTag(line, SNOOZE_TAG) };
}

/** Unsnooze removes every snooze tag on the line, `#future` and `#snoozed` included. */
export function unsnoozeLine(line: string, ctx: LineContext = {}): WriteResult {
  const snoozes = tagsWithRole(line, "snooze");
  if (snoozes.length === 0) {
    return { ok: false, reason: ctx.headingKind ? "It isn't snoozed on this line." : "It isn't snoozed." };
  }
  return { ok: true, line: removeTags(line, snoozes) };
}

export function toggleSnooze(line: string, ctx: LineContext = {}): WriteResult {
  return isSnoozed(line) ? unsnoozeLine(line, ctx) : snoozeLine(line);
}

/**
 * Make a task from an idea: `#idea`/`#ideation` → `#todo`, `#ideas` →
 * `#todos`, in place. An untagged child of an idea heading gains `#todo`
 * (a child's own kind tag wins over the heading's).
 */
export function makeTaskFromIdea(line: string, ctx: LineContext = {}): WriteResult {
  if (hasAnyTag(line, IDEA_TAGS)) return { ok: true, line: renameTags(line, TASK_FORM_OF_IDEA) };
  if (ctx.headingKind === "idea" && !ownKind(line) && !hasAnyTag(line, DONE_TAGS)) {
    return { ok: true, line: appendTag(line, "#todo") };
  }
  return { ok: false, reason: "It isn't an idea." };
}

/**
 * Convert a line to a task: `- [ ] text #todo`; under a tagged task
 * heading, plain `- [ ] text` (the heading carries the tag). A bullet
 * gains a box; a plain line gains `- [ ] ` at its indent.
 */
export function convertLineToTask(line: string, ctx: LineContext = {}): WriteResult {
  if (headingLevel(line)) return { ok: false, reason: "That's a heading." };
  if (line.trim() === "") return { ok: false, reason: "That line is empty." };
  if (hasAnyTag(line, KIND_TAGS)) return { ok: false, reason: "That line is already an item." };

  const underTaskHeading = ctx.headingKind === "task";
  if (underTaskHeading && boxState(line) !== null) return { ok: false, reason: "That line is already a task." };

  let out: string;
  if (boxState(line) !== null) out = line;
  else if (BULLET.test(line)) out = line.replace(BULLET, "$1[ ] ");
  else out = line.replace(/^(\s*)/, "$1- [ ] ");
  return { ok: true, line: underTaskHeading ? out : appendTag(out, "#todo") };
}

// MARK: - Tidy

const TAG_TOKEN = /^#[\p{L}\p{N}_/-]+$/u;
const HANDLE_TOKEN = /^@\p{L}(?:[\p{L}\p{N}_.-]*[\p{L}\p{N}_])?$/u;
const DATE_WORDS = new Set(["@today", "@tomorrow", "@yesterday"]);

/** Tidy order: kind, priority, focus/snooze, project tags, handles. */
function tidyGroup(token: string): number {
  if (token.startsWith("@")) return 4;
  switch (tagRole(token)) {
    case "todo": case "todone": case "idea": case "principle": return 0;
    case "priority": return 1;
    case "focus": return 2;
    case "snooze": return 2;
    default: return 3;
  }
}

/**
 * Tidy tags: reorders the line's trailing run of tags and `@handle`s into
 * kind, priority, focus/snooze, project tags, handles (stable within each
 * group), and drops repeats (case-insensitive, first spelling kept). Tags
 * inside the sentence or in code spans stay put, and nothing is renamed:
 * `#todo` and `#todos` are different tags.
 */
export function tidyTags(line: string): WriteResult {
  const start = line.match(CONTENT_START)![0].length;
  const trailing = line.slice(line.trimEnd().length);
  const tokens = line.slice(start, line.length - trailing.length).split(/(\s+)/);
  // tokens alternates word, space, word, ...; walk words from the right.
  let first = tokens.length;
  for (let i = tokens.length - 1; i >= 0; i -= 2) {
    const word = tokens[i];
    const isTag = TAG_TOKEN.test(word) && !/^#\d+$/.test(word);
    const isHandle = HANDLE_TOKEN.test(word) && !DATE_WORDS.has(word.toLowerCase());
    if (!isTag && !isHandle) break;
    first = i;
  }
  const run = tokens.slice(first).filter((_, i) => i % 2 === 0);
  if (run.length === 0) return { ok: false, reason: "No tags at the end of the line." };

  const seen = new Set<string>();
  const unique = run.filter((word) => {
    const key = word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const ordered = unique
    .map((word, index) => ({ word, index, group: tidyGroup(word) }))
    .sort((a, b) => a.group - b.group || a.index - b.index)
    .map((t) => t.word);

  const head = line.slice(0, start) + tokens.slice(0, first).join("");
  const out = head + ordered.join(" ") + trailing;
  return out !== line ? { ok: true, line: out } : { ok: false, reason: "Tags are already tidy." };
}

// MARK: - Reading

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
  if (tags.includes(FOCUS_TAG)) return 0;
  for (let p = 0; p < PRIORITY_TAGS.length; p++) if (tags.includes(PRIORITY_TAGS[p])) return 1 + p;
  if (tags.some((t) => tagRole(t) === "snooze")) return 7;
  return 6;
}

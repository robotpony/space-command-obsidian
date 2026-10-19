/**
 * `@handle` mentions, Space Command's way (`Tags/MentionExtractor.swift`),
 * and the pure pieces of the team note (`team.md`). Pure, string-in.
 *
 * A mention starts at an `@` at the start of the line, after whitespace or
 * after `(`, so an email address or a URL's `/@user` isn't one. The handle
 * starts with a letter and runs over letters, digits, `_`, `-` and `.`,
 * with a trailing `.` or `-` left out as punctuation. `@2026-10-17` doesn't
 * start with a letter, and `@today`/`@tomorrow`/`@yesterday` are dates.
 * Mentions in inline code spans are skipped; fenced code is the caller's
 * job (`taskLineHandles` handles it).
 */

import { fencedLines, headingLevel } from "./blocks";
import { codeSpanMask, DONE_TAGS, hasAnyTag, ownKind, taggedHeadingKind, TASK_TAGS } from "./tags";
import { TeamMember } from "./types";

const DAY_WORDS = new Set(["today", "tomorrow", "yesterday"]);

const isHandleChar = (ch: string) => /[\p{L}\p{N}_.-]/u.test(ch);

/** Handles mentioned on a line, `@` left off, in order (duplicates kept). */
export function findMentions(line: string): string[] {
  const chars = Array.from(line);
  // codeSpanMask indexes UTF-16 units; map each code point to its offset.
  const mask = codeSpanMask(line);
  const offsets: number[] = [];
  let offset = 0;
  for (const ch of chars) {
    offsets.push(offset);
    offset += ch.length;
  }

  const mentions: string[] = [];
  let i = 0;
  while (i < chars.length) {
    if (chars[i] !== "@" || mask[offsets[i]]) { i++; continue; }
    if (i > 0 && !/\s/u.test(chars[i - 1]) && chars[i - 1] !== "(") { i++; continue; }
    if (i + 1 >= chars.length || !/\p{L}/u.test(chars[i + 1])) { i++; continue; }
    let end = i + 1;
    while (end < chars.length && !mask[offsets[end]] && isHandleChar(chars[end])) end++;
    while (end > i + 1 && (chars[end - 1] === "." || chars[end - 1] === "-")) end--;
    const handle = chars.slice(i + 1, end).join("");
    if (!DAY_WORDS.has(handle.toLowerCase())) mentions.push(handle);
    i = end;
  }
  return mentions;
}

/** True if `text` is a whole handle as `findMentions` would read it (no `@`). */
export function isValidHandle(text: string): boolean {
  return findMentions(`@${text}`)[0] === text;
}

/**
 * Handles mentioned on the task lines of a note: lines carrying a task tag
 * (open or done), and the lines of a section under a tagged task heading,
 * except a child that names another kind itself. Fenced code is skipped.
 */
export function taskLineHandles(content: string): string[] {
  const lines = content.split("\n");
  const fenced = fencedLines(lines);
  const handles: string[] = [];
  let underTaskHeading = false;
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const line = lines[i];
    if (headingLevel(line)) underTaskHeading = taggedHeadingKind(line) === "task";
    const ownsTask = hasAnyTag(line, TASK_TAGS) || hasAnyTag(line, DONE_TAGS);
    const inSection = underTaskHeading && ownKind(line) === null;
    if (ownsTask || inSection) handles.push(...findMentions(line));
  }
  return handles;
}

/** `handles` with case-insensitive duplicates and `exclude` (also case-insensitive) dropped, first spelling kept. */
export function uniqueHandles(handles: Iterable<string>, exclude: Iterable<string> = []): string[] {
  const seen = new Set(Array.from(exclude, (h) => h.toLowerCase()));
  const out: string[] = [];
  for (const handle of handles) {
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(handle);
  }
  return out;
}

// MARK: - team.md

const TEAM_LINE = /^-\s+@([\w][\w.-]*)\s*(?:—|-)\s*(.+)$/;
const ME_SUFFIX = /\s*\(me\)\s*$/i;

/** Members listed in a team note: `- @handle — Name`, `(me)` marking yours. */
export function parseTeam(content: string): TeamMember[] {
  const members: TeamMember[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(TEAM_LINE);
    if (!match) continue;
    let name = match[2].trim();
    const isMe = ME_SUFFIX.test(name);
    if (isMe) name = name.replace(ME_SUFFIX, "").trim();
    members.push({ handle: match[1], name, isMe });
  }
  return members;
}

/** The team note with a `- @handle — handle` line appended per handle. */
export function appendTeamLines(content: string, handles: string[]): string {
  if (handles.length === 0) return content;
  const lines = handles.map((h) => `- @${h} — ${h}`).join("\n");
  const head = content.trimEnd();
  return (head ? head + "\n" : "") + lines + "\n";
}

import { fencedLines } from "./blocks";
import { isBoldSubheading, isTaggedHeading, lineContent, normalizedText, readsAsDone, sectionLabel } from "./tags";

/**
 * Pure line finding for switching between Obsidian and Space Command
 * (PLAN.md › Phase 6). Both apps send a 1-based `line` plus the item's
 * anchor `text` and section `heading`, normalised as Space Command's
 * anchors are, so either side lands on the item after it moved.
 * No Obsidian types; lines are 0-based here.
 */

/** Lines in front matter (MarkdownDocument.frontMatterRange) or a code fence: never items. */
export function nonBodyLines(lines: string[]): boolean[] {
  const skip = fencedLines(lines);
  const first = lines[0]?.trim();
  if (first === "---" || first === "+++") {
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === first || (first === "---" && line === "...")) {
        skip.fill(true, 0, i + 1);
        break;
      }
    }
  }
  return skip;
}

const HEADING = /^ {0,3}#{1,6}(?:[ \t]|$)/;

/**
 * Section label of every line, as Space Command's TaggedLinesParser
 * tracks it: the label of the nearest heading above (a heading is in its
 * own section), or a bold sub-heading line outside a tagged section.
 * Null where there's none or the label is empty.
 */
export function sectionLabels(lines: string[], skip = nonBodyLines(lines)): (string | null)[] {
  const labels: (string | null)[] = [];
  let section: string | null = null;
  let tagged = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!skip[i]) {
      if (HEADING.test(line)) {
        section = sectionLabel(lineContent(line)) || null;
        // A done heading closes its section, so bold lines under it are labels again.
        tagged = isTaggedHeading(line) && normalizedText(line) !== "" && !readsAsDone(line);
      } else if (!tagged && !/^\s*(?:[-*+]|\d+[.)])(?:\s|$)/.test(line) && isBoldSubheading(line)) {
        section = sectionLabel(line) || null;
      }
    }
    labels.push(section);
  }
  return labels;
}

export interface LandingTarget {
  /** 1-based; missing or bad reads as line 1. */
  line?: number;
  /** Normalised item text (normalizedText). */
  text?: string;
  /** Section label (sectionLabel). */
  heading?: string;
}

/**
 * 0-based line to land on: the given line if its text matches, else the
 * matching line nearest it, `heading` breaking ties (then the earlier
 * line); no match, or no `text`, → the given line clamped to the file.
 */
export function landingLine(lines: string[], target: LandingTarget): number {
  const last = Math.max(0, lines.length - 1);
  const wanted = Number.isFinite(target.line) ? Math.trunc(target.line! - 1) : 0;
  const given = Math.min(Math.max(wanted, 0), last);
  const text = target.text?.trim() ?? "";
  if (!text) return given;

  const skip = nonBodyLines(lines);
  if (!skip[given] && normalizedText(lines[given]) === text) return given;

  const labels = target.heading ? sectionLabels(lines, skip) : null;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < lines.length; i++) {
    if (skip[i] || normalizedText(lines[i]) !== text) continue;
    // Distance first; a heading match wins a tie.
    const score = Math.abs(i - given) * 2 + (labels && labels[i] === target.heading ? 0 : 1);
    if (score < bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best >= 0 ? best : given;
}

/** Anchor of a line, for sending: its normalised text and section label (either may be empty). */
export function lineAnchor(lines: string[], line: number): { text: string; heading: string } {
  const skip = nonBodyLines(lines);
  if (skip[line]) return { text: "", heading: "" };
  return { text: normalizedText(lines[line]), heading: sectionLabels(lines, skip)[line] ?? "" };
}

/** Percent-encoding for a query value: spaces as %20, never `+`, which Swift's URLComponents reads literally. */
function query(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join("&");
}

export interface RevealParams {
  /** Absolute path of the note. */
  path: string;
  /** 0-based cursor line, or undefined when there's no cursor. */
  line?: number;
  text?: string;
  heading?: string;
}

/** `spacecommand://reveal?path=…&line=…&text=…&heading=…`, line 1-based. */
export function revealUrl({ path, line, text, heading }: RevealParams): string {
  return `spacecommand://reveal?${query({ path, line: line === undefined ? undefined : line + 1, text, heading })}`;
}

/**
 * Vault-relative path from a handler's `path`: an absolute path inside
 * `basePath` is made relative; otherwise leading slashes are trimmed and
 * it's taken as vault-relative.
 */
export function vaultRelativePath(path: string, basePath: string | null): string {
  const clean = path.replace(/\\/g, "/");
  if (basePath) {
    const base = basePath.replace(/\\/g, "/").replace(/\/+$/, "");
    if (clean.startsWith(base + "/")) return clean.slice(base.length + 1);
  }
  return clean.replace(/^\/+/, "");
}

import { moment } from "obsidian";
import { createNoticeFactory } from "./shared";

/** Logo prefix for Notice messages */
export const LOGO_PREFIX = "␣⌘";

/**
 * Show a notice with the styled Space Command logo badge.
 * Uses the shared notice factory pattern.
 */
export const showNotice = createNoticeFactory(LOGO_PREFIX, "space-command-logo");

export function formatDate(date: Date, format: string): string {
  return (moment as any)(date).format(format);
}

/**
 * Preset moment.js formats offered for `insertDateFormat` (the text
 * @today, @tomorrow, @yesterday, and /today, /tomorrow insert into a note).
 *
 * Labels are illustrative, not tied to the current date.
 */
export const DATE_FORMAT_PRESETS: { format: string; label: string }[] = [
  { format: "dddd, MMMM Do", label: "Tuesday, July 10th" },
  { format: "ddd, MMM D", label: "Tue, Jul 10" },
  { format: "MMMM D, YYYY", label: "July 10, 2026" },
  { format: "YYYY-MM-DD", label: "2026-07-10" },
  { format: "D/M/YYYY", label: "10/7/2026" },
];

/** "1 line", "3 lines" — every word this is used with pluralizes with a plain "s". */
export function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export interface TeamMember {
  handle: string;
  name: string;
  isMe: boolean;
}

export interface WarpedTodoSettings {
  /** Format @today/@tomorrow/@yesterday/@date and /today, /tomorrow insert into note text. Free-form (see DATE_FORMAT_PRESETS in utils.ts) since nothing parses these back out. */
  insertDateFormat: string;
  // Tab lock settings
  showTabLockButton: boolean;
  // Move history (recent move-to targets)
  moveHistory: string[];
  // Team file path
  teamFilePath: string;
  /** Resolve `[[Page Title]]` links by frontmatter title when the vault is a Hugo site. See HugoTitleLinks.ts. */
  resolveTitleLinks: boolean;
}

export const DEFAULT_SETTINGS: WarpedTodoSettings = {
  insertDateFormat: "dddd, MMMM Do",
  // Tab lock settings
  showTabLockButton: false,
  // Move history
  moveHistory: [],
  // Team file
  teamFilePath: "team.md",
  resolveTitleLinks: true,
};

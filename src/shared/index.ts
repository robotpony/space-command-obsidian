/**
 * Small plugin utilities, carried over from the pre-split monorepo. Local
 * copy; no longer synced with any other plugin.
 *
 * @example
 * ```ts
 * import { createNoticeFactory, SidebarManager } from "../shared";
 * ```
 */

// UI utilities
export { showNotice, createNoticeFactory } from "./ui/Notice";

// Plugin utilities
export { SidebarManager, type RefreshableView } from "./plugin/SidebarManager";

/**
 * Space Command's well-known task files (TaskFormat.swift `builtIn`):
 * matched by file name in any folder, ignoring case. Their checkboxes are
 * items without any tag, so a heading in one opens a block as if it were
 * tagged with the file's kind.
 */

import { ItemKind } from "./tags";

const TASK_FILES: Record<string, ItemKind> = {
  "plan.md": "task",
  "bugs.md": "task",
  "issues.md": "task",
  "todo.md": "task",
  "todos.md": "task",
  "ideas.md": "idea",
  "testing.md": "task",
  "tests.md": "task",
};

/** The item kind a well-known task file implies for its checkboxes, or null for any other path. */
export function taskFileKind(path: string | null | undefined): ItemKind | null {
  if (!path) return null;
  const name = path.split("/").pop()!.toLowerCase();
  return TASK_FILES[name] ?? null;
}

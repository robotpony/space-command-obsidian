import { Editor, Menu, Plugin } from "obsidian";
import { completeAllInBlock, taggedBlockAt, toCharChange } from "./blockOps";
import { applyOp, applyToggle, LineOp, OpResult, targetLines, toggleDone } from "./lineOps";
import {
  convertLineToTask,
  isFocused,
  isSnoozed,
  makeTaskFromIdea,
  PRIORITY_TAGS,
  setPriority,
  tidyTags,
  toggleFocus,
  toggleSnooze,
} from "./tags";
import { showNotice } from "./utils";

/**
 * Editor tag commands (PLAN.md › Phase 5), each following Space Command's
 * write rules (tags.ts): on the cursor's line, every item in a selection,
 * or a tagged heading's children. Each run is one editor transaction, so
 * one undo. Also in the editor's right-click menu.
 */

interface TagAction {
  id: string;
  /** Shown under the right-click menu's Priority submenu. */
  priority?: boolean;
  name: string;
  icon: string;
  run: (lines: string[], targets: number[]) => OpResult;
  /** Convert to tasks also takes plain lines in a selection. */
  anyLine?: boolean;
  /** Refuses on a tagged heading with children instead of acting on them. */
  refuseOnHeading?: string;
}

const op = (fn: LineOp) => (lines: string[], targets: number[]) => applyOp(lines, targets, fn);

const ACTIONS: TagAction[] = [
  {
    id: "toggle-done", name: "Mark done / reopen", icon: "check-square", run: toggleDone,
    // Never a whole block from its heading; ideas under it would be let go too.
    refuseOnHeading: "Complete the items under this heading one by one, or run Complete all under heading.",
  },
  {
    id: "toggle-focus", name: "Toggle focus", icon: "target",
    run: (lines, targets) => applyToggle(lines, targets, isFocused, toggleFocus, toggleFocus),
  },
  {
    id: "toggle-snooze", name: "Toggle snooze", icon: "alarm-clock-off",
    run: (lines, targets) => applyToggle(lines, targets, isSnoozed, toggleSnooze, toggleSnooze),
  },
  ...PRIORITY_TAGS.map((tag, p): TagAction => ({
    id: `set-priority-${p}`, name: `Set priority: P${p}`, icon: "signal", priority: true,
    run: op((line) => setPriority(line, p)),
  })),
  { id: "remove-priority", name: "Remove priority", icon: "signal-zero", priority: true, run: op((line) => setPriority(line, null)) },
  { id: "convert-to-task", name: "Convert to tasks", icon: "list-checks", run: op(convertLineToTask), anyLine: true },
  { id: "make-task-from-idea", name: "Make task from idea", icon: "lightbulb", run: op(makeTaskFromIdea) },
  { id: "tidy-tags", name: "Tidy tags", icon: "sparkles", run: op((line) => tidyTags(line)) },
];

function editorLines(editor: Editor): string[] {
  return editor.getValue().split("\n");
}

function runAction(editor: Editor, action: TagAction): void {
  const lines = editorLines(editor);
  const from = editor.getCursor("from");
  const to = editor.getCursor("to");
  const targets = targetLines(lines, { fromLine: from.line, toLine: to.line, toCh: to.ch }, action.anyLine);
  if (action.refuseOnHeading && from.line === to.line && !targets.includes(from.line)) {
    showNotice(action.refuseOnHeading);
    return;
  }
  const result = action.run(lines, targets);
  if (result.changes.length === 0) {
    showNotice(result.reason ?? "Nothing to change.");
    return;
  }
  editor.transaction({
    changes: result.changes.map(({ line, text }) => ({
      from: { line, ch: 0 },
      to: { line, ch: lines[line].length },
      text,
    })),
  });
}

/** "Complete all under heading": the open task children of the block at the cursor. */
function completeAllUnderHeading(editor: Editor): void {
  const lines = editorLines(editor);
  const block = taggedBlockAt(lines, editor.getCursor().line);
  if (!block) {
    showNotice("Cursor isn't in a tagged heading's block.");
    return;
  }
  const edit = completeAllInBlock(lines, block);
  if (!edit) {
    showNotice("No open tasks under this heading.");
    return;
  }
  const { from, to, insert } = toCharChange(lines, edit);
  editor.transaction({ changes: [{ from: editor.offsetToPos(from), to: editor.offsetToPos(to), text: insert }] });
}

export function registerTagCommands(plugin: Plugin): void {
  for (const action of ACTIONS) {
    plugin.addCommand({
      id: action.id,
      name: action.name,
      editorCallback: (editor) => runAction(editor, action),
    });
  }
  plugin.addCommand({
    id: "complete-all-under-heading",
    name: "Complete all under heading",
    editorCallback: completeAllUnderHeading,
  });

  plugin.registerEvent(
    plugin.app.workspace.on("editor-menu", (menu: Menu, editor: Editor) => {
      const addAction = (target: Menu, action: TagAction, title = action.name) =>
        target.addItem((item) =>
          item.setTitle(title).setIcon(action.icon).setSection("space-command").onClick(() => runAction(editor, action))
        );

      const priorities = ACTIONS.filter((a) => a.priority);
      for (const action of ACTIONS) {
        if (action.priority) {
          if (action !== priorities[0]) continue;
          // MenuItem.setSubmenu is real but untyped; fall back to flat items without it.
          let submenu: Menu | null = null;
          menu.addItem((item) => {
            item.setTitle("Priority").setIcon("signal").setSection("space-command");
            const set = (item as unknown as { setSubmenu?: () => Menu }).setSubmenu;
            submenu = set ? set.call(item) : null;
          });
          for (const p of priorities) {
            if (submenu) addAction(submenu, p, p.name.replace("Set priority: ", ""));
            else addAction(menu, p);
          }
          continue;
        }
        addAction(menu, action);
      }
      menu.addItem((item) =>
        item
          .setTitle("Complete all under heading")
          .setIcon("check-check")
          .setSection("space-command")
          .onClick(() => completeAllUnderHeading(editor))
      );
    })
  );
}

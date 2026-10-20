import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { Editor, FileSystemAdapter, MarkdownView, Plugin, TFile } from "obsidian";
import { landingLine, lineAnchor, revealUrl, vaultRelativePath } from "./landing";
import { SpaceCommandSettings } from "./types";
import { showNotice } from "./utils";

/**
 * Switching between Obsidian and Space Command (PLAN.md › Phase 6).
 *
 * - "Open in Space Command" opens `spacecommand://reveal` for the note and
 *   cursor line, with the line's anchor text and section heading.
 * - `obsidian://space-command?vault=…&path=…&line=…&text=…&heading=…` opens
 *   a note and lands on the item (landing.ts), then flashes the line.
 *
 * Neither writes to the vault.
 */

const HIGHLIGHT_MS = 1600;

const flashLine = StateEffect.define<number | null>();

/** A fading line decoration on the landed line; `null` clears it. */
const landedLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(flashLine)) continue;
      if (effect.value === null) return Decoration.none;
      const line = tr.state.doc.line(effect.value + 1);
      value = Decoration.set([Decoration.line({ class: "space-command-landed" }).range(line.from)]);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** The editor extension the highlight needs; register once. */
export const landedLineExtension = landedLine;

function editorView(editor: Editor): EditorView | null {
  return (editor as unknown as { cm?: EditorView }).cm ?? null;
}

function flash(editor: Editor, line: number): void {
  const view = editorView(editor);
  if (!view || !view.state.field(landedLine, false)) return;
  view.dispatch({ effects: flashLine.of(line) });
  window.setTimeout(() => {
    if (view.state.field(landedLine, false)) view.dispatch({ effects: flashLine.of(null) });
  }, HIGHLIGHT_MS);
}

function basePath(plugin: Plugin): string | null {
  const adapter = plugin.app.vault.adapter;
  return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
}

function openExternal(url: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { shell } = require("electron");
    shell.openExternal(url).catch(() => showNotice("Couldn't open Space Command. Is it installed?"));
  } catch {
    window.open(url);
  }
}

/** Opens Space Command at `file`, and at the cursor's line when there's an editor. */
export function openInSpaceCommand(plugin: Plugin, file: TFile, editor?: Editor): void {
  const base = basePath(plugin);
  if (!base) {
    showNotice("Open in Space Command needs the desktop app.");
    return;
  }
  const path = `${base.replace(/\/+$/, "")}/${file.path}`;
  if (!editor) {
    openExternal(revealUrl({ path }));
    return;
  }
  const line = editor.getCursor().line;
  const { text, heading } = lineAnchor(editor.getValue().split("\n"), line);
  openExternal(revealUrl({ path, line, text, heading }));
}

/** Handles `obsidian://space-command`: opens the note and lands on the item. */
async function openAtLine(plugin: Plugin, params: Record<string, string>): Promise<void> {
  const { workspace, vault } = plugin.app;
  if (!params.path) {
    showNotice("Space Command sent no note to open.");
    return;
  }
  const path = vaultRelativePath(params.path, basePath(plugin));
  const file = vault.getFileByPath(path);
  if (!file) {
    showNotice(`Couldn't find ${path} in this vault.`);
    return;
  }

  // Reuse a tab that already shows the note.
  const leaf =
    workspace.getLeavesOfType("markdown").find((l) => (l.view as MarkdownView).file?.path === file.path) ??
    workspace.getLeaf(false);
  if ((leaf.view as MarkdownView).file?.path !== file.path) await leaf.openFile(file);
  workspace.setActiveLeaf(leaf, { focus: true });

  const view = leaf.view;
  if (!(view instanceof MarkdownView)) return;
  const lines = view.getViewData().split("\n");
  const line = landingLine(lines, {
    line: params.line ? Number(params.line) : undefined,
    text: params.text,
    heading: params.heading,
  });

  if (view.getMode() === "preview") {
    // Reading view has no cursor; scroll there instead.
    view.setEphemeralState({ line });
    return;
  }
  const editor = view.editor;
  const pos = { line: Math.min(line, editor.lastLine()), ch: 0 };
  editor.setCursor(pos);
  editor.scrollIntoView({ from: pos, to: pos }, true);
  flash(editor, pos.line);
}

/** Ribbon click: the active note, at its cursor line when it's being edited. */
export function openActiveInSpaceCommand(plugin: Plugin): void {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  const file = view?.file ?? plugin.app.workspace.getActiveFile();
  if (!file || file.extension !== "md") {
    showNotice("Open a note first.");
    return;
  }
  openInSpaceCommand(plugin, file, view?.getMode() === "source" ? view.editor : undefined);
}

export function registerAppSwitch(plugin: Plugin, settings: () => SpaceCommandSettings): void {
  plugin.registerEditorExtension(landedLineExtension);

  plugin.addCommand({
    id: "open-in-space-command",
    name: "Open in Space Command",
    checkCallback: (checking) => {
      if (!settings().showOpenInSpaceCommand) return false;
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      const file = view?.file ?? plugin.app.workspace.getActiveFile();
      if (!file || file.extension !== "md") return false;
      if (!checking) openInSpaceCommand(plugin, file, view?.getMode() === "source" ? view.editor : undefined);
      return true;
    },
  });

  plugin.registerEvent(
    plugin.app.workspace.on("editor-menu", (menu, editor, info) => {
      if (!settings().showOpenInSpaceCommand || !info.file) return;
      const file = info.file;
      menu.addItem((item) =>
        item
          .setTitle("Open in Space Command")
          .setIcon("square-arrow-out-up-right")
          .setSection("space-command")
          .onClick(() => openInSpaceCommand(plugin, file, editor))
      );
    })
  );

  plugin.registerObsidianProtocolHandler("space-command", (params) => void openAtLine(plugin, params));
}

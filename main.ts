import {
  App,
  Editor,
  FileSystemAdapter,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  Vault,
} from "obsidian";
import { join, sep } from "path";
import { SlashCommandSuggest } from "./src/SlashCommandSuggest";
import { AtSuggest } from "./src/AtSuggest";
import { TeamManager } from "./src/TeamManager";
import { HELP_NOTE_PATH, HelpNoteManager } from "./src/HelpNoteManager";
import { WarpedTodoSettings, DEFAULT_SETTINGS } from "./src/types";
import { pluralize, showNotice, formatDate, DATE_FORMAT_PRESETS } from "./src/utils";
import { MoveTargetModal } from "./src/MoveTargetModal";
import { TabLockManager } from "./src/TabLockManager";
import { createHeaderSortPlugin, sortBlockAtCursor } from "./src/HeaderSortExtension";
import { createCheckboxSyncExtension } from "./src/CheckboxSyncExtension";
import { appendMoved, cutForMove, isMovableLine, toCharChange } from "./src/blockOps";
import { createHeaderChecklistExtension } from "./src/HeaderChecklistExtension";
import { registerTagCommands } from "./src/TagCommands";
import { registerTagSuggest } from "./src/TagSuggest";
import { detectVaultContentPrefix, HugoTitleLinkResolver } from "./src/HugoTitleLinks";
import { openActiveInSpaceCommand, registerAppSwitch } from "./src/AppSwitch";

export default class WarpedTodoPlugin extends Plugin {
  settings: WarpedTodoSettings;
  tabLockManager: TabLockManager;
  teamManager: TeamManager;
  helpNoteManager: HelpNoteManager;
  titleLinkResolver: HugoTitleLinkResolver;
  private spaceCommandRibbon: HTMLElement | null = null;

  async onload() {
    await this.loadSettings();

    // Initialize team manager
    this.teamManager = new TeamManager(this.app, this.settings.teamFilePath);
    this.teamManager.watchFile();

    // Initialize help note manager
    this.helpNoteManager = new HelpNoteManager(this.app);

    // Initialize tab lock manager
    this.tabLockManager = new TabLockManager(this.app);

    // Enable tab lock buttons if setting is enabled
    if (this.settings.showTabLockButton) {
      this.app.workspace.onLayoutReady(() => {
        this.tabLockManager.enable();
      });
    }

    this.app.workspace.onLayoutReady(async () => {
      await this.teamManager.load();
    });

    // Register editor extension for header sort buttons
    this.registerEditorExtension(createHeaderSortPlugin());

    // Register editor extension for auto-inserting checklists after tagged headers
    this.registerEditorExtension(createHeaderChecklistExtension());

    // Checkbox ↔ #todo/#todone sync, applied in the same transaction as the toggle
    this.registerEditorExtension(createCheckboxSyncExtension());

    // Register editor suggesters for slash commands and @date/@user
    this.registerEditorSuggest(new SlashCommandSuggest(this.app, this.settings));
    this.registerEditorSuggest(new AtSuggest(this.app, this.settings, this.teamManager));
    registerTagSuggest(this);

    // Tag and block commands, also in the editor's right-click menu
    registerTagCommands(this);

    // Open in Space Command, and the obsidian://space-command handler
    registerAppSwitch(this, () => this.settings);
    this.updateSpaceCommandRibbon();

    // Commands
    this.addCommand({
      id: "quick-add-todo",
      name: "Quick Add TODO",
      editorCallback: (editor, view) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        // If line is empty or whitespace, insert a new todo
        if (line.trim() === "") {
          editor.replaceRange("- [ ] #todo ", cursor);
          editor.setCursor({ line: cursor.line, ch: 6 });
        } else {
          // Append #todo to the end of the line
          const endOfLine = { line: cursor.line, ch: line.length };
          editor.replaceRange(" #todo", endOfLine);
        }
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "a",
        },
      ],
    });

    this.addCommand({
      id: "move-todo",
      name: "Move TODO to another file",
      editorCallback: (editor, view) => {
        const file = view.file;
        if (!file) return;
        const line = editor.getCursor().line;
        const lines = editor.getValue().split("\n");
        if (!isMovableLine(lines, line)) {
          showNotice("Cursor isn't on a TODO, idea, or tagged heading.");
          return;
        }

        new MoveTargetModal(
          this.app,
          this.settings.moveHistory,
          file.path,
          (targetFile) => void this.moveAtCursor(editor, line, targetFile)
        ).open();
      },
    });

    this.addCommand({
      id: "update-team-note",
      name: "Update team note",
      callback: () => void this.updateTeamNote(),
    });

    this.addCommand({
      id: "sort-block-at-cursor",
      name: "Sort block at cursor",
      editorCallback: (editor) => sortBlockAtCursor(editor),
    });

    // Title-based wiki links for a Hugo vault — see HugoTitleLinks.ts.
    this.titleLinkResolver = new HugoTitleLinkResolver(this.app);
    this.registerEvent(this.app.metadataCache.on("changed", (file) => this.titleLinkResolver.onFileChanged(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.titleLinkResolver.onFileDeleted(file.path)));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) this.titleLinkResolver.onFileRenamed(file, oldPath);
      })
    );
    this.app.workspace.onLayoutReady(() => void this.updateTitleLinkResolver());

    // Add settings tab
    this.addSettingTab(new WarpedTodoSettingTab(this.app, this));
  }

  /**
   * Turns title-based wiki links on or off per the setting and whether the
   * vault root is itself a Hugo site (see HugoTitleLinks.ts).
   */
  async updateTitleLinkResolver(): Promise<void> {
    const contentPrefix = this.settings.resolveTitleLinks
      ? await detectVaultContentPrefix(this.app.vault.adapter)
      : null;
    if (contentPrefix === null) {
      this.titleLinkResolver.disable();
    } else {
      this.titleLinkResolver.enable(contentPrefix);
    }
  }

  /** Shows the ribbon icon when both its setting and the command's are on. */
  updateSpaceCommandRibbon(): void {
    const wanted = this.settings.showOpenInSpaceCommand && this.settings.showSpaceCommandRibbon;
    if (wanted && !this.spaceCommandRibbon) {
      this.spaceCommandRibbon = this.addRibbonIcon("square-arrow-out-up-right", "Open in Space Command", () =>
        openActiveInSpaceCommand(this)
      );
    } else if (!wanted && this.spaceCommandRibbon) {
      this.spaceCommandRibbon.remove();
      this.spaceCommandRibbon = null;
    }
  }

  onunload() {
    // Restore Obsidian's own link lookup
    this.titleLinkResolver?.destroy();
    // Clean up tab lock manager
    this.tabLockManager.destroy();
  }

  /** Appends the @handles used on the vault's task lines that the team note lacks. */
  private async updateTeamNote(): Promise<void> {
    const path = this.settings.teamFilePath;
    try {
      const added = await this.teamManager.addHandles(await this.teamManager.getSeenHandles(true));
      showNotice(
        added.length > 0
          ? `Added ${pluralize(added.length, "handle")} to ${path}: ${added.map((h) => `@${h}`).join(", ")}`
          : `${path} already lists every handle used in tasks.`
      );
    } catch (e) {
      showNotice(`Couldn't update ${path}: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * Cuts the line or block at `line` and appends it to `target`: target
   * first (so a failed append leaves the source intact), then the cut as one
   * editor transaction. Nothing is left behind in the source.
   */
  private async moveAtCursor(editor: Editor, line: number, target: TFile): Promise<void> {
    const lines = editor.getValue().split("\n");
    const cut = cutForMove(lines, line);
    if (!cut) return;
    try {
      await this.app.vault.process(target, (content) => appendMoved(content, cut.moved, cut.isBlock));
    } catch (error) {
      console.error("Error moving TODO:", error);
      showNotice("Couldn't move the TODO. See console for details.");
      return;
    }
    const { from, to, insert } = toCharChange(lines, cut.edit);
    editor.replaceRange(insert, editor.offsetToPos(from), editor.offsetToPos(to));

    this.settings.moveHistory = [target.path, ...this.settings.moveHistory.filter((p) => p !== target.path)].slice(0, 10);
    await this.saveSettings();

    const extra = cut.moved.length - 1;
    showNotice(extra > 0
      ? `Moved to ${target.basename}, with ${pluralize(extra, "line")} under it.`
      : `Moved to ${target.basename}.`);
  }

  async loadSettings() {
    // Only known keys: settings dropped in 1.0 (sidebar, projects, focus
    // mode, …) fall out of data.json on the next save.
    const saved = (await this.loadData()) ?? {};
    const settings = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key in saved) settings[key] = saved[key];
    }
    this.settings = settings as unknown as WarpedTodoSettings;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

/**
 * Native OS file/folder picker for settings that store a vault-relative
 * path — as opposed to chooseFolder() above, whose Projects base folder
 * setting stores an absolute filesystem path to a folder of git repos
 * outside the vault entirely. Opens starting at the vault's own root plus
 * the current value, and relativizes the result back against the vault's
 * base path: Electron's dialog has no way to restrict navigation to a
 * subtree, so a pick outside the vault is rejected with a notice rather
 * than silently writing a broken value into a vault-relative setting.
 * Folder results get a trailing slash, matching this plugin's own
 * folder-path convention (e.g. defaultProjectsFolder's "projects/").
 * Returns null on cancel, a pick outside the vault, or failure (mobile
 * has no FileSystemAdapter, but this plugin is desktop-only anyway).
 */
function chooseVaultPath(vault: Vault, kind: "file" | "folder", title: string, currentValue: string): string | null {
  const adapter = vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) return null;
  const basePath = adapter.getBasePath();
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron");
    const dialog = electron.remote?.dialog ?? electron.dialog;
    const result = dialog.showOpenDialogSync({
      title,
      defaultPath: currentValue ? join(basePath, currentValue) : basePath,
      properties: kind === "folder" ? ["openDirectory", "createDirectory"] : ["openFile"],
    });
    if (!result || result.length === 0) return null;
    const chosen = result[0];
    if (chosen !== basePath && !chosen.startsWith(basePath + sep)) {
      showNotice("Choose a location inside your vault.");
      return null;
    }
    const relative = chosen === basePath ? "" : chosen.slice(basePath.length + 1).split(sep).join("/");
    return kind === "folder" && relative ? `${relative}/` : relative;
  } catch (error) {
    console.error("[Warped Todo]", "Failed to open picker:", error);
    showNotice("Couldn't open the picker. See console for details.");
    return null;
  }
}

class WarpedTodoSettingTab extends PluginSettingTab {
  plugin: WarpedTodoPlugin;
  // Sticky across display() re-renders: true once the user explicitly picks
  // "Custom…" in the insert date format dropdown, so the text field stays
  // visible even if what they type happens to match a preset's format string.
  private showCustomInsertDateFormat = false;

  constructor(app: App, plugin: WarpedTodoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Warped Command Settings" });

    // About section
    const aboutSection = containerEl.createEl("div", { cls: "warped-todo-about-section" });
    const aboutHeader = aboutSection.createEl("div", { cls: "about-header" });
    aboutHeader.createEl("span", { cls: "warped-todo-logo about-logo", text: "␣⌘" });
    aboutHeader.createEl("span", { cls: "about-title", text: "Warped Command" });

    aboutSection.createEl("p", {
      cls: "about-blurb",
      text: "Focus on the right next task. Simple TODOs and tags in your markdown, surfaced when you need them.",
    });

    aboutSection.createEl("p", { cls: "about-version", text: `Version ${this.plugin.manifest.version}` });

    const aboutDetails = aboutSection.createEl("div", { cls: "about-details" });
    aboutDetails.createEl("span", { text: "By Bruce Alderson" });
    aboutDetails.appendText(" · ");
    aboutDetails.createEl("a", {
      text: "GitHub",
      href: "https://github.com/robotpony/warped-command/blob/main/README.md",
    });

    // Editor section
    containerEl.createEl("h3", { text: "Editor" });

    const insertFormatIsPreset = DATE_FORMAT_PRESETS.some(
      (p) => p.format === this.plugin.settings.insertDateFormat
    );
    const showCustomInsertField = this.showCustomInsertDateFormat || !insertFormatIsPreset;

    new Setting(containerEl)
      .setName("Insert date format")
      .setDesc(
        `Format @today, @tomorrow, @yesterday, @date, /today, and /tomorrow insert into note text. Today: "${formatDate(new Date(), this.plugin.settings.insertDateFormat)}"`
      )
      .addDropdown((dropdown) => {
        for (const preset of DATE_FORMAT_PRESETS) {
          dropdown.addOption(preset.format, preset.label);
        }
        dropdown.addOption("custom", "Custom…");
        dropdown.setValue(showCustomInsertField ? "custom" : this.plugin.settings.insertDateFormat);
        dropdown.onChange(async (value) => {
          if (value === "custom") {
            this.showCustomInsertDateFormat = true;
            this.display();
            return;
          }
          this.showCustomInsertDateFormat = false;
          this.plugin.settings.insertDateFormat = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (showCustomInsertField) {
      new Setting(containerEl)
        .setName("Custom insert date format")
        .setDesc("moment.js format string, e.g. dddd, MMMM Do → Tuesday, July 10th")
        .addText((text) =>
          text
            .setPlaceholder("dddd, MMMM Do")
            .setValue(this.plugin.settings.insertDateFormat)
            .onChange(async (value) => {
              this.plugin.settings.insertDateFormat = value;
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName("Show tab lock buttons")
      .setDesc("Add lock buttons to tab headers. Locked tabs force links to open in new tabs.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showTabLockButton)
          .onChange(async (value) => {
            this.plugin.settings.showTabLockButton = value;
            if (value) {
              this.plugin.tabLockManager.enable();
            } else {
              this.plugin.tabLockManager.disable();
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Resolve wiki links by page title")
      .setDesc("When the vault is a Hugo site, a [[Page Title]] link that matches no filename resolves to the page whose frontmatter title matches, ignoring case and punctuation (the same rule a Hugo wiki-link render hook uses). Covers clicking, hover preview, link styling, backlinks, and the graph. Files are never changed.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.resolveTitleLinks)
          .onChange(async (value) => {
            this.plugin.settings.resolveTitleLinks = value;
            await this.plugin.saveSettings();
            await this.plugin.updateTitleLinkResolver();
          })
      );

    // Space Command section
    containerEl.createEl("h3", { text: "Space Command" });

    new Setting(containerEl)
      .setName("Show Open in Space Command")
      .setDesc("A command and editor menu item that opens the note, at the cursor's line, in Space Command. Turn it off if Space Command isn't installed.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showOpenInSpaceCommand).onChange(async (value) => {
          this.plugin.settings.showOpenInSpaceCommand = value;
          await this.plugin.saveSettings();
          this.plugin.updateSpaceCommandRibbon();
          this.display();
        })
      );

    if (this.plugin.settings.showOpenInSpaceCommand) {
      new Setting(containerEl)
        .setName("Ribbon icon")
        .setDesc("Also show Open in Space Command in the ribbon.")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.showSpaceCommandRibbon).onChange(async (value) => {
            this.plugin.settings.showSpaceCommandRibbon = value;
            await this.plugin.saveSettings();
            this.plugin.updateSpaceCommandRibbon();
          })
        );
    }

    // Team section
    containerEl.createEl("h3", { text: "Team" });

    new Setting(containerEl)
      .setName("Team file path")
      .setDesc("Your @handle list, in a vault note. It's written only when you choose \"Add @handle to team\" or run Update team note.")
      .addText((text) =>
        text
          .setPlaceholder("team.md")
          .setValue(this.plugin.settings.teamFilePath)
          .onChange(async (value) => {
            this.plugin.settings.teamFilePath = value;
            this.plugin.teamManager.setFilePath(value);
            await this.plugin.saveSettings();
            this.display();
          })
      )
      .addExtraButton((btn) =>
        btn
          .setIcon("file")
          .setTooltip("Choose a file")
          .onClick(async () => {
            const chosen = chooseVaultPath(this.app.vault, "file", "Choose team file", this.plugin.settings.teamFilePath);
            if (!chosen) return;
            this.plugin.settings.teamFilePath = chosen;
            this.plugin.teamManager.setFilePath(chosen);
            await this.plugin.saveSettings();
            this.display(); // rebuilds this field with the new value, same as the text input's own onChange
          })
      );

    const teamFile = this.app.vault.getAbstractFileByPath(this.plugin.settings.teamFilePath);
    const teamButtonSetting = new Setting(containerEl);

    if (teamFile instanceof TFile) {
      teamButtonSetting
        .setName("Manage team file")
        .addButton((btn) =>
          btn.setButtonText("Open team file").onClick(async () => {
            await this.app.workspace.getLeaf(false).openFile(teamFile);
          })
        );
    } else {
      teamButtonSetting
        .setName("No team file found")
        .setDesc("Create a starter team file with your username")
        .addButton((btn) =>
          btn.setButtonText("Create team file").setCta().onClick(async () => {
            const file = await this.plugin.teamManager.createTeamFile();
            await this.app.workspace.getLeaf(false).openFile(file);
            this.display();
          })
        );
    }

    const team = this.plugin.teamManager.getTeam();
    if (team.length > 0) {
      const teamList = containerEl.createEl("div", { cls: "warped-todo-team-list" });
      for (const member of team) {
        const entry = teamList.createEl("div", { cls: "warped-todo-team-entry" });
        entry.createEl("span", { cls: "warped-todo-team-handle", text: `@${member.handle}` });
        entry.createEl("span", { cls: "warped-todo-team-name", text: member.name });
        if (member.isMe) {
          entry.createEl("span", { cls: "warped-todo-team-me-badge", text: "(me)" });
        }
      }
    }

    // Help section (last)
    containerEl.createEl("h3", { text: "Help" });

    const helpExists = this.app.vault.getAbstractFileByPath(HELP_NOTE_PATH) instanceof TFile;
    new Setting(containerEl)
      .setName("Help note")
      .setDesc(`A note of live #todo/#idea examples you can try, at "${HELP_NOTE_PATH}". Created only when you ask.`)
      .addButton((btn) =>
        btn.setButtonText(helpExists ? "Open help note" : "Create help note").onClick(async () => {
          await this.plugin.helpNoteManager.open();
          this.display();
        })
      );

    this.widenTextInputs(containerEl);
  }

  /**
   * Widens every text-input field in this settings tab to 125% of its own
   * rendered width, clamped to whatever room is actually left in its row
   * (label + description on the left leave less space than a bare short
   * label does) so it never overflows or forces the row to wrap. File/
   * folder-path fields in particular read cramped at Obsidian's default
   * input width. Measures the real rendered width rather than hardcoding
   * a pixel value, since Obsidian's own default isn't a value this plugin
   * controls or should assume stays constant across versions/themes.
   * Toggles, sliders, and dropdowns are untouched — this only targets
   * `<input type="text">`.
   */
  private widenTextInputs(containerEl: HTMLElement): void {
    const inputs = containerEl.querySelectorAll<HTMLInputElement>(".setting-item-control input[type='text']");
    inputs.forEach((input) => {
      const natural = input.getBoundingClientRect().width;
      if (natural <= 0) return; // not laid out (e.g. hidden) — nothing to measure
      const row = input.closest(".setting-item") as HTMLElement | null;
      const info = row?.querySelector(".setting-item-info") as HTMLElement | null;
      const rowWidth = row?.getBoundingClientRect().width ?? natural;
      const infoWidth = info?.getBoundingClientRect().width ?? 0;
      const available = Math.max(natural, rowWidth - infoWidth - 24); // 24px ~= the row's own label/control gap
      const target = Math.min(natural * 1.25, available);
      if (target > natural) input.style.width = `${target}px`;
    });
  }
}

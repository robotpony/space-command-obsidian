import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import { TodoItem } from "../types";
import { buildSnapshot, serializeSnapshot, SnapshotInput } from "../ScanSnapshot";
import { parseStructuredFile } from "../StructuredFileParser";
import { parsePlan } from "../PlanParser";

function vaultItem(overrides: Partial<TodoItem>): TodoItem {
  return {
    file: new TFile(),
    filePath: "notes/a.md",
    folder: "notes",
    lineNumber: 0,
    fingerprint: "",
    text: "",
    hasCheckbox: false,
    tags: [],
    dateCreated: 0,
    mentions: [],
    itemType: "todo",
    ...overrides,
  };
}

function input(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    version: "0.55.0",
    generatedAt: "2026-10-15T00:00:00.000Z",
    vaultItems: [],
    repos: [],
    resolveProjectTags: () => [],
    hugoContentDir: null,
    posts: [],
    ...overrides,
  };
}

describe("buildSnapshot", () => {
  it("sorts items by root, file, then 1-based line and classifies their source", () => {
    const header = vaultItem({ filePath: "b.md", lineNumber: 2, text: "### Release #todo #p1", tags: ["#todo", "#p1"], isHeader: true });
    const child = vaultItem({ filePath: "b.md", lineNumber: 3, text: "- [ ] Ship it #focus", tags: ["#focus"], parentLineNumber: 2 });
    const line = vaultItem({ filePath: "a.md", lineNumber: 5, text: "- Fix #todo #snooze", tags: ["#todo", "#snooze"], sectionLabel: "Inbox" });
    const done = vaultItem({ filePath: "a.md", lineNumber: 1, text: "- [x] Old #todone", tags: ["#todone"], itemType: "todone" });

    const snap = buildSnapshot(input({ vaultItems: [header, child, line, done] })) as any;
    expect(snap.items.map((i: any) => `${i.file}:${i.line}`)).toEqual(["a.md:2", "a.md:6", "b.md:3", "b.md:4"]);
    expect(snap.items[0]).toMatchObject({ status: "done", kind: "todo", source: "taggedLine" });
    expect(snap.items[1]).toMatchObject({ snoozed: true, priority: null, section: "Inbox" });
    expect(snap.items[2]).toMatchObject({ source: "taggedHeading", priority: "p1" });
    expect(snap.items[3]).toMatchObject({ source: "headerChild", focus: true, section: "Release" });
  });

  it("reports structured-file items, shapes, plan phases, and project tag links", () => {
    const bugs = "- [ ] Crash on launch #p0\n- [x] Typo\n";
    const items = parseStructuredFile("BUGS.md", bugs, "/base/app/BUGS.md");
    const linked = vaultItem({ filePath: "projects/app.md", lineNumber: 4, tags: ["#todo", "#app"] });
    const snap = buildSnapshot(input({
      vaultItems: [linked],
      resolveProjectTags: (i) => i.tags.filter((t) => t === "#app"),
      repos: [{
        name: "app", path: "app", title: "App", stack: ["TypeScript"], branch: "main", remote: "",
        noteFile: "projects/app.md",
        structuredFiles: [{ name: "BUGS.md", content: bugs, items }],
        plan: parsePlan("## Phase 1\n- [x] a\n- [ ] b\n## Phase 2\n- [ ] c\n"),
      }],
    })) as any;

    const repoItems = snap.items.filter((i: any) => i.root === "projects");
    expect(repoItems.map((i: any) => [i.file, i.line, i.kind, i.status, i.priority])).toEqual([
      ["app/BUGS.md", 1, "bug", "open", "p0"],
      ["app/BUGS.md", 2, "bug", "done", null],
    ]);
    expect(snap.taskFiles.structured).toEqual([{ project: "app", file: "app/BUGS.md", shape: "flatList", itemCount: 2 }]);
    expect(snap.taskFiles.plans[0].phases).toEqual([
      { name: "Phase 1", done: 1, total: 2 },
      { name: "Phase 2", done: 0, total: 1 },
    ]);
    expect(snap.projects[0]).toMatchObject({ tag: "#app", remote: null, linkedItems: [{ file: "projects/app.md", line: 5 }] });
  });

  it("serializes with sorted keys, 2-space indent, and identical output for identical input", () => {
    const a = serializeSnapshot(buildSnapshot(input()));
    const b = serializeSnapshot(buildSnapshot(input()));
    expect(a).toBe(b);
    expect(a.endsWith("\n")).toBe(true);
    const keys = Object.keys(JSON.parse(a));
    expect(keys).toEqual([...keys].sort());
    expect(a).toContain('\n  "schema": 1');
  });
});

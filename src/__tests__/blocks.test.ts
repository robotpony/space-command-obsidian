import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { blockAtHeading, findBlock, headingLevel, listItemEnd } from "../blocks";
import { appendMoved, cutForMove, isMovableLine, sortableBlockAt, sortBlock, taggedBlockAt, toCharChange } from "../blockOps";
import { taskFileKind } from "../taskFiles";
import { createCheckboxSyncExtension } from "../CheckboxSyncExtension";

const doc = (...lines: string[]) => lines;

function applyEdit(lines: string[], edit: { from: number; to: number; lines: string[] }): string[] {
  return [...lines.slice(0, edit.from), ...edit.lines, ...lines.slice(edit.to)];
}

describe("block model", () => {
  const lines = doc(
    "# Note",            // 0
    "",                  // 1
    "### Tasks #todo",   // 2
    "- [ ] a",           // 3
    "- [ ] b",           // 4
    "",                  // 5
    "#### Sub",          // 6
    "- [ ] c",           // 7
    "```",               // 8
    "## not a heading",  // 9
    "```",               // 10
    "",                  // 11
  );

  it("headingLevel needs a space after the hashes", () => {
    expect(headingLevel("### Tasks")).toBe(3);
    expect(headingLevel("#todo")).toBe(0);
  });

  it("a block ends at the next heading of any level, trailing blanks trimmed", () => {
    expect(blockAtHeading(lines, 2)).toEqual({ headingLine: 2, level: 3, end: 5 });
  });

  it("headings in code fences don't count", () => {
    expect(blockAtHeading(lines, 6)).toEqual({ headingLine: 6, level: 4, end: 11 });
    expect(blockAtHeading(lines, 9)).toBeNull();
  });

  it("findBlock returns the nearest heading's block, the heading included", () => {
    expect(findBlock(lines, 4)?.headingLine).toBe(2);
    expect(findBlock(lines, 2)?.headingLine).toBe(2);
    expect(findBlock(lines, 7)?.headingLine).toBe(6);
    expect(findBlock(lines, 9)?.headingLine).toBe(6);
  });

  it("taggedBlockAt only accepts a tagged nearest heading", () => {
    expect(taggedBlockAt(lines, 3)?.headingLine).toBe(2);
    expect(taggedBlockAt(lines, 5)?.headingLine).toBe(2);
    expect(taggedBlockAt(lines, 7)).toBeNull(); // #### Sub ends ### Tasks
  });

  it("returns null above the first heading", () => {
    expect(findBlock(doc("text", "# H"), 0)).toBeNull();
  });

  it("listItemEnd takes deeper-indented lines", () => {
    expect(listItemEnd(doc("- a", "  - a1", "    more", "- b"), 0)).toBe(3);
    expect(listItemEnd(doc("- a", "", "  - a1"), 0)).toBe(1);
  });
});

describe("sortBlock", () => {
  it("sorts open before done, then focus/p0–p4/none/snoozed, stably", () => {
    const lines = doc(
      "### Tasks #todo",
      "- [ ] plain",
      "- [x] done first",
      "- [ ] low #p4",
      "- [ ] urgent #p0",
      "- [ ] later #snooze",
      "- [ ] now #focus",
      "- [ ] also plain",
      "- [x] done second",
    );
    const edit = sortBlock(lines, blockAtHeading(lines, 0)!)!;
    expect(applyEdit(lines, edit)).toEqual(doc(
      "### Tasks #todo",
      "- [ ] now #focus",
      "- [ ] urgent #p0",
      "- [ ] low #p4",
      "- [ ] plain",
      "- [ ] also plain",
      "- [ ] later #snooze",
      "- [x] done first",
      "- [x] done second",
    ));
  });

  it("keeps sub-items with their parent and sorts runs separately", () => {
    const lines = doc(
      "## Work #todos",
      "**Backend**",
      "- [ ] b #p3",
      "  - detail of b",
      "- [ ] a #p1",
      "",
      "**Frontend**",
      "- [x] c",
      "- [ ] d",
    );
    const edit = sortBlock(lines, blockAtHeading(lines, 0)!)!;
    expect(applyEdit(lines, edit)).toEqual(doc(
      "## Work #todos",
      "**Backend**",
      "- [ ] a #p1",
      "- [ ] b #p3",
      "  - detail of b",
      "",
      "**Frontend**",
      "- [ ] d",
      "- [x] c",
    ));
  });

  it("returns null when already sorted", () => {
    const lines = doc("### T #todo", "- [ ] a #p0", "- [ ] b", "- [x] c");
    expect(sortBlock(lines, blockAtHeading(lines, 0)!)).toBeNull();
  });

  it("struck lines read as done", () => {
    const lines = doc("### T #todo", "- ~~gone~~", "- [ ] open");
    expect(applyEdit(lines, sortBlock(lines, blockAtHeading(lines, 0)!)!)).toEqual(doc("### T #todo", "- [ ] open", "- ~~gone~~"));
  });
});

describe("cutForMove / appendMoved", () => {
  it("cuts a single task line and leaves nothing behind", () => {
    const lines = doc("# Note", "- [ ] one #todo", "- [ ] two #todo");
    const cut = cutForMove(lines, 1)!;
    expect(cut.moved).toEqual(["- [ ] one #todo"]);
    expect(applyEdit(lines, cut.edit)).toEqual(doc("# Note", "- [ ] two #todo"));
    expect(cut.moved.join("\n")).not.toMatch(/#moved|@/);
  });

  it("takes a list item's indented sub-lines with it", () => {
    const lines = doc("- [ ] parent #todo", "  - child", "- next");
    const cut = cutForMove(lines, 0)!;
    expect(cut.moved).toEqual(["- [ ] parent #todo", "  - child"]);
    expect(applyEdit(lines, cut.edit)).toEqual(doc("- next"));
  });

  it("cuts a tagged heading's whole block and collapses the blank it leaves", () => {
    const lines = doc("# Note", "", "### Tasks #todo", "- [ ] a", "- [ ] b", "", "## Next");
    const cut = cutForMove(lines, 2)!;
    expect(cut.isBlock).toBe(true);
    expect(cut.moved).toEqual(["### Tasks #todo", "- [ ] a", "- [ ] b"]);
    expect(applyEdit(lines, cut.edit)).toEqual(doc("# Note", "", "## Next"));
  });

  it("a child leaving its tagged heading gains the heading's kind tag, nothing else", () => {
    const lines = doc("### Tasks #todo #p1 #api", "- [ ] child", "- [x] done child");
    expect(cutForMove(lines, 1)!.moved).toEqual(["- [ ] child #todo"]);
    expect(cutForMove(lines, 2)!.moved).toEqual(["- [x] done child #todone"]);
  });

  it("returns null on a blank line", () => {
    expect(cutForMove(doc("a", ""), 1)).toBeNull();
  });

  it("isMovableLine accepts tagged lines and tagged-block children only", () => {
    const lines = doc("# Note", "plain", "- [ ] x #idea", "### T #todo", "- [ ] child", "### Untagged", "- [ ] y");
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => isMovableLine(lines, i))).toEqual([false, false, true, true, true, false, false]);
  });

  it("appendMoved: a line joins the end, a block gets a blank line before it", () => {
    expect(appendMoved("- a\n\n", ["- b #todo"], false)).toBe("- a\n- b #todo\n");
    expect(appendMoved("text", ["### T #todo", "- [ ] a"], true)).toBe("text\n\n### T #todo\n- [ ] a\n");
    expect(appendMoved("", ["- b"], false)).toBe("- b\n");
  });
});

describe("toCharChange", () => {
  const apply = (lines: string[], edit: { from: number; to: number; lines: string[] }) => {
    const text = lines.join("\n");
    const c = toCharChange(lines, edit);
    return text.slice(0, c.from) + c.insert + text.slice(c.to);
  };

  it("matches the line edit in the middle, at the end, and when cutting the last lines", () => {
    const lines = doc("a", "b", "c");
    expect(apply(lines, { from: 1, to: 2, lines: ["B", "B2"] })).toBe("a\nB\nB2\nc");
    expect(apply(lines, { from: 1, to: 3, lines: ["x"] })).toBe("a\nx");
    expect(apply(lines, { from: 2, to: 3, lines: [] })).toBe("a\nb");
    expect(apply(lines, { from: 0, to: 1, lines: [] })).toBe("b\nc");
    expect(apply(lines, { from: 0, to: 3, lines: [] })).toBe("");
  });
});

describe("checkbox sync extension", () => {
  const state = (text: string) => EditorState.create({ doc: text, extensions: [createCheckboxSyncExtension()] });
  const toggleAt = (text: string, line: number) => {
    const s = state(text);
    const l = s.doc.line(line + 1);
    const box = l.text.indexOf("[") + 1;
    const next = l.text[box] === " " ? "x" : " ";
    return s.update({ changes: { from: l.from + box, to: l.from + box + 1, insert: next } }).state.doc.toString();
  };

  it("rewrites the tag in the same transaction as the toggle", () => {
    expect(toggleAt("- [ ] a #todo\n- [ ] b #todo", 1)).toBe("- [ ] a #todo\n- [x] b #todone");
    expect(toggleAt("- [x] a #todones", 0)).toBe("- [ ] a #todos");
  });

  it("writes no tag under a tagged heading", () => {
    expect(toggleAt("### T #todo\n- [ ] child", 1)).toBe("### T #todo\n- [x] child");
  });

  it("writes the tag when the nearest heading isn't tagged", () => {
    expect(toggleAt("### T #todo\n#### Sub\n- [ ] child #todo", 2)).toBe("### T #todo\n#### Sub\n- [x] child #todone");
  });

  it("leaves struck lines alone", () => {
    expect(toggleAt("- [ ] ~~old~~ #todo", 0)).toBe("- [x] ~~old~~ #todo");
  });

  it("is one undoable transaction (the tag change rides on the toggle)", () => {
    const s = state("- [ ] a #todo");
    const tr = s.update({ changes: { from: 3, to: 4, insert: "x" } });
    expect(tr.newDoc.toString()).toBe("- [x] a #todone");
  });

  it("skips whole-document replaces (file open, external writes)", () => {
    const s = state("- [ ] a #todo");
    const tr = s.update({ changes: { from: 0, to: s.doc.length, insert: "- [x] a #todo\nmore" } });
    expect(tr.newDoc.toString()).toBe("- [x] a #todo\nmore");
  });

  it("ignores edits that don't flip a box", () => {
    const s = state("- [ ] a #todo");
    expect(s.update({ changes: { from: 13, insert: " #p1" } }).newDoc.toString()).toBe("- [ ] a #todo #p1");
  });
});

describe("well-known task files", () => {
  it("matches Space Command's names in any folder, ignoring case", () => {
    expect(taskFileKind("PLAN.md")).toBe("task");
    expect(taskFileKind("projects/app/todo.md")).toBe("task");
    expect(taskFileKind("Bugs.md")).toBe("task");
    expect(taskFileKind("ideas/IDEAS.md")).toBe("idea");
    expect(taskFileKind("PLANS.md")).toBeNull();
    expect(taskFileKind("notes/plan.md.bak")).toBeNull();
    expect(taskFileKind(null)).toBeNull();
  });

  const plan = doc(
    "# Plan",               // 0
    "Intro.",               // 1
    "## Decisions",         // 2
    "- plain bullet",       // 3
    "## Phase 1",           // 4
    "- [x] done",           // 5
    "- [ ] open",           // 6
    "  - [ ] sub",          // 7
  );

  it("sorts an untagged heading's checkboxes in a task file", () => {
    const block = sortableBlockAt(plan, 6, "docs/PLAN.md")!;
    expect(block.headingLine).toBe(4);
    expect(applyEdit(plan, sortBlock(plan, block)!).slice(4)).toEqual(["## Phase 1", "- [ ] open", "  - [ ] sub", "- [x] done"]);
  });

  it("needs a checkbox in the block, and a task file", () => {
    expect(sortableBlockAt(plan, 3, "PLAN.md")).toBeNull();
    expect(sortableBlockAt(plan, 6, "notes/Phase.md")).toBeNull();
    expect(sortableBlockAt(plan, 6)).toBeNull();
  });

  it("still takes a tagged heading anywhere", () => {
    const lines = doc("### T #todo", "- [x] a", "- [ ] b");
    expect(sortableBlockAt(lines, 1, "notes/x.md")?.headingLine).toBe(0);
  });
});

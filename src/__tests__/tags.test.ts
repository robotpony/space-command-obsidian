import { describe, it, expect } from "vitest";
import {
  completeTaskLine,
  reopenTaskLine,
  syncCheckboxToggle,
  kindTagForDetachedChild,
  taggedHeadingKind,
  priorityRank,
  readsAsDone,
  isStruck,
} from "../tags";

// Space Command's write rules (PLAN.md › "Space Command's write rules").

describe("completeTaskLine", () => {
  it("renames #todo to #todone in place and checks the box", () => {
    expect(completeTaskLine("- [ ] Ship it #todo #p1")).toEqual({ ok: true, line: "- [x] Ship it #todone #p1" });
  });

  it("keeps the alias form: #todos → #todones", () => {
    expect(completeTaskLine("- [ ] Batch #todos")).toEqual({ ok: true, line: "- [x] Batch #todones" });
  });

  it("inserts a box on a plain bullet", () => {
    expect(completeTaskLine("- Plain #todo")).toEqual({ ok: true, line: "- [x] Plain #todone" });
    expect(completeTaskLine("  * Nested #todo")).toEqual({ ok: true, line: "  * [x] Nested #todone" });
  });

  it("writes no date stamp", () => {
    const result = completeTaskLine("- [ ] Task #todo");
    expect(result.ok && result.line).not.toMatch(/@/);
  });

  it("under a tagged heading toggles the box only", () => {
    expect(completeTaskLine("- [ ] Child", { headingKind: "task" })).toEqual({ ok: true, line: "- [x] Child" });
    expect(completeTaskLine("- Child", { headingKind: "task" })).toEqual({ ok: true, line: "- [x] Child" });
  });

  it("a child's own #idea tag wins over the heading's kind", () => {
    expect(completeTaskLine("- [ ] Thought #idea", { headingKind: "task" }).ok).toBe(false);
  });

  it("refuses a box under an idea heading", () => {
    expect(completeTaskLine("- [ ] Thought", { headingKind: "idea" }).ok).toBe(false);
  });

  it("refuses a tagged heading with children", () => {
    expect(completeTaskLine("### Tasks #todo", { headingHasChildren: true })).toEqual({
      ok: false,
      reason: "Complete the items under this heading one by one.",
    });
  });

  it("completes a tagged heading without children by renaming its tag", () => {
    expect(completeTaskLine("### One-off #todo")).toEqual({ ok: true, line: "### One-off #todone" });
  });

  it("leaves a struck line alone", () => {
    expect(completeTaskLine("- [ ] ~~Gone~~ #todo").ok).toBe(false);
  });

  it("ignores tags in code spans", () => {
    expect(completeTaskLine("- [ ] Use `#todo` then #todo")).toEqual({ ok: true, line: "- [x] Use `#todo` then #todone" });
    expect(completeTaskLine("- [ ] Only `#todo` here").ok).toBe(false);
  });

  it("doesn't match #todo inside #todos or other tags", () => {
    expect(completeTaskLine("- [ ] x #todo-later").ok).toBe(false);
  });
});

describe("reopenTaskLine", () => {
  it("renames #todone back and unchecks", () => {
    expect(reopenTaskLine("- [x] Ship #todone #p1")).toEqual({ ok: true, line: "- [ ] Ship #todo #p1" });
  });

  it("keeps the alias form: #todones → #todos", () => {
    expect(reopenTaskLine("## Tasks #todones")).toEqual({ ok: true, line: "## Tasks #todos" });
  });

  it("drops a legacy @date directly after #todone, and only that one", () => {
    expect(reopenTaskLine("- [x] Ship #todone @2026-05-08 #p1 @2026-06-01")).toEqual({
      ok: true,
      line: "- [ ] Ship #todo #p1 @2026-06-01",
    });
  });

  it("under a tagged heading unchecks only", () => {
    expect(reopenTaskLine("- [x] Child", { headingKind: "task" })).toEqual({ ok: true, line: "- [ ] Child" });
  });

  it("leaves a struck line alone", () => {
    expect(reopenTaskLine("- [x] ~~Gone~~ #todone").ok).toBe(false);
  });
});

describe("syncCheckboxToggle", () => {
  it("checked box on #todo → #todone", () => {
    expect(syncCheckboxToggle("- [x] Task #todo")).toBe("- [x] Task #todone");
  });

  it("checked box on #todos → #todones", () => {
    expect(syncCheckboxToggle("- [x] Task #todos #api")).toBe("- [x] Task #todones #api");
  });

  it("unchecked box on #todone → #todo (uncheck revert)", () => {
    expect(syncCheckboxToggle("- [ ] Review #todone")).toBe("- [ ] Review #todo");
  });

  it("uncheck revert keeps aliases and other tags, and strips a legacy stamp", () => {
    expect(syncCheckboxToggle("  - [ ] Ship #todones @2026-05-08 #p1 #api")).toBe("  - [ ] Ship #todos #p1 #api");
  });

  it("under a tagged heading writes no tag", () => {
    expect(syncCheckboxToggle("- [x] Child", { headingKind: "task" })).toBeNull();
    expect(syncCheckboxToggle("- [ ] Child", { headingKind: "task" })).toBeNull();
  });

  it("under a tagged heading, a child with its own #todo still follows the box", () => {
    expect(syncCheckboxToggle("- [x] Child #todo", { headingKind: "task" })).toBe("- [x] Child #todone");
  });

  it("leaves struck lines alone", () => {
    expect(syncCheckboxToggle("- [x] ~~Old~~ #todo")).toBeNull();
    expect(syncCheckboxToggle("- [ ] ~~Old~~ #todone")).toBeNull();
  });

  it("leaves idea and principle lines alone", () => {
    expect(syncCheckboxToggle("- [x] Thought #idea #todo")).toBeNull();
    expect(syncCheckboxToggle("- [x] Rule #principle")).toBeNull();
  });

  it("does nothing when box and tag already agree", () => {
    expect(syncCheckboxToggle("- [x] Done #todone")).toBeNull();
    expect(syncCheckboxToggle("- [ ] Open #todo")).toBeNull();
    expect(syncCheckboxToggle("- [x] Both #todo #todone")).toBeNull();
  });

  it("does nothing on an untagged box or a line without one", () => {
    expect(syncCheckboxToggle("- [x] Groceries")).toBeNull();
    expect(syncCheckboxToggle("Plain #todo")).toBeNull();
  });

  it("writes no date", () => {
    expect(syncCheckboxToggle("- [x] Task #todo")).not.toMatch(/@/);
  });
});

describe("taggedHeadingKind", () => {
  it("any level with an open kind tag opens a section", () => {
    expect(taggedHeadingKind("# Top #todo")).toBe("task");
    expect(taggedHeadingKind("#### Deep #ideas")).toBe("idea");
    expect(taggedHeadingKind("## Rules #principle")).toBe("principle");
  });

  it("a done heading doesn't", () => {
    expect(taggedHeadingKind("### Finished #todone")).toBeNull();
  });

  it("an untagged heading or a non-heading doesn't", () => {
    expect(taggedHeadingKind("### Notes #api")).toBeNull();
    expect(taggedHeadingKind("- item #todo")).toBeNull();
  });
});

describe("kindTagForDetachedChild", () => {
  it("adds the heading's kind, done form for a checked task", () => {
    expect(kindTagForDetachedChild("- [ ] Child", "### Tasks #todo #p1")).toBe("#todo");
    expect(kindTagForDetachedChild("- [x] Child", "### Tasks #todos")).toBe("#todone");
    expect(kindTagForDetachedChild("- Thought", "### Ideas #ideation")).toBe("#idea");
    expect(kindTagForDetachedChild("- Rule", "## Rules #principle")).toBe("#principle");
  });

  it("skips a line with its own kind tag", () => {
    expect(kindTagForDetachedChild("- [ ] Child #idea", "### Tasks #todo")).toBeNull();
  });
});

describe("readsAsDone / isStruck / priorityRank", () => {
  it("reads struck, checked or #todone as done", () => {
    expect(readsAsDone("- ~~gone~~")).toBe(true);
    expect(readsAsDone("- [x] box")).toBe(true);
    expect(readsAsDone("- tag #todone")).toBe(true);
    expect(readsAsDone("- [ ] open #todo")).toBe(false);
  });

  it("isStruck looks past the marker and box", () => {
    expect(isStruck("- [ ] ~~text~~ #idea")).toBe(true);
    expect(isStruck("- some ~~partial~~ text")).toBe(false);
  });

  it("ranks focus, p0–p4, none, snoozed", () => {
    const order = ["x #focus", "x #p0", "x #p1", "x #p2", "x #p3", "x #p4", "x", "x #snooze"].map(priorityRank);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
    expect(priorityRank("x #future")).toBe(priorityRank("x #snoozed"));
  });
});

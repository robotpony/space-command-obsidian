import { describe, it, expect } from "vitest";
import {
  completeTaskLine,
  completeLine,
  letGoLine,
  reopenLine,
  setPriority,
  toggleFocus,
  snoozeLine,
  unsnoozeLine,
  toggleSnooze,
  makeTaskFromIdea,
  convertLineToTask,
  appendTag,
  findTags,
  tagRole,
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
    expect(completeTaskLine("- [ ] x #todo/sub").ok).toBe(false);
  });

  it("keeps the tag's case", () => {
    expect(completeTaskLine("- [ ] Loud #TODO")).toEqual({ ok: true, line: "- [x] Loud #TODONE" });
  });
});

describe("reopenLine", () => {
  it("renames #todone back and unchecks", () => {
    expect(reopenLine("- [x] Ship #todone #p1")).toEqual({ ok: true, line: "- [ ] Ship #todo #p1" });
  });

  it("keeps the alias form: #todones → #todos", () => {
    expect(reopenLine("## Tasks #todones")).toEqual({ ok: true, line: "## Tasks #todos" });
  });

  it("drops a legacy @date directly after #todone, and only that one", () => {
    expect(reopenLine("- [x] Ship #todone @2026-05-08 #p1 @2026-06-01")).toEqual({
      ok: true,
      line: "- [ ] Ship #todo #p1 @2026-06-01",
    });
  });

  it("under a tagged heading unchecks only", () => {
    expect(reopenLine("- [x] Child")).toEqual({ ok: true, line: "- [ ] Child" });
  });

  it("unstrikes a struck line along with the box and tag", () => {
    expect(reopenLine("- [x] ~~Gone~~ #todone")).toEqual({ ok: true, line: "- [ ] Gone #todo" });
    expect(reopenLine("- ~~Let go~~ #idea")).toEqual({ ok: true, line: "- Let go #idea" });
  });

  it("refuses an open line", () => {
    expect(reopenLine("- [ ] Open #todo").ok).toBe(false);
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

describe("findTags", () => {
  it("needs whitespace or line start before the #", () => {
    expect(findTags("a#b #c http://x.ca/#frag").map((t) => t.raw)).toEqual(["#c"]);
  });

  it("skips issue numbers and code spans of any length", () => {
    expect(findTags("fix #123 ``#todo `x` `` #todo").map((t) => t.raw)).toEqual(["#todo"]);
  });

  it("reads nested tags whole", () => {
    expect(findTags("#area/sub-1").map((t) => t.name)).toEqual(["#area/sub-1"]);
  });
});

describe("tagRole", () => {
  it("knows the vocabulary and its read aliases", () => {
    expect(["#todos", "#TODONES", "#ideation", "#principles", "#focus", "#p3", "#future", "#snoozed"].map(tagRole))
      .toEqual(["todo", "todone", "idea", "principle", "focus", "priority", "snooze", "snooze"]);
  });

  it("treats everything else as a project/category tag", () => {
    expect(tagRole("#p5")).toBe("category");
    expect(tagRole("#space-command")).toBe("category");
  });
});

describe("letGoLine / completeLine", () => {
  it("strikes an idea with no box, tags left outside", () => {
    expect(letGoLine("- Lighter onboarding #idea #ux")).toEqual({ ok: true, line: "- ~~Lighter onboarding~~ #idea #ux" });
    expect(letGoLine("Keep it small #principle")).toEqual({ ok: true, line: "~~Keep it small~~ #principle" });
  });

  it("checks an idea's box rather than striking it", () => {
    expect(letGoLine("- [ ] Thought #idea")).toEqual({ ok: true, line: "- [x] Thought #idea" });
  });

  it("refuses a done idea and one with no text", () => {
    expect(letGoLine("- ~~Gone~~ #idea").ok).toBe(false);
    expect(letGoLine("- #idea").ok).toBe(false);
  });

  it("dispatches by kind, a child's own tag over the heading's", () => {
    expect(completeLine("- [ ] Ship #todo")).toEqual({ ok: true, line: "- [x] Ship #todone" });
    expect(completeLine("- Thought #ideas")).toEqual({ ok: true, line: "- ~~Thought~~ #ideas" });
    expect(completeLine("- Child", { headingKind: "idea" })).toEqual({ ok: true, line: "- ~~Child~~" });
    expect(completeLine("- Child #todo", { headingKind: "idea" })).toEqual({ ok: true, line: "- [x] Child #todone" });
    expect(completeLine("- Child", { headingKind: "task" })).toEqual({ ok: true, line: "- [x] Child" });
  });

  it("never strikes a task", () => {
    const result = completeLine("- Plain #todo");
    expect(result.ok && result.line).not.toMatch(/~~/);
  });

  it("refuses a tagged heading with children", () => {
    expect(completeLine("### Ideas #ideas", { headingHasChildren: true }).ok).toBe(false);
  });
});

describe("setPriority", () => {
  it("appends when there's none", () => {
    expect(setPriority("- [ ] x #todo", 1)).toEqual({ ok: true, line: "- [ ] x #todo #p1" });
  });

  it("replaces the first in place and drops the rest", () => {
    expect(setPriority("- [ ] x #p3 #todo #p1 #ux", 0)).toEqual({ ok: true, line: "- [ ] x #p0 #todo #ux" });
  });

  it("refuses the same priority", () => {
    expect(setPriority("- x #p2", 2).ok).toBe(false);
  });

  it("none removes them all, refusing when there are none", () => {
    expect(setPriority("- x #p1 #todo #p2", null)).toEqual({ ok: true, line: "- x #todo" });
    expect(setPriority("- x #todo", null).ok).toBe(false);
  });
});

describe("focus and snooze", () => {
  it("toggles #focus at the end of the line", () => {
    expect(toggleFocus("- x #todo")).toEqual({ ok: true, line: "- x #todo #focus" });
    expect(toggleFocus("- x #focus #todo")).toEqual({ ok: true, line: "- x #todo" });
  });

  it("snooze writes #snooze, never the read aliases", () => {
    expect(snoozeLine("- x #todo")).toEqual({ ok: true, line: "- x #todo #snooze" });
    expect(snoozeLine("- x #future").ok).toBe(false);
  });

  it("unsnooze removes every snooze tag, #future and #snoozed included", () => {
    expect(unsnoozeLine("- x #future #todo #snoozed #snooze")).toEqual({ ok: true, line: "- x #todo" });
    expect(unsnoozeLine("- x #todo").ok).toBe(false);
    expect(toggleSnooze("- x #future")).toEqual({ ok: true, line: "- x" });
  });

  it("leaves tags in code spans alone", () => {
    expect(unsnoozeLine("- `#snooze` is a tag #snooze")).toEqual({ ok: true, line: "- `#snooze` is a tag" });
  });
});

describe("appendTag", () => {
  it("keeps trailing whitespace (a hard break) after the new tag", () => {
    expect(appendTag("- x #todo  ", "#p1")).toBe("- x #todo #p1  ");
    expect(appendTag("", "#todo")).toBe("#todo");
  });
});

describe("makeTaskFromIdea", () => {
  it("renames idea tags in place, keeping the alias form", () => {
    expect(makeTaskFromIdea("- [ ] x #idea #ux")).toEqual({ ok: true, line: "- [ ] x #todo #ux" });
    expect(makeTaskFromIdea("## Ideas #ideas")).toEqual({ ok: true, line: "## Ideas #todos" });
    expect(makeTaskFromIdea("- x #ideation")).toEqual({ ok: true, line: "- x #todo" });
  });

  it("an untagged child of an idea heading gains #todo", () => {
    expect(makeTaskFromIdea("- x", { headingKind: "idea" })).toEqual({ ok: true, line: "- x #todo" });
  });

  it("refuses a non-idea", () => {
    expect(makeTaskFromIdea("- x #todo").ok).toBe(false);
  });
});

describe("convertLineToTask", () => {
  it("makes `- [ ] text #todo` from a bullet or plain line", () => {
    expect(convertLineToTask("- Call Sam")).toEqual({ ok: true, line: "- [ ] Call Sam #todo" });
    expect(convertLineToTask("  Call Sam")).toEqual({ ok: true, line: "  - [ ] Call Sam #todo" });
    expect(convertLineToTask("- [ ] Boxed")).toEqual({ ok: true, line: "- [ ] Boxed #todo" });
  });

  it("under a tagged task heading, writes a plain box", () => {
    expect(convertLineToTask("- Call Sam", { headingKind: "task" })).toEqual({ ok: true, line: "- [ ] Call Sam" });
    expect(convertLineToTask("- [ ] Boxed", { headingKind: "task" }).ok).toBe(false);
  });

  it("refuses items, headings and blank lines", () => {
    expect(convertLineToTask("- x #idea").ok).toBe(false);
    expect(convertLineToTask("## Heading").ok).toBe(false);
    expect(convertLineToTask("  ").ok).toBe(false);
  });
});

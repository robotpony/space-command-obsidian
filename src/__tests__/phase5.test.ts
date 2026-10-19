import { describe, it, expect } from "vitest";
import { tidyTags, toggleFocus, setPriority } from "../tags";
import { blockAtHeading } from "../blocks";
import { completeAllInBlock, headingProgress, sectionChildren } from "../blockOps";
import { applyOp, applyToggle, targetLines, toggleDone } from "../lineOps";
import { isFocused } from "../tags";

// PLAN.md › Phase 5: tag and block helpers.

describe("tidyTags", () => {
  it("orders the trailing run: kind, priority, focus/snooze, project, handles", () => {
    expect(tidyTags("- [ ] Ship it @sam #work #p1 #focus #todo")).toEqual({
      ok: true,
      line: "- [ ] Ship it #todo #p1 #focus #work @sam",
    });
  });

  it("drops repeats case-insensitively, keeping the first spelling", () => {
    expect(tidyTags("- [ ] Ship #todo #p1 #TODO #p1")).toEqual({ ok: true, line: "- [ ] Ship #todo #p1" });
  });

  it("leaves tags inside the sentence and keeps aliases distinct", () => {
    expect(tidyTags("- [ ] Fix #bug in parser #p2 #todos #todo")).toEqual({
      ok: true,
      line: "- [ ] Fix #bug in parser #todos #todo #p2",
    });
  });

  it("stops the run at a code span, a date or plain text", () => {
    expect(tidyTags("- [ ] Ship `#p1` #p1 #todo")).toEqual({ ok: true, line: "- [ ] Ship `#p1` #todo #p1" });
    expect(tidyTags("- [x] Done #todone @2026-05-08")).toEqual({ ok: false, reason: "No tags at the end of the line." });
  });

  it("keeps trailing whitespace (a hard break)", () => {
    expect(tidyTags("Ship #p1 #todo  ")).toEqual({ ok: true, line: "Ship #todo #p1  " });
  });

  it("says when it's already tidy", () => {
    expect(tidyTags("- [ ] Ship #todo #p1")).toEqual({ ok: false, reason: "Tags are already tidy." });
  });
});

const BLOCK = [
  "### Launch #todo",       // 0
  "- [ ] Draft",            // 1
  "  - a note on draft",    // 2  nested plain bullet: a note
  "  - [x] Nested box",     // 3  nested checkbox: a child
  "- [x] Review",           // 4
  "- Plain child",          // 5
  "- An aside #idea",       // 6
  "- [ ] Later #snooze",    // 7
  "- #p1",                  // 8  only tags: not an item
  "Some prose",             // 9
  "### Next",               // 10
  "- [ ] Not a child",      // 11
];

describe("sectionChildren", () => {
  it("follows Space Command's rule", () => {
    const block = blockAtHeading(BLOCK, 0)!;
    expect(sectionChildren(BLOCK, block)).toEqual([
      { line: 1, kind: "task" },
      { line: 3, kind: "task" },
      { line: 4, kind: "task" },
      { line: 5, kind: "task" },
      { line: 6, kind: "idea" },
      { line: 7, kind: "task" },
    ]);
  });

  it("is empty for a done or untagged heading", () => {
    const lines = ["### Old #todone", "- [ ] x", "### Plain", "- [ ] y"];
    expect(sectionChildren(lines, blockAtHeading(lines, 0)!)).toEqual([]);
    expect(sectionChildren(lines, blockAtHeading(lines, 2)!)).toEqual([]);
  });
});

describe("headingProgress", () => {
  it("counts task children done over all, ideas and snoozed set aside", () => {
    expect(headingProgress(BLOCK, 0)).toEqual({ done: 2, total: 4 });
  });

  it("counts struck lines and #todone as done", () => {
    const lines = ["## Ship #todo", "- ~~Gone~~", "- Sent #todone", "- [ ] Open"];
    expect(headingProgress(lines, 0)).toEqual({ done: 2, total: 3 });
  });

  it("is null without task children", () => {
    expect(headingProgress(["## Ideas #idea", "- one", "- two"], 0)).toBeNull();
  });
});

describe("completeAllInBlock", () => {
  it("completes open task children only, never the heading or ideas", () => {
    const block = blockAtHeading(BLOCK, 0)!;
    const edit = completeAllInBlock(BLOCK, block)!;
    expect(edit.from).toBe(1);
    expect(edit.lines).toEqual([
      "- [x] Draft",
      "  - a note on draft",
      "  - [x] Nested box",
      "- [x] Review",
      "- [x] Plain child",
      "- An aside #idea",
      "- [x] Later #snooze",
      "- #p1",
      "Some prose",
    ]);
  });

  it("is null when nothing is open", () => {
    const lines = ["## Done-ish #todo", "- [x] a", "- [x] b"];
    expect(completeAllInBlock(lines, blockAtHeading(lines, 0)!)).toBeNull();
  });
});

describe("targetLines", () => {
  const doc = ["- [ ] One #todo", "plain", "", "- [ ] Two #todo", "### Head #todo", "- [ ] child"];

  it("takes item lines in a multi-line selection", () => {
    expect(targetLines(doc, { fromLine: 0, toLine: 3, toCh: 4 })).toEqual([0, 3]);
  });

  it("leaves out the line a selection ends at column 0", () => {
    expect(targetLines(doc, { fromLine: 0, toLine: 3, toCh: 0 })).toEqual([0]);
  });

  it("takes every non-blank line with anyLine", () => {
    expect(targetLines(doc, { fromLine: 0, toLine: 3, toCh: 4 }, true)).toEqual([0, 1, 3]);
  });

  it("takes a tagged heading's children from the heading", () => {
    expect(targetLines(doc, { fromLine: 4, toLine: 4, toCh: 0 })).toEqual([5]);
  });

  it("takes the cursor's line otherwise", () => {
    expect(targetLines(doc, { fromLine: 1, toLine: 1, toCh: 0 })).toEqual([1]);
  });
});

describe("applying ops", () => {
  it("toggles focus one way for all: on when any is off", () => {
    const lines = ["- [ ] a #todo #focus", "- [ ] b #todo"];
    expect(applyToggle(lines, [0, 1], isFocused, toggleFocus, toggleFocus).changes).toEqual([
      { line: 1, text: "- [ ] b #todo #focus" },
    ]);
  });

  it("toggles focus off for all when all are on", () => {
    const lines = ["- [ ] a #todo #focus", "- [ ] b #todo #focus"];
    expect(applyToggle(lines, [0, 1], isFocused, toggleFocus, toggleFocus).changes).toEqual([
      { line: 0, text: "- [ ] a #todo" },
      { line: 1, text: "- [ ] b #todo" },
    ]);
  });

  it("marks done when any is open, writing no tag under a tagged heading", () => {
    const lines = ["### H #todo", "- [ ] a", "- [x] b"];
    expect(toggleDone(lines, [1, 2]).changes).toEqual([{ line: 1, text: "- [x] a" }]);
  });

  it("reopens when all are done", () => {
    const lines = ["- [x] a #todone", "- ~~b~~ #idea"];
    expect(toggleDone(lines, [0, 1]).changes).toEqual([
      { line: 0, text: "- [ ] a #todo" },
      { line: 1, text: "- b #idea" },
    ]);
  });

  it("reports the first refusal when nothing changes", () => {
    expect(applyOp(["- [ ] a #todo #p1"], [0], (l) => setPriority(l, 1))).toEqual({ changes: [], reason: "Already #p1." });
  });
});

describe("kind precedence", () => {
  it("reads a line tagged #todo and #idea as an idea, so Mark done lets it go", () => {
    expect(toggleDone(["- Try it #todo #idea"], [0]).changes).toEqual([{ line: 0, text: "- ~~Try it~~ #todo #idea" }]);
  });
});

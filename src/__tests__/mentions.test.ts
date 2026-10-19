import { describe, it, expect } from "vitest";
import {
  findMentions,
  isValidHandle,
  taskLineHandles,
  uniqueHandles,
  parseTeam,
  appendTeamLines,
} from "../mentions";

// Space Command's MentionExtractor rule (PLAN.md › Phase 4).

describe("findMentions", () => {
  it("reads a handle at line start, after whitespace or after (", () => {
    expect(findMentions("@sam ping (@alex) and @jo")).toEqual(["sam", "alex", "jo"]);
  });

  it("skips email addresses and URL paths", () => {
    expect(findMentions("mail sam@example.com or https://x.com/@alex")).toEqual([]);
  });

  it("skips dates and day words", () => {
    expect(findMentions("due @2026-10-17, @today, @Tomorrow, @yesterday")).toEqual([]);
  });

  it("keeps dots, dashes and underscores inside, drops trailing . and -", () => {
    expect(findMentions("ask @mary.jane_o-k. then @bob-")).toEqual(["mary.jane_o-k", "bob"]);
  });

  it("skips mentions in code spans", () => {
    expect(findMentions("see `@sam` and ``@alex`` but @jo")).toEqual(["jo"]);
  });

  it("reads non-ASCII handles", () => {
    expect(findMentions("for @zoë 🚀 @renée")).toEqual(["zoë", "renée"]);
  });
});

describe("isValidHandle", () => {
  it("accepts a whole handle", () => {
    expect(isValidHandle("sam.k")).toBe(true);
  });

  it("rejects digits first, trailing punctuation, day words and empty", () => {
    expect(isValidHandle("2026")).toBe(false);
    expect(isValidHandle("sam.")).toBe(false);
    expect(isValidHandle("today")).toBe(false);
    expect(isValidHandle("")).toBe(false);
  });
});

describe("taskLineHandles", () => {
  it("reads task lines, open and done, and skips other lines", () => {
    const doc = [
      "- [ ] Call @sam #todo",
      "- [x] Sent @alex #todone",
      "- An idea for @jo #idea",
      "Chatted with @pat today",
    ].join("\n");
    expect(taskLineHandles(doc)).toEqual(["sam", "alex"]);
  });

  it("reads children of a tagged task heading, until the next heading", () => {
    const doc = [
      "### Launch #todo",
      "- [ ] Draft with @sam",
      "- An aside for @jo #idea",
      "### Notes",
      "- [ ] @pat",
    ].join("\n");
    expect(taskLineHandles(doc)).toEqual(["sam"]);
  });

  it("skips fenced code", () => {
    const doc = ["```", "- [ ] @sam #todo", "```", "- [ ] @alex #todo"].join("\n");
    expect(taskLineHandles(doc)).toEqual(["alex"]);
  });
});

describe("uniqueHandles", () => {
  it("drops case-insensitive duplicates and excluded handles, keeping first spelling", () => {
    expect(uniqueHandles(["Sam", "sam", "me", "Alex"], ["ME"])).toEqual(["Sam", "Alex"]);
  });
});

describe("team note", () => {
  it("parses members and marks (me)", () => {
    const team = parseTeam("# Team\n\n- @bruce — Bruce Alderson (me)\n- @sam - Sam\nnot a member\n");
    expect(team).toEqual([
      { handle: "bruce", name: "Bruce Alderson", isMe: true },
      { handle: "sam", name: "Sam", isMe: false },
    ]);
  });

  it("appends one line per handle, after the existing content", () => {
    expect(appendTeamLines("# Team\n\n- @bruce — Bruce (me)\n\n", ["sam", "jo"])).toBe(
      "# Team\n\n- @bruce — Bruce (me)\n- @sam — sam\n- @jo — jo\n"
    );
  });

  it("leaves the content alone with nothing to add", () => {
    expect(appendTeamLines("# Team\n", [])).toBe("# Team\n");
  });
});

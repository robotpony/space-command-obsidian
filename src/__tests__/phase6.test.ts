import { describe, it, expect } from "vitest";
import { lineContent, normalizedText, sectionLabel } from "../tags";
import { landingLine, lineAnchor, revealUrl, sectionLabels, vaultRelativePath } from "../landing";

// PLAN.md › Phase 6: switching between the apps.

describe("normalizedText (ItemText.normalized)", () => {
  it("drops the marker, box, tags, stamps, block ID and strike", () => {
    expect(normalizedText("- [x] ~~Ship the  thing~~ #todone @2026-10-19 #p1 ^abc-1")).toBe("Ship the thing");
  });

  it("is the same whatever the item's state", () => {
    const open = normalizedText("- [ ] Fix parser #todo #p2 #focus");
    expect(normalizedText("- [x] Fix parser #todone")).toBe(open);
    expect(normalizedText("  * Fix parser #todo #snooze")).toBe(open);
    expect(open).toBe("Fix parser");
  });

  it("keeps @handles and tags in code spans", () => {
    expect(normalizedText("- [ ] Ask @sam about `#todo` #todo")).toBe("Ask @sam about `#todo`");
  });

  it("reads headings, ordered items and any box state", () => {
    expect(normalizedText("### Release #todo ##")).toBe("Release");
    expect(normalizedText("3. [/] Half done #todo")).toBe("Half done");
    expect(lineContent("-not a list")).toBe("-not a list");
  });
});

describe("sectionLabel / sectionLabels", () => {
  it("strips tags, mentions and bold", () => {
    expect(sectionLabel("**Tuesday** #weekly @sam")).toBe("Tuesday");
  });

  it("tracks headings and bold sub-headings outside tagged sections", () => {
    const lines = [
      "---", "title: x", "---",
      "# Notes",
      "**Monday**",
      "- one #todo",
      "## Ship #todo",
      "**Not a label**",
      "- [ ] two",
      "```", "# not a heading", "```",
    ];
    expect(sectionLabels(lines)).toEqual([
      null, null, null, "Notes", "Monday", "Monday", "Ship", "Ship", "Ship", "Ship", "Ship", "Ship",
    ]);
  });
});

describe("landingLine", () => {
  const lines = [
    "# A",
    "- [ ] Write docs #todo",
    "- [ ] Other #todo",
    "# B",
    "- [ ] Write docs #todo #p1",
  ];

  it("keeps the given line when its text matches", () => {
    expect(landingLine(lines, { line: 5, text: "Write docs" })).toBe(4);
  });

  it("finds the nearest match when the line moved", () => {
    expect(landingLine(lines, { line: 3, text: "Write docs" })).toBe(1);
    expect(landingLine(lines, { line: 4, text: "Write docs" })).toBe(4);
  });

  it("breaks a distance tie by heading", () => {
    const tied = ["# A", "- [ ] Write docs #todo", "# B", "- [ ] Write docs #todo"];
    expect(landingLine(tied, { line: 3, text: "Write docs", heading: "B" })).toBe(3);
    expect(landingLine(tied, { line: 3, text: "Write docs", heading: "A" })).toBe(1);
    expect(landingLine(tied, { line: 3, text: "Write docs" })).toBe(1);
  });

  it("falls back to the given line, clamped", () => {
    expect(landingLine(lines, { line: 2, text: "Gone" })).toBe(1);
    expect(landingLine(lines, { line: 99 })).toBe(4);
    expect(landingLine(lines, { line: 0 })).toBe(0);
    expect(landingLine(lines, {})).toBe(0);
    expect(landingLine(lines, { line: NaN, text: "Other" })).toBe(2);
  });
});

describe("lineAnchor and revealUrl", () => {
  it("sends the cursor line's text and heading", () => {
    const lines = ["## Docs #todo", "- [ ] Write it up"];
    expect(lineAnchor(lines, 1)).toEqual({ text: "Write it up", heading: "Docs" });
  });

  it("encodes spaces as %20 and makes the line 1-based", () => {
    expect(revealUrl({ path: "/Users/me/My Vault/a+b.md", line: 0, text: "Write it", heading: "" })).toBe(
      "spacecommand://reveal?path=%2FUsers%2Fme%2FMy%20Vault%2Fa%2Bb.md&line=1&text=Write%20it"
    );
    expect(revealUrl({ path: "/v/a.md" })).toBe("spacecommand://reveal?path=%2Fv%2Fa.md");
  });
});

describe("vaultRelativePath", () => {
  it("relativises absolute paths inside the vault", () => {
    expect(vaultRelativePath("/Users/me/Vault/notes/a.md", "/Users/me/Vault")).toBe("notes/a.md");
    expect(vaultRelativePath("/Users/me/Vault/notes/a.md", "/Users/me/Vault/")).toBe("notes/a.md");
  });

  it("takes anything else as vault-relative", () => {
    expect(vaultRelativePath("notes/a.md", "/Users/me/Vault")).toBe("notes/a.md");
    expect(vaultRelativePath("/notes/a.md", null)).toBe("notes/a.md");
  });
});

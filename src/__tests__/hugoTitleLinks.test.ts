import { describe, it, expect } from "vitest";
import { normalizeLinkTitle } from "../HugoParser";
import { TitleLinkIndex, detectVaultContentPrefix, isRegularPagePath } from "../HugoTitleLinks";

describe("normalizeLinkTitle", () => {
  it("lowercases and collapses non-alphanumeric runs to one space", () => {
    expect(normalizeLinkTitle("Rich veg/mushroom stock")).toBe("rich veg mushroom stock");
    expect(normalizeLinkTitle("  Chef John’s  hamburger-buns! ")).toBe("chef john s hamburger buns");
  });

  it("treats curly and straight apostrophes alike", () => {
    expect(normalizeLinkTitle("Chef John's buns")).toBe(normalizeLinkTitle("Chef John’s buns"));
  });
});

describe("TitleLinkIndex", () => {
  it("resolves a link by normalized title", () => {
    const index = new TitleLinkIndex();
    index.set("content/recipes/cherry-tomato.md", "Cherry tomato and garlic spaghetti");
    expect(index.resolve("Cherry tomato and garlic spaghetti")).toBe("content/recipes/cherry-tomato.md");
    expect(index.resolve("cherry-tomato AND garlic spaghetti")).toBe("content/recipes/cherry-tomato.md");
    expect(index.resolve("Something else")).toBeNull();
  });

  it("never resolves an empty or all-punctuation link", () => {
    const index = new TitleLinkIndex();
    index.set("content/a.md", "!!!");
    expect(index.resolve("")).toBeNull();
    expect(index.resolve("???")).toBeNull();
  });

  it("follows title changes and deletions, reporting whether anything changed", () => {
    const index = new TitleLinkIndex();
    expect(index.set("content/a.md", "Old title")).toBe(true);
    expect(index.set("content/a.md", "old  TITLE")).toBe(false);
    expect(index.set("content/a.md", "New title")).toBe(true);
    expect(index.resolve("Old title")).toBeNull();
    expect(index.resolve("New title")).toBe("content/a.md");
    expect(index.delete("content/a.md")).toBe(true);
    expect(index.delete("content/a.md")).toBe(false);
    expect(index.resolve("New title")).toBeNull();
  });

  it("resolves duplicate titles to the first path in sort order", () => {
    const index = new TitleLinkIndex();
    index.set("content/z.md", "Same");
    index.set("content/a.md", "Same");
    expect(index.resolve("Same")).toBe("content/a.md");
    index.delete("content/a.md");
    expect(index.resolve("Same")).toBe("content/z.md");
  });
});

describe("isRegularPagePath", () => {
  it("accepts markdown under the content dir, excluding _index.md", () => {
    expect(isRegularPagePath("content/recipes/x.md", "content/")).toBe(true);
    expect(isRegularPagePath("content/recipes/bundle/index.md", "content/")).toBe(true);
    expect(isRegularPagePath("content/recipes/_index.md", "content/")).toBe(false);
    expect(isRegularPagePath("docs/FORMAT.md", "content/")).toBe(false);
    expect(isRegularPagePath("content/image.png", "content/")).toBe(false);
  });

  it("accepts the whole vault when the content dir is the root", () => {
    expect(isRegularPagePath("x.md", "")).toBe(true);
    expect(isRegularPagePath("_index.md", "")).toBe(false);
  });
});

describe("detectVaultContentPrefix", () => {
  const vault = (files: Record<string, string>) => ({
    exists: async (path: string) => path in files,
    read: async (path: string) => files[path],
  });

  it("finds the root config and resolves contentDir", async () => {
    expect(await detectVaultContentPrefix(vault({ "hugo.toml": 'title = "x"' }))).toBe("content");
    expect(await detectVaultContentPrefix(vault({ "config/_default/hugo.yaml": "contentDir: posts" }))).toBe("posts");
  });

  it("prefers hugo.* over config.*", async () => {
    expect(await detectVaultContentPrefix(vault({ "config.toml": 'contentDir = "old"', "hugo.toml": 'contentDir = "new"' }))).toBe("new");
  });

  it("is null without a config, or with a contentDir outside the vault", async () => {
    expect(await detectVaultContentPrefix(vault({}))).toBeNull();
    expect(await detectVaultContentPrefix(vault({ "hugo.toml": 'contentDir = "../out"' }))).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { HUGO_CONFIG_CANDIDATES, parseHugoConfig, vaultContentPrefix } from "../HugoParser";

describe("parseHugoConfig", () => {
  it("defaults to 'content' when contentDir isn't set", () => {
    expect(parseHugoConfig("baseURL = \"https://example.com\"\n").contentDir).toBe("content");
    expect(parseHugoConfig("baseURL: https://example.com\n").contentDir).toBe("content");
  });

  it("extracts contentDir from TOML", () => {
    const toml = [
      "baseURL = \"https://example.com\"",
      "contentDir = \"site-content\"",
      "title = \"My Site\"",
    ].join("\n");
    expect(parseHugoConfig(toml).contentDir).toBe("site-content");
  });

  it("extracts contentDir from YAML, quoted or bare", () => {
    expect(parseHugoConfig("contentDir: site-content\n").contentDir).toBe("site-content");
    expect(parseHugoConfig("contentDir: \"site-content\"\n").contentDir).toBe("site-content");
  });
});

describe("vaultContentPrefix", () => {
  it("normalizes a relative contentDir", () => {
    expect(vaultContentPrefix("content")).toBe("content");
    expect(vaultContentPrefix("./site/content/")).toBe("site/content");
    expect(vaultContentPrefix(".")).toBe("");
    expect(vaultContentPrefix("a/../b")).toBe("b");
  });

  it("rejects a contentDir outside the vault", () => {
    expect(vaultContentPrefix("/abs/content")).toBeNull();
    expect(vaultContentPrefix("../elsewhere")).toBeNull();
    expect(vaultContentPrefix("C:\\sites\\content")).toBeNull();
  });
});

describe("HUGO_CONFIG_CANDIDATES", () => {
  it("checks root-level names first, hugo.* before config.*", () => {
    expect(HUGO_CONFIG_CANDIDATES[0]).toBe("hugo.toml");
    expect(HUGO_CONFIG_CANDIDATES.indexOf("config.yml")).toBeLessThan(HUGO_CONFIG_CANDIDATES.indexOf("config/_default/hugo.toml"));
  });
});

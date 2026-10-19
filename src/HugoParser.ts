/**
 * Pure, string-in parsing for title-based wiki links in a Hugo vault (see
 * HugoTitleLinks.ts): which config files mark the vault root as a Hugo
 * site, the one config key needed (`contentDir`), and the link-title
 * normalization rule.
 *
 * No `fs` here — so `hugoParser.test.ts` can exercise everything directly.
 * There is no YAML/TOML parser dependency in this plugin; these are
 * hand-rolled regex extractors, not general parsers.
 */

export interface ParsedHugoConfig {
  contentDir: string;
}

const DEFAULT_CONTENT_DIR = "content";

/**
 * Vault-relative config paths that mark the vault root as a Hugo site, in
 * priority order: modern Hugo (v0.109+) prefers `hugo.*` over the older
 * `config.*` naming, and hugo.toml before hugo.yaml/yml mirrors what
 * `hugo new site` scaffolds by default. The newer `config/_default/`
 * layout is checked only after every root-level name.
 */
export const HUGO_CONFIG_CANDIDATES: readonly string[] = (() => {
  const names = ["hugo.toml", "hugo.yaml", "hugo.yml", "config.toml", "config.yaml", "config.yml"];
  return [...names, ...names.map((name) => `config/_default/${name}`)];
})();

/**
 * Extracts `contentDir` from a Hugo site config file's raw text — TOML
 * (`contentDir = "..."`) or YAML (`contentDir: ...`), whichever the file
 * turns out to be; tries both patterns rather than requiring the caller to
 * know the dialect up front. Defaults to Hugo's own default, `"content"`,
 * when the key isn't set (the common case — most sites never override it).
 */
export function parseHugoConfig(content: string): ParsedHugoConfig {
  const tomlMatch = content.match(/^\s*contentDir\s*=\s*["']([^"']+)["']/m);
  if (tomlMatch) return { contentDir: tomlMatch[1] };

  const yamlMatch = content.match(/^\s*contentDir\s*:\s*["']?([^"'\r\n]+?)["']?\s*$/m);
  if (yamlMatch) return { contentDir: yamlMatch[1].trim() };

  return { contentDir: DEFAULT_CONTENT_DIR };
}

/**
 * A config's `contentDir` as a vault-relative prefix ("" for the vault
 * root, no leading `./` or trailing slash), or null when it points outside
 * the vault (absolute, or climbing out with `..`).
 */
export function vaultContentPrefix(contentDir: string): string | null {
  if (contentDir.startsWith("/") || /^[A-Za-z]:[\\/]/.test(contentDir)) return null;
  const parts: string[] = [];
  for (const part of contentDir.split(/[\\/]+/)) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

/**
 * Normalizes a wiki-link target or page title for title-based link matching
 * (see HugoTitleLinks.ts). Mirrors the site-side rule in a Hugo wiki-link
 * render hook (Fugu's `_markup/render-link.html`): lowercase, collapse any
 * run of non-`[a-z0-9]` characters to one space, trim — so a link that
 * resolves on the site resolves in Obsidian too. Keep the two in step.
 */
export function normalizeLinkTitle(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

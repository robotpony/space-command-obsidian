import { App, TFile } from "obsidian";
import { HUGO_CONFIG_CANDIDATES, normalizeLinkTitle, parseHugoConfig, vaultContentPrefix } from "./HugoParser";

/**
 * Title-based wiki links for a Hugo vault.
 *
 * Hugo sites built with a wiki-link render hook (e.g. Fugu's) write links by
 * page title — `[[Cherry tomato and garlic spaghetti]]` — while the file is
 * `content/recipes/cherry-tomato-and-garlic-spaghetti.md`. Obsidian resolves
 * links by filename only (frontmatter `aliases` feed the link suggester, not
 * resolution), so those links read as unresolved and clicking one creates an
 * empty note. `aliases` is off-limits anyway: Hugo uses that key for URL
 * redirects.
 *
 * Fix: wrap `metadataCache.getLinkpathDest`. When Obsidian's own lookup finds
 * nothing, fall back to matching the normalized link text against the
 * normalized frontmatter `title` of the site's regular pages. Filename
 * matches always win, so ordinary links are unaffected. Obsidian's
 * `getFirstLinkpathDest`, `isUnresolved` (link styling) and `resolveLinks`
 * (backlinks, graph, unresolved-link counts) all go through
 * `getLinkpathDest`, so one wrap covers clicking, hover preview, styling and
 * the link graph. Verified against Obsidian 1.14's app.js; these are
 * internal call paths, not public API.
 *
 * Vault-only: active only when the vault root is itself a Hugo site
 * (`detectVaultContentPrefix`). It never looks for a site anywhere else.
 */

/** The slice of Obsidian's DataAdapter detection needs: vault-relative reads. */
export interface VaultReader {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
}

/**
 * The vault-relative content prefix of the Hugo site at the vault root, or
 * null when the root has no Hugo config, or its `contentDir` points outside
 * the vault. Reads through the vault adapter, not Node `fs`.
 */
export async function detectVaultContentPrefix(vault: VaultReader): Promise<string | null> {
  for (const path of HUGO_CONFIG_CANDIDATES) {
    try {
      if (!(await vault.exists(path))) continue;
      return vaultContentPrefix(parseHugoConfig(await vault.read(path)).contentDir);
    } catch {
      return null;
    }
  }
  return null;
}

/** Pure title index, kept free of Obsidian so it's unit-testable. */
export class TitleLinkIndex {
  /** vault path → normalized title, for every indexed page. */
  private titles = new Map<string, string>();
  /** normalized title → vault paths carrying it, sorted. */
  private byTitle = new Map<string, string[]>();

  /**
   * Sets (or, with an empty/undefined title, removes) a page's title.
   * Returns true when the index changed.
   */
  set(path: string, title: string | undefined): boolean {
    const normalized = title ? normalizeLinkTitle(title) : "";
    const previous = this.titles.get(path);
    if ((previous ?? "") === normalized) return false;
    if (previous !== undefined) this.removeFromBucket(previous, path);
    if (normalized) {
      this.titles.set(path, normalized);
      const bucket = this.byTitle.get(normalized) ?? [];
      bucket.push(path);
      bucket.sort();
      this.byTitle.set(normalized, bucket);
    } else {
      this.titles.delete(path);
    }
    return true;
  }

  delete(path: string): boolean {
    return this.set(path, undefined);
  }

  clear(): void {
    this.titles.clear();
    this.byTitle.clear();
  }

  /**
   * The page a link resolves to, or null. Duplicate titles resolve to the
   * first path in sort order — deterministic, though Hugo itself picks by
   * its own page order, so duplicates may differ from the site.
   */
  resolve(linkpath: string): string | null {
    const normalized = normalizeLinkTitle(linkpath);
    if (!normalized) return null;
    return this.byTitle.get(normalized)?.[0] ?? null;
  }

  private removeFromBucket(normalized: string, path: string): void {
    const bucket = this.byTitle.get(normalized);
    if (!bucket) return;
    const remaining = bucket.filter((p) => p !== path);
    if (remaining.length) this.byTitle.set(normalized, remaining);
    else this.byTitle.delete(normalized);
  }
}

/**
 * True for a vault path Hugo treats as a regular page: a markdown file under
 * the content dir, excluding section/list pages (`_index.md`). Matches the
 * `site.RegularPages` set the render hook searches.
 */
export function isRegularPagePath(path: string, contentPrefix: string): boolean {
  if (!path.endsWith(".md")) return false;
  if (contentPrefix && !path.startsWith(contentPrefix)) return false;
  return !(path === "_index.md" || path.endsWith("/_index.md"));
}

type LinkpathDest = (linkpath: string, sourcePath: string) => TFile[];

interface ResolverCache {
  getLinkpathDest: LinkpathDest;
  /** Internal (Obsidian 1.x): re-runs link resolution for one file. */
  queueFileForLinkResolution?: (file: TFile) => void;
}

/** Obsidian wiring: keeps a TitleLinkIndex in sync and wraps link lookup. */
export class HugoTitleLinkResolver {
  private index = new TitleLinkIndex();
  private contentPrefix: string | null = null;
  private original: LinkpathDest | null = null;
  private wrapper: LinkpathDest | null = null;
  private reresolveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private app: App) {}

  /** Whether the resolver is currently active (a Hugo site was found). */
  get active(): boolean {
    return this.contentPrefix !== null;
  }

  /**
   * Starts resolving title links against the site whose content dir is at
   * `contentPrefix` (vault-relative, "" for the vault root). Safe to call
   * again; a second call just rebuilds the index.
   */
  enable(contentPrefix: string): void {
    this.contentPrefix = contentPrefix && !contentPrefix.endsWith("/") ? contentPrefix + "/" : contentPrefix;
    this.rebuild();
    this.install();
    this.reresolveAll();
  }

  /** Stops resolving title links and restores Obsidian's own lookup. */
  disable(): void {
    if (this.contentPrefix === null) return;
    this.contentPrefix = null;
    this.index.clear();
    this.uninstall();
    this.reresolveAll();
  }

  /** Disables and drops any pending re-resolve — for plugin unload. */
  destroy(): void {
    this.disable();
    if (this.reresolveTimer) clearTimeout(this.reresolveTimer);
    this.reresolveTimer = null;
  }

  /** Re-reads one file's title after a metadata change. */
  onFileChanged(file: TFile): void {
    if (!this.active) return;
    if (this.updateFile(file)) this.scheduleReresolve();
  }

  onFileDeleted(path: string): void {
    if (!this.active) return;
    if (this.index.delete(path)) this.scheduleReresolve();
  }

  onFileRenamed(file: TFile, oldPath: string): void {
    if (!this.active) return;
    const removed = this.index.delete(oldPath);
    const added = this.updateFile(file);
    if (removed || added) this.scheduleReresolve();
  }

  private updateFile(file: TFile): boolean {
    if (this.contentPrefix === null) return false;
    if (!isRegularPagePath(file.path, this.contentPrefix)) return this.index.delete(file.path);
    const title = this.app.metadataCache.getFileCache(file)?.frontmatter?.title;
    return this.index.set(file.path, typeof title === "string" ? title : undefined);
  }

  private rebuild(): void {
    this.index.clear();
    for (const file of this.app.vault.getMarkdownFiles()) this.updateFile(file);
  }

  private install(): void {
    if (this.wrapper) return;
    const cache = this.app.metadataCache as unknown as ResolverCache;
    const original = cache.getLinkpathDest;
    this.original = original;
    const wrapper: LinkpathDest = (linkpath, sourcePath) => {
      const found = original.call(cache, linkpath, sourcePath);
      if (found.length > 0 || this.contentPrefix === null) return found;
      const path = this.index.resolve(linkpath);
      const file = path ? this.app.vault.getFileByPath(path) : null;
      return file ? [file] : found;
    };
    this.wrapper = wrapper;
    cache.getLinkpathDest = wrapper;
  }

  private uninstall(): void {
    const cache = this.app.metadataCache as unknown as ResolverCache;
    // Only unwrap if nothing has wrapped on top of us since; otherwise the
    // wrapper stays in the chain as a pass-through (contentPrefix is null).
    if (this.wrapper && cache.getLinkpathDest === this.wrapper && this.original) {
      cache.getLinkpathDest = this.original;
    }
    this.wrapper = null;
    this.original = null;
  }

  /** Debounced reresolveAll — a title being typed changes on every keystroke. */
  private scheduleReresolve(): void {
    if (this.reresolveTimer) clearTimeout(this.reresolveTimer);
    this.reresolveTimer = setTimeout(() => {
      this.reresolveTimer = null;
      this.reresolveAll();
    }, 500);
  }

  /**
   * Queues every note for Obsidian's own link resolution so backlinks, graph
   * and unresolved counts pick up the change. Cheap per file; Obsidian runs
   * the queue in the background and fires `resolved` when done. Skipped
   * silently if the internal method ever goes away.
   */
  private reresolveAll(): void {
    const cache = this.app.metadataCache as unknown as ResolverCache;
    if (typeof cache.queueFileForLinkResolution !== "function") return;
    try {
      for (const file of this.app.vault.getMarkdownFiles()) {
        cache.queueFileForLinkResolution(file);
      }
    } catch (error) {
      console.error("[Warped Todo]", "Couldn't re-resolve links after a title change:", error);
    }
  }
}

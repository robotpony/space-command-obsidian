import { TodoItem, HugoPost } from "./types";
import { ParsedProjectItem, hasHeaderReportShape } from "./StructuredFileParser";
import { PlanSummary } from "./PlanParser";
import { hasTag } from "./utils";

/**
 * Builds the "Export scan snapshot" JSON: what the plugin's own scanners
 * parsed, in a stable, diffable shape. Space Command (the native successor)
 * emits the same shape so the two parsers can be compared with plain `diff`.
 *
 * Pure — main.ts runs the real scans (vault, Projects, Posts) and passes the
 * results in. Determinism rules: arrays sorted by code point (not locale),
 * object keys sorted at serialize time, explicit `null` instead of missing
 * fields, and `generatedAt` as the only run-specific value.
 *
 * Bump SNAPSHOT_SCHEMA when a field changes meaning or is removed; adding a
 * field doesn't need a bump.
 */

export const SNAPSHOT_SCHEMA = 1;
export const SNAPSHOT_FILE_PATH = "warped-command-snapshot.json";

/** One repo found by the Projects scan, plus its parsed files. Paths are relative to the Projects base folder. */
export interface SnapshotRepoInput {
  name: string;
  path: string;
  title: string;
  stack: string[];
  branch: string;
  remote: string;
  /** Vault path of the project's synced note. */
  noteFile: string;
  /** Structured files present in the repo, with their content (for shape detection) and the items parsed from them. */
  structuredFiles: { name: string; content: string; items: ParsedProjectItem[] }[];
  /** PLAN.md summary; null when the repo has no PLAN.md. */
  plan: PlanSummary | null;
}

export interface SnapshotInput {
  version: string;
  generatedAt: string;
  /** Every vault item from all four scanner caches (todos, todones, ideas, principles). */
  vaultItems: TodoItem[];
  repos: SnapshotRepoInput[];
  /** Same precedence ProjectManager uses to link a vault item to a project tag. */
  resolveProjectTags: (item: TodoItem) => string[];
  /** Hugo content dir relative to the vault root, or null when the vault isn't a Hugo site. */
  hugoContentDir: string | null;
  /** Posts with `path` already made vault-relative. */
  posts: HugoPost[];
}

type Source = "taggedHeading" | "headerChild" | "taggedLine" | "structuredFile";

interface SnapshotItem {
  root: "vault" | "projects";
  file: string;
  /** 1-based. */
  line: number;
  text: string;
  kind: string;
  status: "open" | "done";
  tags: string[];
  priority: string | null;
  today: boolean;
  focus: boolean;
  snoozed: boolean;
  section: string | null;
  source: Source;
  shape: string | null;
}

const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function highestPriorityTag(tags: string[]): string | null {
  for (const p of ["p0", "p1", "p2", "p3", "p4"]) {
    if (hasTag(tags, `#${p}`)) return p;
  }
  return null;
}

function lifecycleFlags(tags: string[]) {
  return {
    priority: highestPriorityTag(tags),
    today: hasTag(tags, "#today"),
    focus: hasTag(tags, "#focus"),
    snoozed: hasTag(tags, "#future") || hasTag(tags, "#snooze") || hasTag(tags, "#snoozed"),
  };
}

function vaultItemSource(item: TodoItem): Source {
  if (item.isHeader) return "taggedHeading";
  if (item.parentLineNumber !== undefined) return "headerChild";
  return "taggedLine";
}

/** Heading label stripped of `#`s and tags — the same cleanup TodoScanner applies to section labels. */
function headingLabel(text: string): string {
  return text
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/#[\w-]+/g, "")
    .replace(/@[\w][\w.-]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function vaultItemRows(items: TodoItem[]): SnapshotItem[] {
  const byLine = new Map<string, TodoItem>();
  for (const item of items) byLine.set(`${item.filePath}\n${item.lineNumber}`, item);

  return items.map((item) => {
    const parent = item.parentLineNumber !== undefined
      ? byLine.get(`${item.filePath}\n${item.parentLineNumber}`)
      : undefined;
    const section = parent ? headingLabel(parent.text) : item.sectionLabel ?? null;
    return {
      root: "vault",
      file: item.filePath,
      line: item.lineNumber + 1,
      text: item.text,
      kind: item.itemType === "todone" ? "todo" : item.itemType ?? "todo",
      status: item.itemType === "todone" ? "done" : "open",
      tags: [...item.tags].sort(byCodePoint),
      ...lifecycleFlags(item.tags),
      section: section || null,
      source: vaultItemSource(item),
      shape: null,
    };
  });
}

function structuredItemRows(repo: SnapshotRepoInput): SnapshotItem[] {
  const rows: SnapshotItem[] = [];
  for (const file of repo.structuredFiles) {
    for (const item of file.items) {
      rows.push({
        root: "projects",
        file: `${repo.path}/${file.name}`,
        line: item.lineNumber + 1,
        text: item.text,
        kind: item.itemType,
        status: item.completed ? "done" : "open",
        tags: [...item.tags].sort(byCodePoint),
        ...lifecycleFlags(item.tags),
        section: null,
        source: "structuredFile",
        shape: item.shape,
      });
    }
  }
  return rows;
}

function compareItems(a: SnapshotItem, b: SnapshotItem): number {
  return byCodePoint(a.root, b.root)
    || byCodePoint(a.file, b.file)
    || a.line - b.line
    || byCodePoint(a.kind, b.kind)
    || byCodePoint(a.text, b.text);
}

export function buildSnapshot(input: SnapshotInput): Record<string, unknown> {
  const repos = [...input.repos].sort((a, b) => byCodePoint(a.path, b.path));

  const items = [
    ...vaultItemRows(input.vaultItems),
    ...repos.flatMap(structuredItemRows),
  ].sort(compareItems);

  const structuredFiles = repos.flatMap((repo) =>
    repo.structuredFiles.map((file) => ({
      project: repo.name,
      file: `${repo.path}/${file.name}`,
      shape: hasHeaderReportShape(file.content.split("\n")) ? "headerReport" : "flatList",
      itemCount: file.items.length,
    }))
  );

  const plans = repos
    .filter((repo) => repo.plan)
    .map((repo) => ({
      project: repo.name,
      done: repo.plan!.doneCount,
      total: repo.plan!.totalCount,
      phases: repo.plan!.phases.map((p) => ({ name: p.heading, done: p.done, total: p.total })),
    }));

  const projects = repos.map((repo) => {
    const tag = `#${repo.name}`.toLowerCase();
    const linkedItems = input.vaultItems
      .filter((item) => input.resolveProjectTags(item).some((t) => t.toLowerCase() === tag))
      .map((item) => ({ file: item.filePath, line: item.lineNumber + 1 }))
      .sort((a, b) => byCodePoint(a.file, b.file) || a.line - b.line);
    return {
      name: repo.name,
      path: repo.path,
      title: repo.title,
      stack: [...repo.stack].sort(byCodePoint),
      branch: repo.branch || null,
      remote: repo.remote || null,
      tag: `#${repo.name}`,
      noteFile: repo.noteFile,
      linkedItems,
    };
  });

  const posts = [...input.posts]
    .sort((a, b) => byCodePoint(a.path, b.path))
    .map((post) => ({
      file: post.path,
      section: post.section,
      title: post.title,
      date: post.date ?? null,
      draft: post.draft,
      summary: post.summary ?? null,
    }));

  return {
    schema: SNAPSHOT_SCHEMA,
    version: input.version,
    generatedAt: input.generatedAt,
    items,
    taskFiles: { plans, structured: structuredFiles },
    projects,
    hugo: { contentDir: input.hugoContentDir, posts },
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(byCodePoint)) {
      const v = (value as Record<string, unknown>)[key];
      out[key] = v === undefined ? null : sortKeys(v);
    }
    return out;
  }
  return value;
}

/** 2-space JSON with sorted keys and a trailing newline. */
export function serializeSnapshot(snapshot: Record<string, unknown>): string {
  return JSON.stringify(sortKeys(snapshot), null, 2) + "\n";
}

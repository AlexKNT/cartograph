import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { detectAdapter } from "./adapters/detect.ts";
import type { RepositoryAdapter } from "./adapters/index.ts";
import { buildEdges, summariseCoverage, withFanCounts, type FileFacts } from "./graph.ts";
import { createImportProject, readImportStatements, type ImportStatement } from "./parse-imports.ts";
import { hasSourceExtension } from "./paths.ts";
import { readResolutionHints } from "./resolution-hints.ts";
import { resolveImport, type RepositoryIndex } from "./resolve.ts";
import type {
  FileRole,
  ParseResult,
  ParseStats,
  ParsedRoute,
  SeenImport,
  SkipReason,
} from "./types.ts";
import { describeFile, walkRepository, type WalkResult } from "./walk.ts";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function countLines(text: string): number {
  if (text === "") return 0;
  let breaks = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) breaks += 1;
  }
  return text.endsWith("\n") ? breaks : breaks + 1;
}

/**
 * The content hash, exported because something outside the parser now compares
 * against it: whether a file has changed since the run that read it. One
 * definition, so "the same file" cannot mean two different things.
 */
export function contentHashOf(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Adds the adapter's entry points to the walk, even when the structural
 * selection would have left them out. A file promoted out of a pruned directory
 * is taken off that directory's count, so found still equals parsed plus
 * skipped.
 */
function addEntryPoints(
  entryPoints: readonly string[],
  root: string,
  walk: WalkResult,
): string[] {
  const added: string[] = [];

  for (const entryPoint of entryPoints) {
    const path = entryPoint.replace(/^\.\//, "");
    if (walk.files.some((file) => file.path === path)) {
      added.push(path);
      continue;
    }

    if (!hasSourceExtension(path)) continue;
    const absolutePath = resolve(root, path);

    try {
      if (!statSync(absolutePath).isFile()) continue;
    } catch {
      continue;
    }

    const skippedIndex = walk.skippedFiles.findIndex((file) => file.path === path);
    if (skippedIndex !== -1) {
      walk.skippedFiles.splice(skippedIndex, 1);
    } else {
      const pruned = walk.skippedDirectories.find(
        (directory) => path === directory.path || path.startsWith(`${directory.path}/`),
      );
      if (pruned !== undefined) pruned.files -= 1;
    }

    walk.files.push(describeFile(path, absolutePath));
    added.push(path);
  }

  return added;
}

function buildIndex(walk: WalkResult, nodes: ReadonlySet<string>): RepositoryIndex {
  return {
    nodes,
    skipped: new Map(
      walk.skippedFiles.map((file) => [
        file.path,
        { reason: file.reason, detail: file.detail },
      ]),
    ),
    pruned: walk.skippedDirectories
      .map((directory) => ({
        path: directory.path,
        reason: directory.reason,
        detail: directory.detail,
      }))
      .sort((left, right) => right.path.length - left.path.length),
  };
}

/**
 * Directory path in, the whole parse out. Nothing here reads the network, the
 * database or the web framework: it is runnable from a plain script.
 */
export function parseRepository(
  directory: string,
  adapter?: RepositoryAdapter,
): ParseResult {
  const root = resolve(directory);
  const rootStats = statSync(root, { throwIfNoEntry: false });
  if (rootStats === undefined || !rootStats.isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }

  const walk = walkRepository(root);
  const chosen = adapter ?? detectAdapter(root, walk.files.map((file) => file.path));
  const entryPoints = addEntryPoints(
    chosen.entryPoints(walk.files.map((file) => file.path)),
    root,
    walk,
  );
  const hints = readResolutionHints(root);
  const project = createImportProject();

  const facts: FileFacts[] = [];
  const read: { from: string; statements: ImportStatement[] }[] = [];
  const roles: FileRole[] = [];
  const routes: ParsedRoute[] = [];

  for (const file of walk.files) {
    let content: Buffer;
    try {
      content = readFileSync(file.absolutePath);
    } catch (error) {
      walk.skippedFiles.push({
        path: file.path,
        reason: "unreadable",
        detail: errorMessage(error),
      });
      continue;
    }

    const text = content.toString("utf8");

    const role = chosen.roleOf({ path: file.path, text });
    if (role !== null) roles.push({ file: file.path, role });

    for (const route of chosen.routesOf({ path: file.path, text })) {
      routes.push({ file: file.path, method: route.method, route: route.route });
    }

    facts.push({
      path: file.path,
      name: file.name,
      extension: file.extension,
      folder: file.folder,
      module: file.module,
      lines: countLines(text),
      bytes: content.byteLength,
      hash: contentHashOf(content),
    });
    read.push({ from: file.path, statements: readImportStatements(project, file.path, text) });
  }

  const index = buildIndex(walk, new Set(facts.map((file) => file.path)));

  const imports: SeenImport[] = [];
  for (const { from, statements } of read) {
    for (const statement of statements) {
      imports.push({
        from,
        specifier: statement.specifier,
        kind: statement.kind,
        line: statement.line,
        outcome: resolveImport(statement, from, index, hints),
      });
    }
  }
  imports.sort((left, right) => {
    if (left.from !== right.from) return left.from < right.from ? -1 : 1;
    if (left.line !== right.line) return left.line - right.line;
    return left.specifier < right.specifier ? -1 : 1;
  });

  const edges = buildEdges(imports);
  const files = withFanCounts(facts, edges);
  const coverage = summariseCoverage(imports);

  roles.sort((left, right) =>
    left.file === right.file
      ? left.role < right.role
        ? -1
        : 1
      : left.file < right.file
        ? -1
        : 1,
  );

  // Two decorators can spell the same route (`@Get()` and `@Get("/")`). The row
  // they would write is the same row, and the unique index keeps one of them,
  // so the duplicate is removed here rather than failing the insert.
  const routeKeys = new Set<string>();
  const uniqueRoutes = routes.filter((route) => {
    const key = `${route.file}\u0000${route.route}\u0000${route.method ?? ""}`;
    if (routeKeys.has(key)) return false;
    routeKeys.add(key);
    return true;
  });
  uniqueRoutes.sort((left, right) => {
    if (left.file !== right.file) return left.file < right.file ? -1 : 1;
    if (left.route !== right.route) return left.route < right.route ? -1 : 1;
    return (left.method ?? "") < (right.method ?? "") ? -1 : 1;
  });

  const skippedByReason: Record<SkipReason, number> = {
    "unsupported-extension": 0,
    symlink: 0,
    "too-large": 0,
    unreadable: 0,
    "version-control": 0,
    dependency: 0,
    "build-output": 0,
  };
  for (const file of walk.skippedFiles) skippedByReason[file.reason] += 1;
  for (const directory of walk.skippedDirectories) {
    skippedByReason[directory.reason] += directory.files;
  }

  const filesSkipped =
    walk.skippedFiles.length +
    walk.skippedDirectories.reduce((total, directory) => total + directory.files, 0);

  const stats: ParseStats = {
    filesFound: files.length + filesSkipped,
    filesParsed: files.length,
    filesSkipped,
    skippedByReason,
    folders: new Set(files.map((file) => file.folder)).size,
    modules: new Set(files.map((file) => file.module)).size,
    importsSeen: imports.length,
    edges: edges.length,
    reExportsSeen: imports.filter((entry) => entry.kind === "re-export").length,
    reExportsResolved: imports.filter(
      (entry) => entry.kind === "re-export" && entry.outcome.status === "resolved",
    ).length,
  };

  return {
    repository: { name: basename(root), root, framework: chosen.name },
    entryPoints,
    roles,
    routes: uniqueRoutes,
    stats,
    files,
    edges,
    imports,
    coverage,
    skippedFiles: walk.skippedFiles.sort((left, right) =>
      left.path < right.path ? -1 : 1,
    ),
    skippedDirectories: walk.skippedDirectories.sort((left, right) =>
      left.path < right.path ? -1 : 1,
    ),
  };
}

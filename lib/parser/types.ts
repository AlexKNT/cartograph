/**
 * The parser's output contract.
 *
 * Everything built after phase 3 reads this shape, so it changes only when the
 * thing reading it changes. Nothing here mentions a framework, the UI or the
 * database: the parser takes a directory path and returns data.
 */

/** The three statement kinds that produce an edge. */
export type EdgeKind = "import" | "re-export" | "dynamic-import";

/** Why a file on disk did not become a node. */
export type FileSkipReason =
  | "unsupported-extension"
  | "symlink"
  | "too-large"
  | "unreadable";

/** Why a whole directory was not walked. */
export type DirectorySkipReason =
  | "version-control"
  | "dependency"
  | "build-output"
  | "symlink"
  | "unreadable";

export type SkipReason = FileSkipReason | DirectorySkipReason;

/** Why an import did not become an edge. */
export type ImportProblemReason =
  /** External: a Node built-in. */
  | "node-builtin"
  /** External: a package specifier, which lives outside the repository. */
  | "package"
  /** External: a relative path that climbs out of the repository. */
  | "outside-repository"
  /** Excluded: resolves to a real file that is not TypeScript or JavaScript. */
  | "not-a-source-file"
  /** Excluded: resolves inside a directory the walk pruned. */
  | "ignored-directory"
  /** Excluded: resolves to a file the walk skipped, for the reason given. */
  | "skipped-file"
  /** Unresolved: nothing on disk matches the specifier. */
  | "file-not-found"
  /** Unresolved: it matched a tsconfig path alias, but the target is missing. */
  | "alias-target-not-found"
  /** Unresolved: the specifier is empty. */
  | "empty-specifier"
  /** Unresolved: a dynamic import whose argument is not a string literal. */
  | "non-literal-dynamic-import";

export type ImportOutcome =
  | { status: "resolved"; to: string }
  | { status: "external"; reason: ImportProblemReason; detail: string }
  | { status: "excluded"; reason: ImportProblemReason; detail: string }
  | { status: "unresolved"; reason: ImportProblemReason; detail: string };

/** Every import, re-export and literal dynamic import the parser saw. */
export interface SeenImport {
  /** The file the statement appears in. */
  from: string;
  /** The specifier exactly as written, or "" when it was not a literal. */
  specifier: string;
  kind: EdgeKind;
  /** 1-based. */
  line: number;
  outcome: ImportOutcome;
}

export interface ParsedFile {
  /** Repository-relative, POSIX separators. */
  path: string;
  name: string;
  extension: string;
  /** The directory holding it, repository-relative; "." at the repository root. */
  folder: string;
  /** Folder plus the name without its extension; an index file is its folder. */
  module: string;
  lines: number;
  bytes: number;
  /** sha256 of the file's bytes. */
  hash: string;
  /** How many distinct files import this one. */
  fanIn: number;
  /** How many distinct files this one imports. */
  fanOut: number;
}

/** One node-to-node connection, after duplicates are removed. */
export interface ImportEdge {
  from: string;
  to: string;
  /** Every statement kind that produced this pair, in a fixed order. */
  kinds: EdgeKind[];
}

export interface SkippedFile {
  path: string;
  reason: FileSkipReason;
  detail: string;
}

export interface SkippedDirectory {
  path: string;
  reason: DirectorySkipReason;
  detail: string;
  /** Files underneath it, counted so the totals still add up. */
  files: number;
}

/** Failures grouped by reason, each with one example that shows the detail. */
export interface CoverageGroup {
  reason: ImportProblemReason;
  count: number;
  example: SeenImport;
}

export interface CoverageReport {
  seen: number;
  resolved: number;
  external: number;
  excluded: number;
  unresolved: number;
  externalByReason: CoverageGroup[];
  excludedByReason: CoverageGroup[];
  unresolvedByReason: CoverageGroup[];
}

export interface ParseStats {
  /** parsed + skipped, by construction. */
  filesFound: number;
  filesParsed: number;
  filesSkipped: number;
  skippedByReason: Record<SkipReason, number>;
  folders: number;
  modules: number;
  importsSeen: number;
  edges: number;
  reExportsSeen: number;
  reExportsResolved: number;
}

export interface ParseResult {
  repository: {
    name: string;
    /** The directory the parser was pointed at, as an absolute path. */
    root: string;
    /** The adapter that supplied the framework knowledge, "none" for the fallback. */
    framework: string;
  };
  /** Paths the adapter named as entry points, whether or not anything imports them. */
  entryPoints: string[];
  stats: ParseStats;
  files: ParsedFile[];
  edges: ImportEdge[];
  imports: SeenImport[];
  coverage: CoverageReport;
  skippedFiles: SkippedFile[];
  skippedDirectories: SkippedDirectory[];
}

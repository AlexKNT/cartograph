import { posix } from "node:path";
import {
  JAVA_SCRIPT_EXTENSIONS,
  SOURCE_EXTENSIONS,
  TYPE_SCRIPT_EXTENSIONS,
  extensionOf,
} from "./paths.ts";
import type { ImportStatement } from "./parse-imports.ts";
import type { ResolutionHints } from "./resolution-hints.ts";
import type {
  DirectorySkipReason,
  FileSkipReason,
  ImportOutcome,
} from "./types.ts";

/**
 * What the walk saw, in a form the resolver can ask questions of. The resolver
 * touches no filesystem and no clock: the same index and the same specifier
 * always produce the same outcome.
 */
export interface RepositoryIndex {
  /** Paths that became nodes. */
  nodes: ReadonlySet<string>;
  /** Paths the walk skipped, and why. */
  skipped: ReadonlyMap<string, { reason: FileSkipReason; detail: string }>;
  /** Directories the walk pruned, deepest first. */
  pruned: readonly {
    path: string;
    reason: DirectorySkipReason;
    detail: string;
  }[];
}

const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

function isRelative(specifier: string): boolean {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier === "." ||
    specifier === ".."
  );
}

function isInside(directory: string, path: string): boolean {
  return path === directory || path.startsWith(`${directory}/`);
}

function joinRepositoryPath(folder: string, specifier: string): string {
  return posix.normalize(posix.join(folder, specifier));
}

/**
 * Every path a specifier could mean, in the order TypeScript would try them.
 * The exact path is tried first so `./globals.css` is reported as a real file
 * that is not source, rather than as a missing one.
 */
function candidatesFor(candidate: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  // Normalised here rather than at each call site: the suffix passes below
  // build `./index.js` out of a root candidate of ".", and a node's path is
  // never spelled that way, so `require("../..")` would miss the root's index.
  const push = (path: string) => {
    const normalised = posix.normalize(path);
    if (seen.has(normalised)) return;
    seen.add(normalised);
    found.push(normalised);
  };

  push(candidate);

  const extension = extensionOf(candidate);
  if ((JAVA_SCRIPT_EXTENSIONS as readonly string[]).includes(extension)) {
    // ESM writes "./x.js" for a file that is really "./x.ts".
    const stem = candidate.slice(0, -extension.length);
    for (const replacement of TYPE_SCRIPT_EXTENSIONS) {
      push(`${stem}${replacement}`);
    }
    return found;
  }

  if (!(SOURCE_EXTENSIONS as readonly string[]).includes(extension)) {
    // A dot in the file name is not an extension: "lib/env.server" wants ".ts".
    for (const suffix of TYPE_SCRIPT_EXTENSIONS) push(`${candidate}${suffix}`);
    for (const suffix of JAVA_SCRIPT_EXTENSIONS) push(`${candidate}${suffix}`);
  }

  for (const suffix of TYPE_SCRIPT_EXTENSIONS) push(`${candidate}/index${suffix}`);
  for (const suffix of JAVA_SCRIPT_EXTENSIONS) push(`${candidate}/index${suffix}`);
  return found;
}

/** What the index makes of one candidate path, or null when nothing is there. */
function classify(candidate: string, index: RepositoryIndex): ImportOutcome | null {
  if (index.nodes.has(candidate)) return { status: "resolved", to: candidate };

  const skipped = index.skipped.get(candidate);
  if (skipped !== undefined) {
    if (skipped.reason === "unsupported-extension") {
      return {
        status: "excluded",
        reason: "not-a-source-file",
        detail: skipped.detail,
      };
    }
    return {
      status: "excluded",
      reason: "skipped-file",
      detail: `${skipped.reason}: ${skipped.detail}`,
    };
  }

  const pruned = index.pruned.find((directory) =>
    isInside(directory.path, candidate),
  );
  if (pruned !== undefined) {
    return {
      status: "excluded",
      reason: "ignored-directory",
      detail: `${pruned.detail} (${pruned.path})`,
    };
  }

  return null;
}

function matchCandidates(
  candidate: string,
  index: RepositoryIndex,
): ImportOutcome | null {
  for (const path of candidatesFor(candidate)) {
    const outcome = classify(path, index);
    if (outcome !== null) return outcome;
  }
  return null;
}

function triedPaths(candidate: string): string {
  const paths = candidatesFor(candidate);
  const shown = paths.slice(0, 4).join(", ");
  return paths.length > 4 ? `${shown}, … ${paths.length - 4} more` : shown;
}

interface MappedSpecifier {
  pattern: string;
  candidate: string;
}

/**
 * Applies the project's `paths`. TypeScript tries an exact pattern first, then
 * the longest matching prefix, which is what this does.
 */
function applyPathMappings(
  specifier: string,
  mappings: readonly { pattern: string; targets: string[] }[],
): MappedSpecifier | null {
  const exact = mappings.find((mapping) => mapping.pattern === specifier);
  if (exact !== undefined && exact.targets[0] !== undefined) {
    return { pattern: exact.pattern, candidate: exact.targets[0] };
  }

  let best: { pattern: string; prefixLength: number; candidate: string } | null = null;
  for (const mapping of mappings) {
    const star = mapping.pattern.indexOf("*");
    if (star === -1) continue;

    const prefix = mapping.pattern.slice(0, star);
    const suffix = mapping.pattern.slice(star + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    if (specifier.length < prefix.length + suffix.length) continue;

    const capture = specifier.slice(prefix.length, specifier.length - suffix.length);
    const target = mapping.targets[0];
    if (target === undefined) continue;

    const candidate = target.includes("*")
      ? target.replace("*", capture)
      : target;

    if (best === null || prefix.length > best.prefixLength) {
      best = { pattern: mapping.pattern, prefixLength: prefix.length, candidate };
    }
  }

  return best === null ? null : { pattern: best.pattern, candidate: best.candidate };
}

function packageName(specifier: string): string {
  const segments = specifier.split("/");
  if (specifier.startsWith("@") && segments.length >= 2) {
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0];
}

function isBuiltin(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true;
  return NODE_BUILTINS.has(packageName(specifier));
}

/**
 * Turns one statement into an edge, or into a named reason why it is not one.
 * Nothing is guessed: a specifier either matches a file the walk saw or it is
 * reported.
 */
export function resolveImport(
  statement: ImportStatement,
  from: string,
  index: RepositoryIndex,
  hints: ResolutionHints,
): ImportOutcome {
  if (!statement.literal) {
    const isRequire = statement.kind === "require";
    return {
      status: "unresolved",
      reason: isRequire ? "non-literal-require" : "non-literal-dynamic-import",
      detail: `${isRequire ? "require argument" : "dynamic import argument"} is ${statement.argumentKind ?? "not a string literal"}`,
    };
  }

  const specifier = statement.specifier;
  if (specifier === "") {
    return {
      status: "unresolved",
      reason: "empty-specifier",
      detail: "the specifier is an empty string",
    };
  }

  if (isRelative(specifier)) {
    const candidate = joinRepositoryPath(posix.dirname(from), specifier);
    if (candidate.startsWith("..")) {
      return {
        status: "external",
        reason: "outside-repository",
        detail: `${specifier} climbs outside the repository`,
      };
    }
    const outcome = matchCandidates(candidate, index);
    if (outcome !== null) return outcome;
    return {
      status: "unresolved",
      reason: "file-not-found",
      detail: `no file matches ${specifier} (tried ${triedPaths(candidate)})`,
    };
  }

  if (specifier.startsWith("/")) {
    const candidate = posix.normalize(specifier).slice(1);
    const outcome = matchCandidates(candidate, index);
    if (outcome !== null) return outcome;
    return {
      status: "unresolved",
      reason: "file-not-found",
      detail: `no file matches ${specifier} (tried ${triedPaths(candidate)})`,
    };
  }

  const mapped = applyPathMappings(specifier, hints.pathMappings);
  if (mapped !== null) {
    if (mapped.candidate.startsWith("..")) {
      return {
        status: "external",
        reason: "outside-repository",
        detail: `${specifier} matches ${mapped.pattern}, which points outside the repository`,
      };
    }
    const outcome = matchCandidates(mapped.candidate, index);
    if (outcome !== null) return outcome;
    return {
      status: "unresolved",
      reason: "alias-target-not-found",
      detail: `matches ${mapped.pattern} → ${mapped.candidate}, and no file matches that`,
    };
  }

  if (hints.baseUrl !== null) {
    const candidate = joinRepositoryPath(hints.baseUrl, specifier);
    const outcome = matchCandidates(candidate, index);
    if (outcome !== null) return outcome;
  }

  if (isBuiltin(specifier)) {
    return {
      status: "external",
      reason: "node-builtin",
      detail: `Node built-in: ${specifier}`,
    };
  }

  return {
    status: "external",
    reason: "package",
    detail: `package: ${packageName(specifier)}`,
  };
}

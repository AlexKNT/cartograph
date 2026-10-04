import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { extensionOf, folderOf, hasSourceExtension, moduleOf } from "./paths.ts";
import type {
  DirectorySkipReason,
  SkippedDirectory,
  SkippedFile,
} from "./types.ts";

/** A file above this is skipped rather than parsed. There is no progress bar here. */
export const MAX_FILE_BYTES = 2_000_000;

/**
 * Directories that are not repository code. Each one is pruned whole and
 * counted, so nothing disappears from the totals.
 */
const IGNORED_DIRECTORIES: ReadonlyMap<
  string,
  { reason: DirectorySkipReason; detail: string }
> = new Map([
  [".git", { reason: "version-control", detail: "version control metadata" }],
  ["node_modules", { reason: "dependency", detail: "installed dependencies" }],
  [".next", { reason: "build-output", detail: "build output" }],
  [".nuxt", { reason: "build-output", detail: "build output" }],
  [".svelte-kit", { reason: "build-output", detail: "build output" }],
  ["dist", { reason: "build-output", detail: "build output" }],
  ["build", { reason: "build-output", detail: "build output" }],
  ["out", { reason: "build-output", detail: "build output" }],
  ["coverage", { reason: "build-output", detail: "build output" }],
]);

export interface WalkedFile {
  /** Repository-relative, POSIX separators. */
  path: string;
  absolutePath: string;
  name: string;
  extension: string;
  folder: string;
  module: string;
}

export interface WalkResult {
  files: WalkedFile[];
  skippedFiles: SkippedFile[];
  skippedDirectories: SkippedDirectory[];
}

/** Everything the walk knows about one path, so a file can be described twice the same way. */
export function describeFile(
  relativePath: string,
  absolutePath: string,
): WalkedFile {
  return {
    path: relativePath,
    absolutePath,
    name: relativePath.slice(relativePath.lastIndexOf("/") + 1),
    extension: extensionOf(relativePath),
    folder: folderOf(relativePath),
    module: moduleOf(relativePath),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Every entry below a directory, counted without following symlinks. */
function countFiles(directory: string): number {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return 0;
  }

  let total = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) total += countFiles(join(directory, entry.name));
    else total += 1;
  }
  return total;
}

function visit(directory: string, relative: string, result: WalkResult): void {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    result.skippedDirectories.push({
      path: relative === "" ? "." : relative,
      reason: "unreadable",
      detail: errorMessage(error),
      files: 0,
    });
    return;
  }

  // Sorted so two runs over the same directory produce the same order.
  entries.sort((left, right) => (left.name < right.name ? -1 : 1));

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    const relativePath = relative === "" ? entry.name : `${relative}/${entry.name}`;

    if (entry.isSymbolicLink()) {
      // Following links invites cycles and duplicate paths for one file.
      let target: ReturnType<typeof statSync> | undefined;
      try {
        target = statSync(absolutePath);
      } catch {
        target = undefined;
      }
      if (target?.isDirectory()) {
        result.skippedDirectories.push({
          path: relativePath,
          reason: "symlink",
          detail: "symbolic link",
          files: countFiles(absolutePath),
        });
      } else {
        result.skippedFiles.push({
          path: relativePath,
          reason: "symlink",
          detail: "symbolic link",
        });
      }
      continue;
    }

    if (entry.isDirectory()) {
      const ignored = IGNORED_DIRECTORIES.get(entry.name);
      if (ignored !== undefined) {
        result.skippedDirectories.push({
          path: relativePath,
          reason: ignored.reason,
          detail: ignored.detail,
          files: countFiles(absolutePath),
        });
        continue;
      }
      visit(absolutePath, relativePath, result);
      continue;
    }

    if (!entry.isFile()) {
      result.skippedFiles.push({
        path: relativePath,
        reason: "unreadable",
        detail: "not a regular file",
      });
      continue;
    }

    if (!hasSourceExtension(relativePath)) {
      result.skippedFiles.push({
        path: relativePath,
        reason: "unsupported-extension",
        detail: `not TypeScript or JavaScript: ${extensionOf(relativePath) || "no extension"}`,
      });
      continue;
    }

    let bytes: number;
    try {
      bytes = statSync(absolutePath).size;
    } catch (error) {
      result.skippedFiles.push({
        path: relativePath,
        reason: "unreadable",
        detail: errorMessage(error),
      });
      continue;
    }

    if (bytes > MAX_FILE_BYTES) {
      result.skippedFiles.push({
        path: relativePath,
        reason: "too-large",
        detail: `${bytes} bytes`,
      });
      continue;
    }

    result.files.push(describeFile(relativePath, absolutePath));
  }
}

/** Path in, files out. Nothing here reads a file's contents. */
export function walkRepository(root: string): WalkResult {
  const result: WalkResult = {
    files: [],
    skippedFiles: [],
    skippedDirectories: [],
  };
  visit(root, "", result);
  return result;
}

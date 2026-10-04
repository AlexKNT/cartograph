/**
 * Which category a file falls into, read off its path and name alone. The
 * parser reports where a file is, never what it is, so nothing here may look
 * at a framework or at the file's contents: a `.d.ts` is a declaration
 * wherever it lives, and a `__tests__` directory is tests whoever wrote it.
 */

import type { ParsedFile } from "../parser/types.ts";
import { fileName } from "./paths.ts";
import type { CategoryTotal, FileCategory } from "./types.ts";

/** Fixed order, so the map is the same picture every time it is built. */
export const CATEGORIES: readonly FileCategory[] = [
  "source",
  "test",
  "barrel",
  "declaration",
];

const DECLARATION = /\.d\.ts$/;
const BARREL = /^index\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST_NAME = /\.(test|spec)\./;
const TEST_FOLDER = /(^|\/)(__tests__|__mocks__|tests?)\//;

export function categoryOf(path: string): FileCategory {
  const name = fileName(path);

  if (DECLARATION.test(name)) return "declaration";
  if (TEST_NAME.test(name) || TEST_FOLDER.test(path)) return "test";
  if (BARREL.test(name)) return "barrel";
  return "source";
}

/** Files per category for a plain list of paths, in the fixed order. */
export function countPaths(paths: readonly string[]): CategoryTotal[] {
  const counts = new Map<FileCategory, number>();
  for (const path of paths) {
    const category = categoryOf(path);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return CATEGORIES.filter((category) => counts.has(category)).map((category) => ({
    category,
    count: counts.get(category) ?? 0,
  }));
}

/** Files per category, in the fixed order. Empty categories are left out. */
export function countCategories(files: readonly ParsedFile[]): CategoryTotal[] {
  return countPaths(files.map((file) => file.path));
}

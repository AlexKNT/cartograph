/**
 * Which category a file falls into, read off its path and name alone. The
 * parser reports where a file is, never what it is, so nothing here may look
 * at a framework or at the file's contents: a `.d.ts` is a declaration
 * wherever it lives, and a `__tests__` directory is tests whoever wrote it.
 */

import { fileName } from "./paths.ts";
import type { FileCategory } from "./types.ts";

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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EXPRESS_ADAPTER } from "./express.ts";
import { FALLBACK_ADAPTER, type RepositoryAdapter } from "./index.ts";
import { NEST_ADAPTER } from "./nestjs.ts";
import { NEXT_ADAPTER } from "./nextjs.ts";
import { REACT_ADAPTER } from "./react.ts";

/**
 * Which adapter a repository gets. Detection runs in one fixed order and the
 * first match wins, so a repository that mentions two frameworks is always read
 * the same way. Framework knowledge stops here: the parser core hands over a
 * path and a file list and is told which adapter to use.
 */

const NEXT_CONFIG = /^next\.config\.(js|mjs|cjs|ts|mts)$/;

function readDependencies(root: string): ReadonlySet<string> {
  let text: string;
  try {
    text = readFileSync(resolve(root, "package.json"), "utf8");
  } catch {
    return new Set();
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch {
    return new Set();
  }

  if (typeof manifest !== "object" || manifest === null) return new Set();
  const record = manifest as Record<string, unknown>;
  const names = new Set<string>();

  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const value = record[field];
    if (typeof value !== "object" || value === null) continue;
    for (const name of Object.keys(value)) names.add(name);
  }

  return names;
}

/** The adapter a repository matches, or the fallback when nothing does. */
export function detectAdapter(
  root: string,
  paths: readonly string[],
): RepositoryAdapter {
  const dependencies = readDependencies(root);
  const files = paths.map((path) => path.slice(path.lastIndexOf("/") + 1));

  if (dependencies.has("next") || files.some((name) => NEXT_CONFIG.test(name))) {
    return NEXT_ADAPTER;
  }

  if (
    dependencies.has("@nestjs/core") ||
    dependencies.has("@nestjs/common") ||
    paths.includes("nest-cli.json")
  ) {
    return NEST_ADAPTER;
  }

  if (dependencies.has("react") || paths.some((path) => /\.(tsx|jsx)$/.test(path))) {
    return REACT_ADAPTER;
  }

  // Checked last, so a repository that already matched an adapter keeps the one
  // it had: a full-stack repository with React in it stays a React repository.
  if (dependencies.has("express")) return EXPRESS_ADAPTER;

  return FALLBACK_ADAPTER;
}

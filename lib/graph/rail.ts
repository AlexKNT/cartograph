/**
 * The rail's taxonomy, apart from the adapters that produce the roles.
 *
 * A browser component needs the category names and their order and must not pull
 * a parser and a filesystem library into its bundle, so the names live here and
 * the adapters only ever hand back a role id. Rail order is reading order —
 * routable surfaces first, then the layers behind them, then plumbing — and it
 * is fixed, so the same repository always presents its categories in the same
 * places.
 */

import type { ParsedFile } from "../parser/types.ts";
import { categoryOf } from "./categories.ts";
import type { CategoryIndex, CategoryTotal, RailEntry } from "./types.ts";

/** The generic rail: the file kinds, for a repository no adapter matched. */
const GENERIC_RAIL: readonly RailEntry[] = [
  { id: "source", label: "source", swatch: "source" },
  { id: "test", label: "test", swatch: "test" },
  { id: "barrel", label: "barrel", swatch: "barrel" },
  { id: "declaration", label: "declaration", swatch: "declaration" },
];

/** One rail per framework, keyed by the adapter's name. */
const FRAMEWORK_RAILS: Readonly<Record<string, readonly RailEntry[]>> = {
  nextjs: [
    { id: "page-route", label: "Page routes", swatch: "source" },
    { id: "api-endpoint", label: "API endpoints", swatch: "barrel" },
    { id: "server-action", label: "Server actions", swatch: "test" },
  ],
  nestjs: [
    { id: "controller", label: "Controllers", swatch: "source" },
    { id: "service", label: "Services", swatch: "barrel" },
    { id: "module", label: "Modules", swatch: "declaration" },
    { id: "entity", label: "Entities", swatch: "test" },
  ],
  react: [
    { id: "component", label: "Components", swatch: "source" },
    { id: "hook", label: "Hooks", swatch: "barrel" },
  ],
};

/** The rail a framework presents, or the generic one when nothing matched. */
export function railFor(framework: string): readonly RailEntry[] {
  return FRAMEWORK_RAILS[framework] ?? GENERIC_RAIL;
}

/**
 * Which rail entry each file belongs to. On a framework rail a file with no
 * stored role belongs to no entry, so it draws no colour; on the generic rail
 * every file is a kind, and the kinds are the entries.
 */
export function categoryIndex(
  framework: string,
  files: readonly ParsedFile[],
  roles: ReadonlyMap<string, string>,
): CategoryIndex {
  const rail = FRAMEWORK_RAILS[framework];
  const index = new Map<string, RailEntry>();

  if (rail === undefined) {
    const byId = new Map(GENERIC_RAIL.map((entry) => [entry.id, entry]));
    for (const file of files) {
      const entry = byId.get(categoryOf(file.path));
      if (entry !== undefined) index.set(file.path, entry);
    }
    return index;
  }

  const byId = new Map(rail.map((entry) => [entry.id, entry]));
  for (const file of files) {
    const role = roles.get(file.path);
    if (role === undefined) continue;
    const entry = byId.get(role);
    if (entry !== undefined) index.set(file.path, entry);
  }
  return index;
}

/** Counts over a set of paths, in the rail's fixed order. Empty entries are
 *  left out, so a folder does not list a kind it does not hold. */
export function countsFor(
  paths: Iterable<string>,
  rail: readonly RailEntry[],
  index: CategoryIndex,
): CategoryTotal[] {
  const counts = new Map<string, number>();
  for (const path of paths) {
    const entry = index.get(path);
    if (entry === undefined) continue;
    counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
  }

  return rail
    .filter((entry) => counts.has(entry.id))
    .map((entry) => ({ ...entry, count: counts.get(entry.id) ?? 0 }));
}

/**
 * The rail itself: the framework's whole taxonomy in reading order, a category
 * counted at zero rather than dropped. The rail is the legend for the colours
 * the rows wear, so it stays the same shape whatever the repository holds.
 */
export function railCounts(
  rail: readonly RailEntry[],
  index: CategoryIndex,
): CategoryTotal[] {
  const counts = new Map<string, number>();
  for (const entry of index.values()) {
    counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
  }

  return rail.map((entry) => ({ ...entry, count: counts.get(entry.id) ?? 0 }));
}

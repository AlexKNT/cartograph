/**
 * Blast radius and dependency chain are one walk read in two directions.
 *
 * "What breaks if this changes" follows the edges backwards; "what does this
 * need" follows them forwards. Everything else is identical, so it is written
 * once with a direction argument. The walk is iterative and keeps a visited
 * set from the first step, so a cycle in the repository ends the walk rather
 * than looping it.
 */

import type { ImportEdge } from "../parser/types.ts";
import { categoryOf } from "./categories.ts";
import type { FileCategory } from "./types.ts";

export type WalkDirection = "in" | "out";

/** Two levels deep by default. Deeper returns most of a real repository. */
export const WALK_DEPTH = 2;

export interface WalkedFile {
  path: string;
  category: FileCategory;
  /** 1 for a direct neighbour, 2 for a neighbour's neighbour. */
  depth: number;
}

/** Every file reachable from `path` within `depth` steps, nearest first and
 *  then in path order. The file itself is never in the answer. */
export function transitiveWalk(
  path: string,
  edges: readonly ImportEdge[],
  direction: WalkDirection,
  depth: number = WALK_DEPTH,
): WalkedFile[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    const from = direction === "out" ? edge.from : edge.to;
    const to = direction === "out" ? edge.to : edge.from;
    const neighbours = adjacency.get(from);
    if (neighbours === undefined) adjacency.set(from, [to]);
    else if (!neighbours.includes(to)) neighbours.push(to);
  }

  const visited = new Set<string>([path]);
  const found: WalkedFile[] = [];
  let frontier = [path];

  for (let step = 1; step <= depth; step += 1) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const neighbour of adjacency.get(current) ?? []) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        next.push(neighbour);
        found.push({ path: neighbour, category: categoryOf(neighbour), depth: step });
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  return found.sort((left, right) =>
    left.depth === right.depth
      ? left.path < right.path
        ? -1
        : 1
      : left.depth - right.depth,
  );
}

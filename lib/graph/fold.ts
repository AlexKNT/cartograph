/**
 * The folding rule, and it is the rule the whole map rests on.
 *
 * Every directory in the repository starts as its own node. Working from the
 * deepest directory upward, a directory holding fewer files than the threshold
 * merges into its parent. If that leaves more nodes than anyone can read, the
 * threshold rises and the pass runs again from scratch, stopping at the lowest
 * one that lands under the target. Nothing about the depth is chosen in
 * advance: the repository's own shape decides it.
 */

import type { ImportEdge, ParsedFile } from "../parser/types.ts";

/** Under this many nodes the map is readable. */
export const FOLD_TARGET_NODES = 24;

/** Two is the floor, which is what makes a single file on the canvas impossible. */
export const FOLD_MIN_THRESHOLD = 2;

export interface FoldedNode {
  /** The directory's path; unique, so it is the node's identity everywhere. */
  id: string;
  /** The files it holds, repository-relative and in path order. */
  files: string[];
  fanIn: number;
  fanOut: number;
}

/** One directory-to-directory connection, after duplicates are removed. */
export interface FoldedEdge {
  from: string;
  to: string;
}

export interface Folded {
  /** The lowest threshold that landed under the target. */
  threshold: number;
  fileCount: number;
  nodes: FoldedNode[];
  edges: FoldedEdge[];
}

interface Directory {
  path: string;
  parent: string | null;
  depth: number;
  /** The files sitting directly in it, before any merging. */
  own: string[];
}

function parentOf(path: string): string | null {
  if (path === ".") return null;
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "." : path.slice(0, slash);
}

/** Every directory holding a file, plus every directory above it. */
function directoriesOf(files: readonly ParsedFile[]): Directory[] {
  const byPath = new Map<string, Directory>();

  const add = (path: string): Directory => {
    const existing = byPath.get(path);
    if (existing !== undefined) return existing;

    const parent = parentOf(path);
    const directory: Directory = {
      path,
      parent,
      depth: path === "." ? 0 : path.split("/").length,
      own: [],
    };
    byPath.set(path, directory);
    if (parent !== null) add(parent);
    return directory;
  };

  for (const file of files) add(file.folder).own.push(file.path);
  return [...byPath.values()];
}

function heldIn(held: ReadonlyMap<string, string[]>, path: string): string[] {
  const files = held.get(path);
  if (files === undefined) {
    throw new Error(`folded a directory that was never walked: ${path}`);
  }
  return files;
}

/**
 * One pass at one threshold. Deeper directories are decided first, so a
 * directory that has already swallowed its children is weighed with their
 * files in it. Every directory at the same depth is decided against the same
 * state, so no merge at that depth can move another one's answer.
 */
function holdAt(
  directories: readonly Directory[],
  threshold: number,
): Map<string, string[]> {
  const held = new Map<string, string[]>();
  let deepest = 0;
  for (const directory of directories) {
    held.set(directory.path, [...directory.own]);
    if (directory.depth > deepest) deepest = directory.depth;
  }

  const byDepth = new Map<number, Directory[]>();
  for (const directory of directories) {
    const level = byDepth.get(directory.depth);
    if (level === undefined) byDepth.set(directory.depth, [directory]);
    else level.push(directory);
  }

  for (let depth = deepest; depth >= 0; depth -= 1) {
    const level = [...(byDepth.get(depth) ?? [])].sort((left, right) =>
      left.path < right.path ? -1 : 1,
    );

    for (const directory of level) {
      // The root has nowhere to go, so it is never merged away.
      if (directory.parent === null) continue;

      const files = heldIn(held, directory.path);
      if (files.length >= threshold) continue;

      heldIn(held, directory.parent).push(...files);
      held.set(directory.path, []);
    }
  }

  return held;
}

function survivors(
  directories: readonly Directory[],
  held: ReadonlyMap<string, string[]>,
): string[] {
  return directories
    .filter((directory) => heldIn(held, directory.path).length > 0)
    .map((directory) => directory.path);
}

export function foldFiles(
  files: readonly ParsedFile[],
  edges: readonly ImportEdge[],
  target: number = FOLD_TARGET_NODES,
): Folded {
  const directories = directoriesOf(files);

  // The bound is reached when everything has merged into the root, so this
  // always terminates with a map small enough to read.
  const limit = files.length + FOLD_MIN_THRESHOLD;
  let threshold = FOLD_MIN_THRESHOLD;
  let held = holdAt(directories, threshold);
  while (survivors(directories, held).length > target && threshold < limit) {
    threshold += 1;
    held = holdAt(directories, threshold);
  }

  const nodes: FoldedNode[] = directories
    .map((directory) => ({
      id: directory.path,
      files: [...heldIn(held, directory.path)].sort((left, right) =>
        left < right ? -1 : 1,
      ),
      fanIn: 0,
      fanOut: 0,
    }))
    .filter((node) => node.files.length > 0)
    .sort((left, right) => (left.id < right.id ? -1 : 1));

  const owner = new Map<string, string>();
  for (const node of nodes) {
    for (const file of node.files) owner.set(file, node.id);
  }

  const pairs = new Map<string, FoldedEdge>();
  for (const edge of edges) {
    const from = owner.get(edge.from);
    const to = owner.get(edge.to);
    // A connection inside one node is not a connection on the canvas.
    if (from === undefined || to === undefined || from === to) continue;
    pairs.set(`${from}\u0000${to}`, { from, to });
  }

  const foldedEdges = [...pairs.values()].sort((left, right) =>
    left.from === right.from
      ? left.to < right.to
        ? -1
        : 1
      : left.from < right.from
        ? -1
        : 1,
  );

  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of foldedEdges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (from !== undefined) from.fanOut += 1;
    if (to !== undefined) to.fanIn += 1;
  }

  return {
    threshold,
    fileCount: files.length,
    nodes,
    edges: foldedEdges,
  };
}

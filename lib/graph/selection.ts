/**
 * Selecting something keeps it, its edges, and whatever those edges connect
 * to at full strength, and dims everything else. Nothing else changes: the
 * picture is the same picture, just read with one thing in focus.
 */

import type { ImportEdge } from "../parser/types.ts";
import { categoryOf } from "./categories.ts";
import type { FoldedNode } from "./fold.ts";
import type { Direction, FileCategory, Selection, Strength } from "./types.ts";

export interface Emphasis {
  nodeStrength(id: string): Strength;
  rowStrength(path: string): Strength;
  edgeOf(fromFile: string, toFile: string): { strength: Strength; direction: Direction };
}

const EVERYTHING: Emphasis = {
  nodeStrength: () => "full",
  rowStrength: () => "full",
  edgeOf: () => ({ strength: "full", direction: "none" }),
};

/** Two reasons to dim something, and one rule: dim wins. A node kept by the
 *  selection is still dimmed by the rail when it holds no file of the kind the
 *  rail is narrowing to. */
export function dimmer(left: Strength, right: Strength | undefined): Strength {
  return left === "dim" || right === "dim" ? "dim" : "full";
}

/**
 * The rail's category is a second reason to dim, on the same terms as a
 * selection: a file of the kind stays full and everything else dims. An edge
 * is only full when both of its ends are the kind, because an edge that leaves
 * the category is not in it.
 */
export function emphasiseCategory(
  category: FileCategory,
  nodes: readonly FoldedNode[],
): Emphasis {
  const inNodes = new Set<string>();
  for (const node of nodes) {
    if (node.files.some((file) => categoryOf(file) === category)) inNodes.add(node.id);
  }

  const isMatch = (path: string): boolean => categoryOf(path) === category;

  return {
    nodeStrength: (id) => (inNodes.has(id) ? "full" : "dim"),
    rowStrength: (path) => (isMatch(path) ? "full" : "dim"),
    edgeOf: (fromFile, toFile) => ({
      strength: isMatch(fromFile) && isMatch(toFile) ? "full" : "dim",
      direction: "none",
    }),
  };
}

export function emphasise(
  selection: Selection | null,
  nodes: readonly FoldedNode[],
  fileEdges: readonly ImportEdge[],
  ownerOf: ReadonlyMap<string, string>,
): Emphasis {
  if (selection === null) return EVERYTHING;

  const fullNodes = new Set<string>();
  const fullFiles = new Set<string>();
  let touches: (fromFile: string, toFile: string) => boolean;
  let directionOf: (fromFile: string, toFile: string) => Direction;

  if (selection.kind === "node") {
    fullNodes.add(selection.node);
    for (const edge of fileEdges) {
      const from = ownerOf.get(edge.from);
      const to = ownerOf.get(edge.to);
      if (from === selection.node && to !== undefined) fullNodes.add(to);
      if (to === selection.node && from !== undefined) fullNodes.add(from);
    }

    // Whatever is kept is kept whole, so every row inside a kept node stays up.
    for (const node of nodes) {
      if (!fullNodes.has(node.id)) continue;
      for (const file of node.files) fullFiles.add(file);
    }

    touches = (fromFile, toFile) =>
      ownerOf.get(fromFile) === selection.node || ownerOf.get(toFile) === selection.node;
    directionOf = (fromFile, toFile) => {
      if (ownerOf.get(toFile) === selection.node) return "in";
      if (ownerOf.get(fromFile) === selection.node) return "out";
      return "none";
    };
  } else {
    fullFiles.add(selection.path);
    const home = ownerOf.get(selection.path);
    if (home !== undefined) fullNodes.add(home);

    for (const edge of fileEdges) {
      if (edge.from !== selection.path && edge.to !== selection.path) continue;
      fullFiles.add(edge.from === selection.path ? edge.to : edge.from);
      const other = ownerOf.get(edge.from === selection.path ? edge.to : edge.from);
      if (other !== undefined) fullNodes.add(other);
    }

    touches = (fromFile, toFile) =>
      fromFile === selection.path || toFile === selection.path;
    directionOf = (fromFile, toFile) => {
      if (toFile === selection.path) return "in";
      if (fromFile === selection.path) return "out";
      return "none";
    };
  }

  return {
    nodeStrength: (id) => (fullNodes.has(id) ? "full" : "dim"),
    rowStrength: (path) => (fullFiles.has(path) ? "full" : "dim"),
    edgeOf: (fromFile, toFile) => ({
      strength: touches(fromFile, toFile) ? "full" : "dim",
      direction: touches(fromFile, toFile) ? directionOf(fromFile, toFile) : "none",
    }),
  };
}

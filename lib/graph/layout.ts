/**
 * Where every node goes, and how big it is.
 *
 * Width comes from the label, never from how much depends on the node, so a
 * long name doesn't read as an important file. Height is the dependency count:
 * what leans on a node is what the eye should catch. Dagre does the placement,
 * and it is a pure function of the sizes and the edge list, so the same data
 * draws the same picture every time.
 */

import { Graph, layout } from "@dagrejs/dagre";
import type { FoldedEdge } from "./fold.ts";

export const ROW_HEIGHT = 18;

export const PANEL_HEADER_HEIGHT = 28;

/** Past this the panel stops growing and says how many more there are. */
export const MAX_PANEL_ROWS = 12;

// Labels are monospace at 11px, so a character is a fixed 0.6em wide and the
// box can be computed rather than measured.
const CHARACTER_WIDTH = 6.6;
const LABEL_PADDING = 10;

const NODE_MIN_WIDTH = 72;
const NODE_MAX_WIDTH = 240;
const NODE_HEIGHT = 26;
const NODE_HEIGHT_STEP = 6;

/** Fan-in at or above which the node's height steps up. Dependents are
 * long-tailed, so the steps are geometric: the difference between 1 and 3
 * matters, the difference between 31 and 33 does not. */
const DEPENDENT_STEPS: readonly number[] = [1, 3, 7, 15];

const PANEL_MIN_WIDTH = 176;
const PANEL_MAX_WIDTH = 320;
const PANEL_PADDING = 6;

const GAP_BETWEEN_RANKS = 88;
const GAP_BETWEEN_NODES = 26;

export interface Box {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

interface DagreNode {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

/** Dagre writes the routed points back onto the edge's label. */
interface DagreEdge {
  points?: { x: number; y: number }[];
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function textWidth(text: string): number {
  return Math.ceil(text.length * CHARACTER_WIDTH);
}

/** The node's height carries how many things depend on it, and nothing else. */
export function nodeHeight(fanIn: number): number {
  const tier = DEPENDENT_STEPS.filter((step) => fanIn >= step).length;
  return NODE_HEIGHT + tier * NODE_HEIGHT_STEP;
}

export function foldedBox(label: string, fanIn: number): Box {
  return {
    width: clamp(textWidth(label) + LABEL_PADDING * 2, NODE_MIN_WIDTH, NODE_MAX_WIDTH),
    height: nodeHeight(fanIn),
  };
}

export function panelBox(label: string, rowNames: readonly string[], hidden: number): Box {
  const widest = rowNames.reduce((max, name) => Math.max(max, textWidth(name)), textWidth(label));
  return {
    width: clamp(widest + LABEL_PADDING * 2 + ROW_HEIGHT, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH),
    height:
      PANEL_HEADER_HEIGHT +
      rowNames.length * ROW_HEIGHT +
      (hidden > 0 ? ROW_HEIGHT : 0) +
      PANEL_PADDING,
  };
}

/**
 * Left to right, because an import points the way it is read. Nodes and edges
 * are inserted in sorted order: dagre breaks ties by insertion order, so
 * without that the same data could come back tilted.
 */
export function placeNodes(
  boxes: ReadonlyMap<string, Box>,
  edges: readonly FoldedEdge[],
): Map<string, Point> {
  const graph = new Graph<Record<string, unknown>, DagreNode, DagreEdge>();
  graph.setGraph({ rankdir: "LR", ranksep: GAP_BETWEEN_RANKS, nodesep: GAP_BETWEEN_NODES });
  graph.setDefaultEdgeLabel(() => ({}));

  const ids = [...boxes.keys()].sort((left, right) => (left < right ? -1 : 1));
  for (const id of ids) {
    const box = boxes.get(id);
    if (box !== undefined) graph.setNode(id, { width: box.width, height: box.height });
  }
  for (const edge of edges) graph.setEdge(edge.from, edge.to);

  layout(graph);

  const points = new Map<string, Point>();
  for (const id of ids) {
    const box = boxes.get(id);
    const placed: DagreNode | undefined = graph.node(id);
    // Dagre hands back centres; React Flow positions from the top left.
    if (box === undefined || placed?.x === undefined || placed.y === undefined) continue;
    points.set(id, {
      x: Math.round(placed.x - box.width / 2),
      y: Math.round(placed.y - box.height / 2),
    });
  }

  return points;
}

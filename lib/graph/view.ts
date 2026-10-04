/**
 * The whole canvas, built from the parser's output and the two things the
 * state adds: what is open and what is selected. Pure, so a plain script can
 * build the same map the browser draws and count it.
 */

import type { ImportEdge } from "../parser/types.ts";
import { categoryOf } from "./categories.ts";
import type { Folded } from "./fold.ts";
import { MAX_PANEL_ROWS, foldedBox, panelBox, placeNodes, type Box } from "./layout.ts";
import { uniqueLabels } from "./labels.ts";
import { fileName } from "./paths.ts";
import { emphasise } from "./selection.ts";
import type { Canvas, CanvasEdge, CanvasNode, CanvasState } from "./types.ts";

/** The handle a row's edge attaches to. Open panels connect at the row. */
export function rowHandle(path: string): string {
  return `file:${path}`;
}

export function buildCanvas(
  fold: Folded,
  fileEdges: readonly ImportEdge[],
  state: CanvasState,
): Canvas {
  const labels = uniqueLabels(fold.nodes.map((node) => node.id));

  const ownerOf = new Map<string, string>();
  for (const node of fold.nodes) {
    for (const file of node.files) ownerOf.set(file, node.id);
  }

  const emphasis = emphasise(state.selected, fold.nodes, fileEdges, ownerOf);

  // A panel shows what fits and says how many more, rather than growing until
  // it is taller than the thing it is a map of. Rows are in path order, which
  // is a decision the data makes rather than one the canvas makes.
  const boxes = new Map<string, Box>();
  const shownRows = new Map<string, string[]>();
  for (const node of fold.nodes) {
    const label = labels.get(node.id) ?? node.id;
    const expanded = state.open.has(node.id);
    const rows = expanded ? node.files.slice(0, MAX_PANEL_ROWS) : [];
    shownRows.set(node.id, rows);
    boxes.set(
      node.id,
      expanded
        ? panelBox(label, rows.map(fileName), node.files.length - rows.length)
        : foldedBox(label, node.fanIn),
    );
  }

  const points = placeNodes(boxes, fold.edges);

  const nodes: CanvasNode[] = fold.nodes.map((node) => {
    const label = labels.get(node.id) ?? node.id;
    const box = boxes.get(node.id) ?? { width: 0, height: 0 };
    const point = points.get(node.id) ?? { x: 0, y: 0 };
    const rows = shownRows.get(node.id) ?? [];

    return {
      id: node.id,
      label,
      fileCount: node.files.length,
      fanIn: node.fanIn,
      fanOut: node.fanOut,
      expanded: state.open.has(node.id),
      rows: rows.map((path) => ({
        path,
        name: fileName(path),
        category: categoryOf(path),
        strength: emphasis.rowStrength(path),
      })),
      hiddenRows: node.files.length - rows.length,
      strength: emphasis.nodeStrength(node.id),
      width: box.width,
      height: box.height,
      x: point.x,
      y: point.y,
    };
  });

  const drawnRows = new Set<string>();
  for (const [id, rows] of shownRows) {
    for (const path of rows) drawnRows.add(`${id}\u0000${path}`);
  }

  // One edge per pair of rows that are actually on screen. Where a panel is
  // open the edge lands on the row; where it is folded it lands on the box.
  const edges: CanvasEdge[] = [];
  const drawn = new Set<string>();
  for (const edge of fileEdges) {
    const source = ownerOf.get(edge.from);
    const target = ownerOf.get(edge.to);
    if (source === undefined || target === undefined || source === target) continue;

    const sourceHandle = drawnRows.has(`${source}\u0000${edge.from}`)
      ? rowHandle(edge.from)
      : undefined;
    const targetHandle = drawnRows.has(`${target}\u0000${edge.to}`)
      ? rowHandle(edge.to)
      : undefined;

    const key = `${source}\u0000${sourceHandle ?? ""}\u0000${target}\u0000${targetHandle ?? ""}`;
    if (drawn.has(key)) continue;
    drawn.add(key);

    const { strength, direction } = emphasis.edgeOf(edge.from, edge.to);
    edges.push({
      id: `${edge.from} -> ${edge.to}`,
      source,
      target,
      sourceHandle,
      targetHandle,
      strength,
      direction,
    });
  }

  return { nodes, edges };
}

"use client";

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { Folded } from "@/lib/graph/fold";
import type { CategoryIndex, Hover, RailEntry, Selection } from "@/lib/graph/types";
import { buildCanvas } from "@/lib/graph/view";
import type { ImportEdge } from "@/lib/parser/types";
import { DependencyEdge, type DependencyFlowEdge } from "./dependency-edge";
import { FolderNode, type FolderNodeData } from "./folder-node";

// Both objects are module constants: React Flow re-renders every node when the
// type map is a new object, and this one never needs to be.
const nodeTypes: NodeTypes = { folder: FolderNode };
const edgeTypes: EdgeTypes = { dependency: DependencyEdge };

export const FIT_PADDING = 0.1;

/** React Flow's ceiling, and the cap on what a refit is allowed to do. */
export const MAX_ZOOM = 2;

export interface CanvasProps {
  fold: Folded;
  edges: readonly ImportEdge[];
  open: ReadonlySet<string>;
  selected: Selection | null;
  /** Which rail entry each file belongs to, so the filter has a predicate. */
  categories: CategoryIndex;
  /** The rail entry being narrowed to; null when every file is at full strength. */
  category: string | null;
  /** The active rail entry itself, so a node's match count can wear its colour. */
  activeRail: RailEntry | null;
  /** The file the pointer is on, from the pane or from the canvas. */
  hoveredFile: string | null;
  /** The node holding whatever is hovered, so a folded node lights up too. */
  hoveredNode: string | null;
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
  onSelect: (selection: Selection | null) => void;
  onHover: (hover: Hover | null) => void;
}

/**
 * The canvas is a view: what is open, what is selected and what is hovered all
 * arrive as props, because the detail pane reads the same three.
 */
export function DependencyCanvas({
  fold,
  edges,
  open,
  selected,
  categories,
  category,
  activeRail,
  hoveredFile,
  hoveredNode,
  onOpen,
  onClose,
  onSelect,
  onHover,
}: CanvasProps) {
  // Layout follows opening and selecting only. A hover changes emphasis, never
  // where anything is, so it must not re-run dagre underneath the pointer.
  const canvas = useMemo(
    () => buildCanvas(fold, edges, { open, selected, categories, category }),
    [fold, edges, open, selected, categories, category],
  );

  const nodes = useMemo<Node[]>(
    () =>
      canvas.nodes.map((node) => ({
        id: node.id,
        type: "folder",
        position: { x: node.x, y: node.y },
        width: node.width,
        height: node.height,
        draggable: false,
        selectable: false,
        data: {
          node,
          selected,
          activeRail,
          hoveredFile,
          hoveredHere: hoveredNode === node.id,
          onOpen,
          onClose,
          onSelectNode: (id: string) => onSelect({ kind: "node", node: id }),
          onSelectFile: (path: string) => onSelect({ kind: "file", path }),
          onHover,
        } satisfies FolderNodeData,
      })),
    [
      canvas.nodes,
      selected,
      activeRail,
      hoveredFile,
      hoveredNode,
      onOpen,
      onClose,
      onSelect,
      onHover,
    ],
  );

  const flowEdges = useMemo<DependencyFlowEdge[]>(
    () =>
      canvas.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: "dependency",
        data: { strength: edge.strength, direction: edge.direction },
      })),
    [canvas.edges],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      elementsSelectable={false}
      fitView
      fitViewOptions={{ padding: FIT_PADDING }}
      minZoom={0.4}
      maxZoom={MAX_ZOOM}
      onPaneClick={() => onSelect(null)}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--border)" />
    </ReactFlow>
  );
}

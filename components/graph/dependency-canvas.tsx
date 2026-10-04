"use client";

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Folded } from "@/lib/graph/fold";
import type { Selection } from "@/lib/graph/types";
import { buildCanvas } from "@/lib/graph/view";
import type { ImportEdge } from "@/lib/parser/types";
import { DependencyEdge, type DependencyFlowEdge } from "./dependency-edge";
import { FolderNode, type FolderNodeData } from "./folder-node";

// Both objects are module constants: React Flow re-renders every node when the
// type map is a new object, and this one never needs to be.
const nodeTypes: NodeTypes = { folder: FolderNode };
const edgeTypes: EdgeTypes = { dependency: DependencyEdge };

const FIT_PADDING = 0.1;

/** React Flow's ceiling, and the cap on what a refit is allowed to do. */
const MAX_ZOOM = 2;

interface CanvasProps {
  fold: Folded;
  edges: readonly ImportEdge[];
}

export function DependencyCanvas({ fold, edges }: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas fold={fold} edges={edges} />
    </ReactFlowProvider>
  );
}

function Canvas({ fold, edges }: CanvasProps) {
  const { fitView, getZoom } = useReactFlow();

  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [selected, setSelected] = useState<Selection | null>(null);

  /** The zoom a refit may not exceed. Null when nothing is waiting to be fitted. */
  const zoomCeiling = useRef<number | null>(null);

  const canvas = useMemo(
    () => buildCanvas(fold, edges, { open, selected }),
    [fold, edges, open, selected],
  );

  const openNode = useCallback(
    (id: string) => {
      // Read before the state changes: a refit must zoom out at most, and
      // fitting against the zoom it replaced is what keeps that true.
      zoomCeiling.current = Math.min(getZoom(), MAX_ZOOM);
      setOpen((current) => new Set(current).add(id));
      setSelected({ kind: "node", node: id });
    },
    [getZoom],
  );

  const closeNode = useCallback((id: string) => {
    setOpen((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const selectNode = useCallback((id: string) => {
    setSelected({ kind: "node", node: id });
  }, []);

  const selectFile = useCallback((id: string, path: string) => {
    setSelected({ kind: "file", node: id, path });
  }, []);

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
          onOpen: openNode,
          onClose: closeNode,
          onSelectNode: selectNode,
          onSelectFile: selectFile,
        } satisfies FolderNodeData,
      })),
    [canvas.nodes, selected, openNode, closeNode, selectNode, selectFile],
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

  useEffect(() => {
    const ceiling = zoomCeiling.current;
    if (ceiling === null) return;
    zoomCeiling.current = null;

    // A frame later, so the panel that just opened has a size to fit against.
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: FIT_PADDING, maxZoom: ceiling, duration: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, fitView]);

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
      onPaneClick={() => setSelected(null)}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--border)" />
    </ReactFlow>
  );
}

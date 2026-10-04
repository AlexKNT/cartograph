"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { CategorySwatch } from "@/components/category-swatch";
import { PANEL_HEADER_HEIGHT, ROW_HEIGHT } from "@/lib/graph/layout";
import type { CanvasNode, Selection } from "@/lib/graph/types";
import { rowHandle } from "@/lib/graph/view";

export interface FolderNodeData extends Record<string, unknown> {
  node: CanvasNode;
  selected: Selection | null;
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
  onSelectNode: (id: string) => void;
  onSelectFile: (id: string, path: string) => void;
}

export type FolderFlowNode = Node<FolderNodeData, "folder">;

// Handles are anchors rather than marks: the edge drawn from them is what
// shows the connection, so the dot React Flow draws would only add noise.
const ANCHOR = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  borderWidth: 0,
  background: "none",
} as const;

// React Flow turns pointer events off on a node with nothing to drag and
// nothing to select, which is every node here: dragging would break a layout
// that is meant to be the same picture every time. The canvas handles its own
// clicks, so it turns them back on for the box it draws.
const INTERACTIVE = "pointer-events-auto";

function dimmed(strength: CanvasNode["strength"]): string {
  return strength === "dim" ? "opacity-30" : "";
}

/** A folder, folded to a single node or opened into a panel of file rows. */
export function FolderNode({ data }: NodeProps<FolderFlowNode>) {
  const { node, selected, onOpen, onClose, onSelectNode, onSelectFile } = data;
  const selectedHere =
    (selected?.kind === "node" && selected.node === node.id) ||
    (selected?.kind === "file" && node.rows.some((row) => row.path === selected.path));

  if (!node.expanded) {
    return (
      <div
        onClick={() => onOpen(node.id)}
        title={node.id}
        style={{ width: node.width, height: node.height }}
        className={`${INTERACTIVE} flex cursor-pointer items-center justify-center rounded-[3px] border bg-surface px-2 ${
          selectedHere ? "border-accent" : "border-border"
        } ${dimmed(node.strength)}`}
      >
        <Handle type="target" position={Position.Left} style={ANCHOR} isConnectable={false} />
        <span className="truncate font-mono text-[11px]">{node.label}</span>
        <Handle type="source" position={Position.Right} style={ANCHOR} isConnectable={false} />
      </div>
    );
  }

  return (
    <div
      style={{ width: node.width, height: node.height }}
      className={`${INTERACTIVE} flex flex-col overflow-hidden rounded-[3px] border bg-surface ${
        selectedHere ? "border-accent" : "border-border"
      } ${dimmed(node.strength)}`}
    >
      <Handle type="target" position={Position.Left} style={ANCHOR} isConnectable={false} />
      <Handle type="source" position={Position.Right} style={ANCHOR} isConnectable={false} />

      <button
        type="button"
        onClick={() => onClose(node.id)}
        title={`close ${node.id}`}
        style={{ height: PANEL_HEADER_HEIGHT }}
        className="flex shrink-0 cursor-pointer items-center gap-2 border-b border-border px-2 text-left"
      >
        <span className="truncate font-mono text-[11px]">{node.label}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted">
          {node.fileCount} files
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted">
          in {node.fanIn} · out {node.fanOut}
        </span>
      </button>

      <div className="flex-1 overflow-hidden" onClick={() => onSelectNode(node.id)}>
        {node.rows.map((row) => {
          const rowSelected = selected?.kind === "file" && selected.path === row.path;
          return (
            <div
              key={row.path}
              onClick={(event) => {
                event.stopPropagation();
                onSelectFile(node.id, row.path);
              }}
              title={row.path}
              style={{ height: ROW_HEIGHT }}
              className={`relative flex cursor-pointer items-center gap-1.5 px-2 ${
                rowSelected ? "bg-accent/10 text-accent" : "hover:bg-background"
              } ${dimmed(row.strength)}`}
            >
              <Handle
                id={rowHandle(row.path)}
                type="target"
                position={Position.Left}
                style={ANCHOR}
                isConnectable={false}
              />
              <CategorySwatch category={row.category} />
              <span className="truncate font-mono text-[11px]">{row.name}</span>
              <Handle
                id={rowHandle(row.path)}
                type="source"
                position={Position.Right}
                style={ANCHOR}
                isConnectable={false}
              />
            </div>
          );
        })}

        {node.hiddenRows > 0 && (
          <div
            style={{ height: ROW_HEIGHT }}
            className="flex items-center px-2 font-mono text-[11px] text-muted"
          >
            {node.hiddenRows} more
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { Direction, Strength } from "@/lib/graph/types";

export interface DependencyEdgeData extends Record<string, unknown> {
  strength: Strength;
  direction: Direction;
}

export type DependencyFlowEdge = Edge<DependencyEdgeData, "dependency">;

/**
 * Direction is a colour and nothing else. An arrowhead would say the same
 * thing twice, and with nothing selected there is no direction to colour:
 * in and out only mean something relative to the file being looked at.
 */
function strokeOf(direction: Direction): string {
  if (direction === "in") return "var(--incoming)";
  if (direction === "out") return "var(--outgoing)";
  return "var(--muted)";
}

export function DependencyEdge(props: EdgeProps<DependencyFlowEdge>) {
  const [path] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });

  const strength = props.data?.strength ?? "full";
  const direction = props.data?.direction ?? "none";

  return (
    <BaseEdge
      id={props.id}
      path={path}
      style={{
        stroke: strokeOf(direction),
        strokeWidth: strength === "dim" ? 1 : 1.4,
        opacity: strength === "dim" ? 0.15 : 1,
      }}
    />
  );
}

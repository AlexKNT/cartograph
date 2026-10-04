"use client";

import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CategoryRail } from "@/components/category-rail";
import {
  DependencyCanvas,
  FIT_PADDING,
  MAX_ZOOM,
} from "@/components/graph/dependency-canvas";
import { DetailPane, type PaneTab } from "@/components/graph/detail-pane";
import { MapShell } from "@/components/map-shell";
import { ownerIndex, type Folded } from "@/lib/graph/fold";
import type {
  FileCategory,
  Hover,
  MapSummary,
  RepositoryFacts,
  Selection,
} from "@/lib/graph/types";
import type { ImportEdge, ParsedFile } from "@/lib/parser/types";

export interface ExplorerProps {
  fold: Folded;
  files: readonly ParsedFile[];
  edges: readonly ImportEdge[];
  summary: MapSummary;
  facts: RepositoryFacts;
  /** Paths the adapter named as reached by the framework. They are not orphans
   *  even when nothing imports them, so the insights leave them out. */
  entryPoints: readonly string[];
}

/**
 * What the map and the detail pane share. The selection, what is open and what
 * the pointer is on live above React Flow rather than inside the canvas,
 * because the pane reads all three: a path clicked in the pane selects on the
 * map, and a hover in either place reaches the other. None of it moves between
 * the two, and none of it is fetched.
 */
export function Explorer(props: ExplorerProps) {
  return (
    <ReactFlowProvider>
      <ExplorerShell {...props} />
    </ReactFlowProvider>
  );
}

function ExplorerShell({ fold, files, edges, summary, facts, entryPoints }: ExplorerProps) {
  const { fitView, getZoom } = useReactFlow();

  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [selected, setSelected] = useState<Selection | null>(null);
  const [hovered, setHovered] = useState<Hover | null>(null);
  // The rail's narrowing is a third kind of emphasis, alongside the selection
  // and the hover, and it survives both: picking a file does not drop it.
  const [category, setCategory] = useState<FileCategory | null>(null);
  // The tab belongs to the pane, not to the selection: someone comparing
  // explanations across three files should not reopen it three times.
  const [tab, setTab] = useState<PaneTab>("structure");

  /** The zoom a refit may not exceed. Null when nothing waits to be fitted. */
  const zoomCeiling = useRef<number | null>(null);

  const owners = useMemo(() => ownerIndex(fold.nodes), [fold.nodes]);

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

  /** Selecting a path opens the folder holding it: a selection the canvas is
   *  not showing is not a selection. */
  const selectPath = useCallback(
    (path: string) => {
      setSelected({ kind: "file", path });
      const node = owners.get(path);
      if (node === undefined || open.has(node)) return;
      zoomCeiling.current = Math.min(getZoom(), MAX_ZOOM);
      setOpen((current) => new Set(current).add(node));
    },
    [owners, open, getZoom],
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

  const hoveredFile = hovered !== null && hovered.kind === "file" ? hovered.path : null;
  const hoveredNode =
    hovered === null
      ? null
      : hovered.kind === "node"
        ? hovered.node
        : (owners.get(hovered.path) ?? null);

  return (
    <MapShell
      rail={<CategoryRail summary={summary} active={category} onCategory={setCategory} />}
      map={
        <DependencyCanvas
          fold={fold}
          edges={edges}
          open={open}
          selected={selected}
          category={category}
          hoveredFile={hoveredFile}
          hoveredNode={hoveredNode}
          onOpen={openNode}
          onClose={closeNode}
          onSelect={setSelected}
          onHover={setHovered}
        />
      }
      pane={
        <DetailPane
          fold={fold}
          files={files}
          edges={edges}
          facts={facts}
          entryPoints={entryPoints}
          owners={owners}
          selection={selected}
          hovered={hovered}
          tab={tab}
          onTab={setTab}
          onSelectPath={selectPath}
          onHover={setHovered}
        />
      }
    />
  );
}

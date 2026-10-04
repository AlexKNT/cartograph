"use client";

import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CategoryRail } from "@/components/category-rail";
import {
  DependencyCanvas,
  FIT_PADDING,
  MAX_ZOOM,
} from "@/components/graph/dependency-canvas";
import { CoverageBanner } from "@/components/graph/coverage-banner";
import { DetailPane, type PaneTab } from "@/components/graph/detail-pane";
import {
  explanationKey,
  type ExplanationState,
} from "@/components/graph/explanation";
import { MapShell } from "@/components/map-shell";
import { explainSubject } from "@/lib/actions/explain";
import type { CoverageCounts } from "@/lib/graph/coverage";
import { ownerIndex, type Folded } from "@/lib/graph/fold";
import { categoryIndex, railCounts, railFor } from "@/lib/graph/rail";
import type { Hover, MapSummary, RepositoryFacts, Selection } from "@/lib/graph/types";
import type { ImportEdge, ParsedFile } from "@/lib/parser/types";
import type { StoredRoute } from "@/lib/supabase/types";

export interface ExplorerProps {
  /** The run this map is of, which is what an explanation names. */
  analysisId: string;
  /** False when LangSmith has no key, which the Explanation tab says out loud. */
  tracing: boolean;
  fold: Folded;
  files: readonly ParsedFile[];
  edges: readonly ImportEdge[];
  summary: MapSummary;
  facts: RepositoryFacts;
  /** Paths the adapter named as reached by the framework. They are not orphans
   *  even when nothing imports them, so the insights leave them out. */
  entryPoints: readonly string[];
  /** The role the adapter gave each file, by path. */
  roles: Readonly<Record<string, string>>;
  /** Routes recovered exactly, for the route table. */
  routes: readonly StoredRoute[];
  /** What the run recorded about the imports it saw, for the banner. */
  coverage: CoverageCounts;
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

function ExplorerShell({
  analysisId,
  tracing,
  fold,
  files,
  edges,
  summary,
  facts,
  entryPoints,
  roles,
  routes,
  coverage,
}: ExplorerProps) {
  const { fitView, getZoom } = useReactFlow();

  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [selected, setSelected] = useState<Selection | null>(null);
  const [hovered, setHovered] = useState<Hover | null>(null);
  // The rail's narrowing is a third kind of emphasis, alongside the selection
  // and the hover, and it survives both: picking a file does not drop it.
  const [category, setCategory] = useState<string | null>(null);

  // The rail is the framework's own vocabulary; the index turns each file into
  // the entry it belongs to, and everything that colours or filters reads it.
  const rail = useMemo(() => railFor(summary.framework), [summary.framework]);
  const categories = useMemo(
    () => categoryIndex(summary.framework, files, new Map(Object.entries(roles))),
    [summary.framework, files, roles],
  );
  const counts = useMemo(() => railCounts(rail, categories), [rail, categories]);
  const activeRail = category === null ? null : (rail.find((entry) => entry.id === category) ?? null);
  // The tab belongs to the pane, not to the selection: someone comparing
  // explanations across three files should not reopen it three times.
  const [tab, setTab] = useState<PaneTab>("structure");

  // What has been explained, kept by subject. This is what makes moving the
  // selection away and back free: the paragraph is here, not in a request.
  const [explanations, setExplanations] = useState<ReadonlyMap<string, ExplanationState>>(
    () => new Map<string, ExplanationState>(),
  );

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

  /** Every path the repository has, which is what a path in prose is matched against. */
  const paths = useMemo(() => new Set(files.map((file) => file.path)), [files]);

  /**
   * Asking for an explanation is the one thing in this pane that is not already
   * in the browser, and it is always a real call: the answer is kept here for
   * the next visit to the subject, but the button asks again.
   */
  const explain = useCallback(
    (target: Selection) => {
      const key = explanationKey(target);
      const kind = target.kind === "file" ? "file" : "folder";
      const subject = target.kind === "file" ? target.path : target.node;

      const settle = (outcome: ExplanationState): void => {
        setExplanations((current) => new Map(current).set(key, outcome));
      };

      settle({ kind: "working" });
      void explainSubject(analysisId, kind, subject)
        .then((outcome) => settle({ kind: "done", outcome }))
        .catch((error: unknown) => {
          settle({
            kind: "done",
            outcome: {
              status: "failed",
              message: error instanceof Error ? error.message : String(error),
            },
          });
        });
    },
    [analysisId],
  );

  const explanation =
    selected === null ? null : (explanations.get(explanationKey(selected)) ?? null);

  const hoveredFile = hovered !== null && hovered.kind === "file" ? hovered.path : null;
  const hoveredNode =
    hovered === null
      ? null
      : hovered.kind === "node"
        ? hovered.node
        : (owners.get(hovered.path) ?? null);

  return (
    <MapShell
      rail={
        <CategoryRail
          summary={summary}
          counts={counts}
          active={category}
          onCategory={setCategory}
        />
      }
      map={
        <div className="flex h-full min-h-0 flex-col">
          <CoverageBanner counts={coverage} />
          <div className="min-h-0 flex-1">
            <DependencyCanvas
              fold={fold}
              edges={edges}
              open={open}
              selected={selected}
              categories={categories}
              category={category}
              activeRail={activeRail}
              hoveredFile={hoveredFile}
              hoveredNode={hoveredNode}
              onOpen={openNode}
              onClose={closeNode}
              onSelect={setSelected}
              onHover={setHovered}
            />
          </div>
        </div>
      }
      pane={
        <DetailPane
          analysisId={analysisId}
          fold={fold}
          files={files}
          edges={edges}
          facts={facts}
          entryPoints={entryPoints}
          rail={rail}
          categories={categories}
          routes={routes}
          owners={owners}
          selection={selected}
          hovered={hovered}
          tab={tab}
          onTab={setTab}
          explanation={explanation}
          onExplain={explain}
          tracing={tracing}
          paths={paths}
          onSelectPath={selectPath}
          onHover={setHovered}
        />
      }
    />
  );
}

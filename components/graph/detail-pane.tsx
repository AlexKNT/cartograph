"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CategorySwatch } from "@/components/category-swatch";
import { ExplanationPane, type ExplanationState } from "@/components/graph/explanation";
import { fileDetail, overview } from "@/lib/graph/detail";
import type { Folded, FoldedNode } from "@/lib/graph/fold";
import { analyse } from "@/lib/graph/insights";
import { countsFor } from "@/lib/graph/rail";
import { transitiveWalk, WALK_DEPTH, type WalkDirection } from "@/lib/graph/traverse";
import type {
  CategoryIndex,
  FileCategory,
  Hover,
  RailEntry,
  RepositoryFacts,
  Selection,
} from "@/lib/graph/types";
import type { ImportEdge, ParsedFile } from "@/lib/parser/types";
import type { StoredRoute } from "@/lib/supabase/types";

export type PaneTab = "structure" | "routes" | "explanation";

export interface DetailPaneProps {
  /** The run every explanation here is written against. */
  analysisId: string;
  fold: Folded;
  files: readonly ParsedFile[];
  edges: readonly ImportEdge[];
  facts: RepositoryFacts;
  /** Paths the framework reaches, which the insights treat as not orphaned. */
  entryPoints: readonly string[];
  /** The rail's categories, in reading order, so a folder's counts keep it. */
  rail: readonly RailEntry[];
  /** Which rail entry each file belongs to. */
  categories: CategoryIndex;
  /** Routes recovered exactly, or none. */
  routes: readonly StoredRoute[];
  /** Which node holds each file, so a hover on a folded node reads as a path. */
  owners: ReadonlyMap<string, string>;
  selection: Selection | null;
  hovered: Hover | null;
  tab: PaneTab;
  onTab: (tab: PaneTab) => void;
  /** What the selected subject's explanation came to, once it was asked for. */
  explanation: ExplanationState | null;
  onExplain: (selection: Selection) => void;
  /** False when LangSmith has no key, which the tab says out loud. */
  tracing: boolean;
  /** Every path in the repository, so a path in prose can become a link. */
  paths: ReadonlySet<string>;
  onSelectPath: (path: string) => void;
  onHover: (hover: Hover | null) => void;
}

const TABS: readonly { tab: PaneTab; label: string }[] = [
  { tab: "structure", label: "Structure" },
  { tab: "routes", label: "Routes" },
  { tab: "explanation", label: "Explanation" },
];

/**
 * The pane is filled from data the browser already has: nothing in it is
 * fetched, so nothing in it can be waiting. Selecting something is a state
 * change here and a repaint on the canvas, not a request.
 */
export function DetailPane(props: DetailPaneProps) {
  const { tab, onTab } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b border-border">
        {TABS.map(({ tab: id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            className={`-mb-px border-b px-3 py-1 text-[11px] ${
              tab === id ? "border-accent text-foreground" : "border-transparent text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === "explanation" && (
          <ExplanationPane
            analysisId={props.analysisId}
            selection={props.selection}
            state={props.explanation}
            tracing={props.tracing}
            paths={props.paths}
            onExplain={props.onExplain}
            onSelectPath={props.onSelectPath}
          />
        )}
        {tab === "routes" && <RouteTable {...props} />}
        {tab === "structure" && <Structure {...props} />}
      </div>

      <Insights {...props} />
    </div>
  );
}

/**
 * The pane's resting state, not a placeholder: it says what the repository is
 * before anything is clicked. Nothing imports is the list someone opens this
 * to see — it is where reading starts.
 */
function Structure(props: DetailPaneProps) {
  const { fold, selection } = props;

  if (selection === null) return <RepositoryStructure {...props} />;
  if (selection.kind === "file") return <FileStructure {...props} path={selection.path} />;

  const node = fold.nodes.find((candidate) => candidate.id === selection.node);
  if (node === undefined) {
    return <p className="px-1 text-[11px] text-muted">This folder is not in the map.</p>;
  }
  return <FolderStructure {...props} node={node} />;
}

/** A hover is read from both sides: the path itself, or — when the pointer is
 *  on a folded node — any file that node holds. */
function isHovered(
  hovered: Hover | null,
  owners: ReadonlyMap<string, string>,
  path: string,
): boolean {
  if (hovered === null) return false;
  return hovered.kind === "file" ? hovered.path === path : owners.get(path) === hovered.node;
}

function RepositoryStructure(props: DetailPaneProps) {
  const { facts, files, edges, entryPoints, categories, owners, hovered, onHover, onSelectPath } =
    props;
  const { lean, unimported } = useMemo(
    () => overview(files, edges, entryPoints, categories),
    [files, edges, entryPoints, categories],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5 px-1">
        <span className="font-mono text-[11px]">{facts.repository}</span>
        <span className="font-mono text-[11px] text-muted">
          {facts.framework === "none" ? "no framework" : facts.framework}
        </span>
      </div>

      <div className="flex flex-col gap-0.5 px-1 font-mono text-[11px] text-muted">
        <Figure label="files" value={facts.fileCount} />
        <Figure label="imports" value={facts.importCount} />
        <Figure label="edges" value={facts.edgeCount} />
      </div>

      <Section title="most depended on">
        {lean.map((file) => (
          <EntryRow
            key={file.path}
            path={file.path}
            swatch={file.swatch}
            count={file.fanIn}
            hovered={isHovered(hovered, owners, file.path)}
            onHover={onHover}
            onSelect={onSelectPath}
          />
        ))}
      </Section>

      <Section title="nothing imports" count={unimported.length}>
        {unimported.map((file) => (
          <EntryRow
            key={file.path}
            path={file.path}
            swatch={file.swatch}
            hovered={isHovered(hovered, owners, file.path)}
            onHover={onHover}
            onSelect={onSelectPath}
          />
        ))}
      </Section>
    </div>
  );
}

function FileStructure(props: DetailPaneProps & { path: string }) {
  const { path, files, edges, categories, owners, hovered, onHover, onSelectPath } = props;
  const detail = useMemo(
    () => fileDetail(path, files, edges, categories),
    [path, files, edges, categories],
  );
  // One walk, read in two directions. The buttons toggle between them and
  // between the file's direct neighbours, and the answer is arithmetic over
  // data already in the browser, so it appears with the click.
  const [walk, setWalk] = useState<WalkDirection | null>(null);
  const walked = useMemo(
    () => (walk === null ? [] : transitiveWalk(path, edges, categories, walk)),
    [walk, path, edges, categories],
  );

  if (detail === null) {
    return (
      <p className="px-1 text-[11px] text-muted">
        This file is not one the parser kept, so there is nothing to show about it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5 px-1">
        <span className="break-all font-mono text-[11px]">{detail.path}</span>
        <span className="font-mono text-[11px] text-muted">
          {detail.label ?? "no category"} · {detail.lines} lines
        </span>
        <span className="font-mono text-[11px] text-muted">
          depends on {detail.dependsOn.length} · {detail.dependents.length} depend on it
        </span>
      </div>

      <div className="flex gap-1 px-1">
        <WalkButton
          label="Blast radius"
          here={walk === "in"}
          onClick={() => setWalk(walk === "in" ? null : "in")}
        />
        <WalkButton
          label="Dependency chain"
          here={walk === "out"}
          onClick={() => setWalk(walk === "out" ? null : "out")}
        />
      </div>

      {walk === null ? (
        <>
          <Section title="depends on" count={detail.dependsOn.length}>
            <PathList
              paths={detail.dependsOn}
              categories={categories}
              hovered={hovered}
              owners={owners}
              onHover={onHover}
              onSelect={onSelectPath}
            />
          </Section>

          <Section title="depended on by" count={detail.dependents.length}>
            <PathList
              paths={detail.dependents}
              categories={categories}
              hovered={hovered}
              owners={owners}
              onHover={onHover}
              onSelect={onSelectPath}
            />
          </Section>
        </>
      ) : (
        <WalkResult
          direction={walk}
          walked={walked}
          categories={categories}
          hovered={hovered}
          owners={owners}
          onHover={onHover}
          onSelect={onSelectPath}
        />
      )}
    </div>
  );
}

function WalkButton({
  label,
  here,
  onClick,
}: {
  label: string;
  here: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[2px] border px-1.5 py-0.5 text-[11px] ${
        here ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

/** The walk, grouped by how many steps away each file is, so a two-level
 *  answer stays walkable rather than reading as one flat list. */
function WalkResult({
  direction,
  walked,
  categories,
  hovered,
  owners,
  onHover,
  onSelect,
}: {
  direction: WalkDirection;
  walked: readonly { path: string; depth: number }[];
  categories: CategoryIndex;
  hovered: Hover | null;
  owners: ReadonlyMap<string, string>;
  onHover: (hover: Hover | null) => void;
  onSelect: (path: string) => void;
}) {
  const title = direction === "in" ? "blast radius" : "dependency chain";

  return (
    <Section title={title} count={walked.length}>
      <p className="px-1 text-[11px] text-muted">
        {direction === "in"
          ? `Everything that depends on this file, up to ${WALK_DEPTH} steps away.`
          : `Everything this file needs, up to ${WALK_DEPTH} steps away.`}
      </p>

      {walked.length === 0 ? (
        <p className="px-1 font-mono text-[11px] text-muted">nothing</p>
      ) : (
        [...new Set(walked.map((entry) => entry.depth))].sort((left, right) => left - right).map(
          (depth) => {
            const at = walked.filter((entry) => entry.depth === depth);
            return (
              <div key={depth} className="flex flex-col">
                <span className="px-1 font-mono text-[10px] text-muted">
                  {depth} step{depth === 1 ? "" : "s"} away
                </span>
                <PathList
                  paths={at.map((entry) => entry.path)}
                  categories={categories}
                  hovered={hovered}
                  owners={owners}
                  onHover={onHover}
                  onSelect={onSelect}
                />
              </div>
            );
          },
        )
      )}
    </Section>
  );
}

function FolderStructure({ rail, categories, node }: DetailPaneProps & { node: FoldedNode }) {
  const totals = useMemo(
    () => countsFor(node.files, rail, categories),
    [node.files, rail, categories],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5 px-1">
        <span className="break-all font-mono text-[11px]">{node.id}</span>
        <span className="font-mono text-[11px] text-muted">
          {node.files.length} files · in {node.fanIn} · out {node.fanOut}
        </span>
      </div>

      <Section title="what it holds">
        {totals.map(({ id, label, swatch, count }) => (
          <span key={id} className="flex items-center gap-1.5 px-1 py-0.5 text-[11px]">
            <CategorySwatch swatch={swatch} />
            <span className="flex-1">{label}</span>
            <span className="font-mono text-muted">{count}</span>
          </span>
        ))}
      </Section>
    </div>
  );
}

/**
 * Every route an adapter recovered, exact or absent. A row is the method, the
 * full pattern, and the file it lives in; clicking one moves the map to that
 * file. Nothing here assembles a route: the pattern and the method came off the
 * syntax together, and a route either has both or was never emitted.
 */
function RouteTable(props: DetailPaneProps) {
  const { routes, categories, owners, hovered, onHover, onSelectPath } = props;

  const sorted = useMemo(
    () =>
      [...routes].sort((left, right) => {
        if (left.route !== right.route) return left.route < right.route ? -1 : 1;
        return (left.method ?? "") < (right.method ?? "") ? -1 : 1;
      }),
    [routes],
  );

  if (sorted.length === 0) {
    return (
      <p className="px-1 text-[11px] text-muted">
        No routes were recovered from this repository.
      </p>
    );
  }

  return (
    <Section title="routes" count={sorted.length}>
      <div className="flex flex-col">
        {sorted.map((route) => {
          const hoveredHere = isHovered(hovered, owners, route.file);
          const selectedHere = props.selection?.kind === "file" && props.selection.path === route.file;
          return (
            <button
              key={`${route.file}\u0000${route.method ?? ""}\u0000${route.route}`}
              type="button"
              title={route.file}
              onClick={() => onSelectPath(route.file)}
              onMouseEnter={() => onHover({ kind: "file", path: route.file })}
              onMouseLeave={() => onHover(null)}
              className={`flex items-center gap-2 rounded-[2px] px-1 py-0.5 text-left ${
                selectedHere
                  ? "bg-accent/10 text-accent"
                  : hoveredHere
                    ? "bg-accent/10"
                    : "hover:bg-background"
              }`}
            >
              <CategorySwatch swatch={categories.get(route.file)?.swatch ?? null} />
              <span className="w-16 shrink-0 font-mono text-[11px] text-muted">
                {route.method ?? "—"}
              </span>
              <span className="shrink-0 font-mono text-[11px]">{route.route}</span>
              <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-muted">
                {route.file}
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

/**
 * Four facts about the edge list, in a panel that starts collapsed. It sits at
 * the bottom of the pane and is never the first thing anyone sees: this
 * explains a codebase, it does not grade one. Each kind is one of four fixed
 * sentences, and nothing here calls a model.
 */
function Insights(props: DetailPaneProps) {
  const { files, edges, entryPoints, categories, owners, hovered, onHover, onSelectPath } = props;
  const [open, setOpen] = useState(false);
  const insights = useMemo(
    () => analyse(files, edges, entryPoints, categories),
    [files, edges, entryPoints, categories],
  );
  const found = insights.reduce((total, insight) => total + insight.total, 0);

  return (
    <section className="shrink-0 border-t border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left"
      >
        <span aria-hidden className="text-[10px] text-muted">
          {open ? "▾" : "▸"}
        </span>
        <span className="flex-1 text-[11px] text-muted">insights</span>
        <span className="font-mono text-[11px] text-muted">{found}</span>
      </button>

      {open && (
        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto border-t border-border p-2">
          {insights.map((insight) => (
            <Section key={insight.kind} title={insight.title} count={insight.total}>
              <p className="px-1 text-[11px] text-muted">{insight.sentence}</p>
              {insight.files.length === 0 ? (
                <p className="px-1 font-mono text-[11px] text-muted">nothing</p>
              ) : (
                insight.files.map((file) => (
                  <EntryRow
                    key={file.path}
                    path={file.path}
                    swatch={file.swatch}
                    count={file.note}
                    hovered={isHovered(hovered, owners, file.path)}
                    onHover={onHover}
                    onSelect={onSelectPath}
                  />
                ))
              )}
              {insight.total > insight.files.length && (
                <p className="px-1 font-mono text-[11px] text-muted">
                  {insight.total - insight.files.length} more
                </p>
              )}
            </Section>
          ))}
        </div>
      )}
    </section>
  );
}

function PathList({
  paths,
  categories,
  hovered,
  owners,
  onHover,
  onSelect,
}: {
  paths: readonly string[];
  categories: CategoryIndex;
  hovered: Hover | null;
  owners: ReadonlyMap<string, string>;
  onHover: (hover: Hover | null) => void;
  onSelect: (path: string) => void;
}) {
  if (paths.length === 0) {
    return <p className="px-1 font-mono text-[11px] text-muted">nothing</p>;
  }

  return (
    <>
      {paths.map((path) => (
        <EntryRow
          key={path}
          path={path}
          swatch={categories.get(path)?.swatch ?? null}
          hovered={isHovered(hovered, owners, path)}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function EntryRow({
  path,
  swatch,
  count,
  hovered,
  onHover,
  onSelect,
}: {
  path: string;
  swatch: FileCategory | null;
  count?: number | string;
  hovered: boolean;
  onHover: (hover: Hover | null) => void;
  onSelect: (path: string) => void;
}) {
  return (
    <button
      type="button"
      title={path}
      onClick={() => onSelect(path)}
      onMouseEnter={() => onHover({ kind: "file", path })}
      onMouseLeave={() => onHover(null)}
      className={`flex w-full items-center gap-1.5 rounded-[2px] px-1 py-0.5 text-left ${
        hovered ? "bg-accent/10 text-accent" : "hover:bg-background"
      }`}
    >
      <CategorySwatch swatch={swatch} />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{path}</span>
      {count !== undefined && (
        <span className="shrink-0 font-mono text-[11px] text-muted">{count}</span>
      )}
    </button>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex justify-between gap-2">
      <span>{label}</span>
      <span>{value}</span>
    </span>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-0.5">
      <h2 className="flex items-baseline justify-between gap-2 px-1 text-[11px] text-muted">
        <span>{title}</span>
        {count !== undefined && <span className="font-mono">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

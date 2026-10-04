"use client";

import { useMemo, type ReactNode } from "react";
import { CategorySwatch } from "@/components/category-swatch";
import { categoryOf, countPaths } from "@/lib/graph/categories";
import { fileDetail, overview } from "@/lib/graph/detail";
import type { Folded, FoldedNode } from "@/lib/graph/fold";
import type { FileCategory, Hover, RepositoryFacts, Selection } from "@/lib/graph/types";
import type { ImportEdge, ParsedFile } from "@/lib/parser/types";

export type PaneTab = "structure" | "explanation";

export interface DetailPaneProps {
  fold: Folded;
  files: readonly ParsedFile[];
  edges: readonly ImportEdge[];
  facts: RepositoryFacts;
  /** Which node holds each file, so a hover on a folded node reads as a path. */
  owners: ReadonlyMap<string, string>;
  selection: Selection | null;
  hovered: Hover | null;
  tab: PaneTab;
  onTab: (tab: PaneTab) => void;
  onSelectPath: (path: string) => void;
  onHover: (hover: Hover | null) => void;
}

const TABS: readonly { tab: PaneTab; label: string }[] = [
  { tab: "structure", label: "Structure" },
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
        {tab === "explanation" ? <Explanation /> : <Structure {...props} />}
      </div>
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
  return <FolderStructure node={node} />;
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
  const { facts, files, edges, owners, hovered, onHover, onSelectPath } = props;
  const { lean, unimported } = useMemo(() => overview(files, edges), [files, edges]);

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
            category={file.category}
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
            category={file.category}
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
  const { path, files, edges, owners, hovered, onHover, onSelectPath } = props;
  const detail = useMemo(() => fileDetail(path, files, edges), [path, files, edges]);

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
          {detail.category} · {detail.lines} lines
        </span>
        <span className="font-mono text-[11px] text-muted">
          depends on {detail.dependsOn.length} · {detail.dependents.length} depend on it
        </span>
      </div>

      <Section title="depends on" count={detail.dependsOn.length}>
        <PathList
          paths={detail.dependsOn}
          hovered={hovered}
          owners={owners}
          onHover={onHover}
          onSelect={onSelectPath}
        />
      </Section>

      <Section title="depended on by" count={detail.dependents.length}>
        <PathList
          paths={detail.dependents}
          hovered={hovered}
          owners={owners}
          onHover={onHover}
          onSelect={onSelectPath}
        />
      </Section>
    </div>
  );
}

function FolderStructure({ node }: { node: FoldedNode }) {
  const totals = useMemo(() => countPaths(node.files), [node.files]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5 px-1">
        <span className="break-all font-mono text-[11px]">{node.id}</span>
        <span className="font-mono text-[11px] text-muted">
          {node.files.length} files · in {node.fanIn} · out {node.fanOut}
        </span>
      </div>

      <Section title="what it holds">
        {totals.map(({ category, count }) => (
          <span key={category} className="flex items-center gap-1.5 px-1 py-0.5 text-[11px]">
            <CategorySwatch category={category} />
            <span className="flex-1">{category}</span>
            <span className="font-mono text-muted">{count}</span>
          </span>
        ))}
      </Section>
    </div>
  );
}

/** Nothing fills this until there is a model call to fill it with, and the
 *  empty state says so rather than pretending to be loading. */
function Explanation() {
  return (
    <p className="px-1 text-[11px] text-muted">
      Nothing here yet. An explanation is written from what the parser found, and there is no
      call that writes one yet.
    </p>
  );
}

function PathList({
  paths,
  hovered,
  owners,
  onHover,
  onSelect,
}: {
  paths: readonly string[];
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
          category={categoryOf(path)}
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
  category,
  count,
  hovered,
  onHover,
  onSelect,
}: {
  path: string;
  category: FileCategory;
  count?: number;
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
      <CategorySwatch category={category} />
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

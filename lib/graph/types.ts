/**
 * The canvas's own model. Nothing here is a parser type: the parser's shape is
 * the contract, and every one of these is derived from it by a pure function.
 * Path in, data out, no framework — so a plain script can build the same map
 * the browser draws.
 */

/** The swatch palette, which is the only thing the rail's colours mean. On the
 *  generic rail these are file kinds; on a framework rail a role draws from the
 *  same palette, so a colour always has one legend: the rail it appears on. */
export type FileCategory = "source" | "test" | "barrel" | "declaration";

/** One entry the rail can show. `id` is the role the adapter assigned, or a
 *  file kind on the generic rail. */
export interface RailEntry {
  id: string;
  /** What the rail says. Concrete, never an abstraction. */
  label: string;
  swatch: FileCategory;
}

/** A rail entry and how many files are under it. */
export interface CategoryTotal extends RailEntry {
  count: number;
}

/** Which rail entry each file belongs to. Built once from the framework and the
 *  stored roles, then read by everything that colours or filters a file. A file
 *  with no entry draws no swatch. */
export type CategoryIndex = ReadonlyMap<string, RailEntry>;

/** Nothing moves on its own, so a selection only ever dims what it didn't reach. */
export type Strength = "full" | "dim";

/** Direction is read from the selected file: in, out, or neither. */
export type Direction = "in" | "out" | "none";

export type Selection =
  | { kind: "node"; node: string }
  | { kind: "file"; path: string };

/** What the pointer is on. The same two things a click can land on, and like a
 *  selection it only ever changes emphasis — but it is never kept, and nothing
 *  is derived that outlives the pointer leaving. */
export type Hover = Selection;

export interface FileRow {
  /** Repository-relative, POSIX separators, and what the row's handle id ends with. */
  path: string;
  name: string;
  /** Null when no rail category claims the file, so it draws no colour. */
  swatch: FileCategory | null;
  strength: Strength;
}

/** A directory on the canvas, holding its files and nothing else. */
export interface CanvasNode {
  /** The directory's path, which is unique and so doubles as the node id. */
  id: string;
  /** The shortest label still unique among the nodes on screen. */
  label: string;
  fileCount: number;
  fanIn: number;
  fanOut: number;
  expanded: boolean;
  /** Filled only when expanded: the rows that fit, and how many did not. */
  rows: FileRow[];
  hiddenRows: number;
  strength: Strength;
  /** Files here that are in the rail's active category, or null when none is
   *  active. Every node carries one, so the counts can be added up. */
  matchCount: number | null;
  /** Deterministic from the label and the dependency count. */
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface CanvasEdge {
  /** `<from file> -> <to file>`; file identity, so two edges cannot collide. */
  id: string;
  /** The node each end belongs to; React Flow needs both. */
  source: string;
  target: string;
  /** Set when that end is an open panel, so the edge lands on its row. */
  sourceHandle?: string;
  targetHandle?: string;
  strength: Strength;
  direction: Direction;
}

/** What the rail says about the repository it is a map of. Its categories are
 *  not here: they come from the taxonomy and the stored roles, so the rail can
 *  be rebuilt from an adapter's name without the parser. */
export interface MapSummary {
  repository: string;
  framework: string;
  fileCount: number;
  nodeCount: number;
  /** The fold threshold the map settled on; the repository chose it. */
  threshold: number;
}

/** What the pane says about the repository with nothing selected. Every count
 *  is one the parser produced; the interface derives none of them. */
export interface RepositoryFacts {
  repository: string;
  framework: string;
  fileCount: number;
  importCount: number;
  edgeCount: number;
}

export interface Canvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** The state that isn't in the data: what was opened, what was clicked, and
 *  which category the rail is narrowing the picture to. */
export interface CanvasState {
  open: ReadonlySet<string>;
  selected: Selection | null;
  /** Which rail entry each file belongs to, so the filter has a predicate. */
  categories: CategoryIndex;
  /** The rail entry being narrowed to, or null when every file is at full strength. */
  category: string | null;
}

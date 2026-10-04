/**
 * The crossing between the parser's shapes and the rows that store them.
 *
 * Pure, and the only place the two vocabularies meet: what a run writes is what
 * the parser produced, and what the map reads is what the parser would have
 * produced. Nothing here reshapes either side.
 */

import { fileName } from "../graph/paths.ts";
import { extensionOf, moduleOf } from "../parser/paths.ts";
import type { EdgeKind, ImportEdge, ParsedFile } from "../parser/types.ts";
import type {
  FileRecord,
  NewEdge,
  NewFile,
  StoredEdgeKind,
} from "../supabase/types.ts";

/** The parser's kinds, in the order it reports them for a pair of files. */
const KIND_ORDER: readonly EdgeKind[] = ["import", "re-export", "dynamic-import"];

/**
 * The parser calls a dynamic import `dynamic-import`; the column's check
 * constraint calls it `dynamic`. One translation, in one place, rather than a
 * second spelling of the parser's vocabulary in the schema.
 */
const STORED_KIND: Readonly<Record<EdgeKind, StoredEdgeKind>> = {
  import: "import",
  "re-export": "re-export",
  "dynamic-import": "dynamic",
};

const PARSER_KIND: Readonly<Record<string, EdgeKind>> = {
  import: "import",
  "re-export": "re-export",
  dynamic: "dynamic-import",
};

/** A fact about the extension, not about the file's contents. */
const LANGUAGE: Readonly<Record<string, string>> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
};

export function fileRows(
  analysisId: string,
  organizationId: string,
  files: readonly ParsedFile[],
): NewFile[] {
  return files.map((file) => ({
    analysis_id: analysisId,
    organization_id: organizationId,
    path: file.path,
    directory: file.folder,
    language: LANGUAGE[file.extension] ?? "unknown",
    lines: file.lines,
    content_hash: file.hash,
    bytes: file.bytes,
    fan_in: file.fanIn,
    fan_out: file.fanOut,
  }));
}

/**
 * One row per kind, because that is what the unique key keeps apart: a pair
 * connected by an import and a re-export is two statements and one edge.
 */
export function edgeRows(
  analysisId: string,
  organizationId: string,
  edges: readonly ImportEdge[],
  fileIdByPath: ReadonlyMap<string, string>,
): NewEdge[] {
  const rows: NewEdge[] = [];

  for (const edge of edges) {
    const from = fileIdByPath.get(edge.from);
    const to = fileIdByPath.get(edge.to);
    if (from === undefined || to === undefined) {
      throw new Error(`Edge ${edge.from} -> ${edge.to} names a file that was not stored.`);
    }
    for (const kind of edge.kinds) {
      rows.push({
        analysis_id: analysisId,
        organization_id: organizationId,
        from_file_id: from,
        to_file_id: to,
        kind: STORED_KIND[kind],
      });
    }
  }

  return rows;
}

/**
 * A file back in the parser's shape. `name`, `extension` and `module` are not
 * columns: the parser derives them from the path, so deriving them the same way
 * reproduces its value rather than guessing at one.
 */
export function parsedFiles(rows: readonly FileRecord[]): ParsedFile[] {
  return rows
    .map((row) => ({
      path: row.path,
      name: fileName(row.path),
      extension: extensionOf(row.path),
      folder: row.directory,
      module: moduleOf(row.path),
      lines: row.lines,
      bytes: row.bytes,
      hash: row.content_hash,
      fanIn: row.fan_in,
      fanOut: row.fan_out,
    }))
    .sort((left, right) => (left.path < right.path ? -1 : 1));
}

export interface PathEdge {
  from: string;
  to: string;
  kind: string;
}

/** The rows back into one edge per pair of files, as the parser would have. */
export function parsedEdges(rows: readonly PathEdge[]): ImportEdge[] {
  const pairs = new Map<string, { from: string; to: string; kinds: Set<EdgeKind> }>();

  for (const row of rows) {
    const kind = PARSER_KIND[row.kind];
    if (kind === undefined) {
      throw new Error(`An edge was stored with kind "${row.kind}", which nothing reads.`);
    }

    const key = `${row.from}\u0000${row.to}`;
    const existing = pairs.get(key);
    if (existing === undefined) {
      pairs.set(key, { from: row.from, to: row.to, kinds: new Set([kind]) });
      continue;
    }
    existing.kinds.add(kind);
  }

  return [...pairs.values()]
    .map((pair) => ({
      from: pair.from,
      to: pair.to,
      kinds: KIND_ORDER.filter((kind) => pair.kinds.has(kind)),
    }))
    .sort((left, right) => {
      if (left.from !== right.from) return left.from < right.from ? -1 : 1;
      return left.to < right.to ? -1 : 1;
    });
}

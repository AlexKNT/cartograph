import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FOLD_TARGET_NODES, foldFiles } from "../lib/graph/fold.ts";
import { categoryIndex, railCounts, railFor } from "../lib/graph/rail.ts";
import { buildCanvas } from "../lib/graph/view.ts";
import { readParseResultModule } from "../lib/parser/serialize.ts";

const USAGE = `cartograph fold — fold a parse result the way the canvas does, and count it

  node scripts/parse.ts <directory> --out <file.ts>
  node scripts/fold.ts <file.ts>

Folds the parse result into canvas nodes and prints the numbers the map has to
satisfy. Exits non-zero if one of them fails.`;

const count = (value: number): string => value.toLocaleString("en-US");

function label(name: string, value: string): void {
  console.log(`${name.padEnd(14)}${value}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }

  if (args[0] === undefined) {
    throw new Error("Give it a parse result: node scripts/fold.ts <file.ts>");
  }
  const dataPath = resolve(args[0]);
  const loaded: unknown = await import(pathToFileURL(dataPath).href);
  const parsed = readParseResultModule(loaded, dataPath);

  const fold = foldFiles(parsed.files, parsed.edges);

  const rail = railFor(parsed.repository.framework);
  const categories = categoryIndex(
    parsed.repository.framework,
    parsed.files,
    new Map(parsed.roles.map((role) => [role.file, role.role])),
  );

  const sizes = fold.nodes.map((node) => node.files.length);
  const smallest = sizes.length === 0 ? 0 : Math.min(...sizes);
  const largest = sizes.length === 0 ? 0 : Math.max(...sizes);
  const perNode = fold.nodes.length === 0 ? 0 : fold.fileCount / fold.nodes.length;

  // Every file has to be on exactly one node, or the map is missing something.
  const placed = sizes.reduce((total, size) => total + size, 0);

  // Every node-to-node edge has to name a node that exists.
  const ids = new Set(fold.nodes.map((node) => node.id));
  const dangling = fold.edges.filter((edge) => !ids.has(edge.from) || !ids.has(edge.to));

  label("data", dataPath);
  label("repository", `${parsed.repository.name}  (framework: ${parsed.repository.framework})`);
  label("files", count(fold.fileCount));
  label("threshold", `${count(fold.threshold)}   the lowest under ${count(FOLD_TARGET_NODES)} nodes`);
  label("nodes", `${count(fold.nodes.length)}   ${perNode.toFixed(1)} files per node`);
  label("files/node", `min ${count(smallest)}   max ${count(largest)}`);
  label("node edges", count(fold.edges.length));
  label(
    "categories",
    railCounts(rail, categories)
      .map((total) => `${total.label} ${count(total.count)}`)
      .join("   "),
  );

  // Two nodes opened, one selected: enough state for a layout that leaned on
  // insertion order to come out differently the second time.
  const state = {
    open: new Set(fold.nodes.slice(0, 2).map((node) => node.id)),
    selected: { kind: "node" as const, node: fold.nodes[0]?.id ?? "" },
    categories,
    category: null,
  };
  const drawn = JSON.stringify(buildCanvas(fold, parsed.edges, state));
  const again = JSON.stringify(buildCanvas(fold, parsed.edges, state));

  const checks: { detail: string; ok: boolean; what: string }[] = [
    {
      what: `nodes under ${count(FOLD_TARGET_NODES)}`,
      ok: fold.nodes.length <= FOLD_TARGET_NODES,
      detail: count(fold.nodes.length),
    },
    {
      what: "every node holds more than one file",
      ok: smallest > 1,
      detail: `smallest holds ${count(smallest)}`,
    },
    {
      what: "every edge ends on a node that exists",
      ok: dangling.length === 0,
      detail: `${count(fold.edges.length)} edges, ${count(dangling.length)} dangling`,
    },
    {
      what: "every file sits on exactly one node",
      ok: placed === fold.fileCount,
      detail: `${count(placed)} of ${count(fold.fileCount)} files placed`,
    },
    {
      what: "the same data draws the same picture",
      ok: drawn === again,
      detail: `${count(drawn.length)} characters, twice`,
    },
  ];

  console.log("");
  console.log("checks");
  let failed = 0;
  for (const check of checks) {
    if (!check.ok) failed += 1;
    console.log(`  ${check.ok ? "ok  " : "FAIL"}  ${check.what.padEnd(36)}${check.detail}`);
  }

  if (failed > 0) {
    console.log("");
    console.log(`${failed} of ${checks.length} checks failed`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

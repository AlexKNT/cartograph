import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseRepository } from "../lib/parser/index.ts";
import { readParseResultModule, toTypedModule } from "../lib/parser/serialize.ts";
import type { CoverageGroup, ParseResult, SeenImport } from "../lib/parser/types.ts";

const USAGE = `cartograph parse — read a repository and report what is in it

  node scripts/parse.ts [directory] [--out <file.ts>]
  node scripts/parse.ts --read <file.ts> [directory]

Parses the directory (default: the current one) and prints files, edges and
coverage. --out writes the whole result out as a typed data file. --read loads
one back; give it a directory as well and it re-parses that directory to prove
the round trip.`;

interface Options {
  directory: string;
  out?: string;
  read?: string;
  help: boolean;
}

function parseArguments(args: readonly string[]): Options {
  const options: Options = { directory: process.cwd(), help: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--out" || argument === "--read") {
      const value = args[index + 1];
      if (value === undefined) throw new Error(`${argument} needs a file`);
      if (argument === "--out") options.out = value;
      else options.read = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--")) throw new Error(`Unknown option: ${argument}`);
    options.directory = argument;
  }

  return options;
}

const count = (value: number): string => value.toLocaleString("en-US");

function label(name: string, value: string): void {
  console.log(`${name.padEnd(14)}${value}`);
}

function describe(entry: SeenImport): string {
  const specifier = entry.specifier === "" ? "(not a literal)" : `"${entry.specifier}"`;
  return `${entry.from}:${entry.line}  ${entry.kind}  ${specifier}`;
}

function printGroups(title: string, groups: readonly CoverageGroup[]): void {
  if (groups.length === 0) return;
  console.log("");
  console.log(title);
  for (const group of groups) {
    const detail =
      group.example.outcome.status === "resolved"
        ? ""
        : ` — ${group.example.outcome.detail}`;
    console.log(
      `  ${String(group.count).padStart(6)}  ${group.reason.padEnd(28)}${describe(group.example)}${detail}`,
    );
  }
}

function printReport(result: ParseResult): void {
  const { repository, stats, coverage } = result;

  label("repository", `${repository.name}  (framework: ${repository.framework})`);
  label("root", repository.root);
  if (result.entryPoints.length > 0) {
    label("entry points", result.entryPoints.join(", "));
  }
  console.log("");

  label(
    "files",
    `found ${count(stats.filesFound)}   parsed ${count(stats.filesParsed)}   skipped ${count(stats.filesSkipped)}`,
  );
  const skips = Object.entries(stats.skippedByReason)
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1]);
  for (const [reason, value] of skips) {
    label(reason === skips[0][0] ? "skipped" : "", `${count(value).padStart(9)}  ${reason}`);
  }
  console.log("");

  label("folders", `${count(stats.folders)} distinct`);
  label("modules", `${count(stats.modules)} distinct`);
  label("edges", `${count(stats.edges)}   from ${count(stats.importsSeen)} imports`);
  label(
    "imports",
    `resolved ${count(coverage.resolved)}   external ${count(coverage.external)}   excluded ${count(coverage.excluded)}   unresolved ${count(coverage.unresolved)}`,
  );
  label(
    "re-exports",
    `${count(stats.reExportsSeen)} seen, ${count(stats.reExportsResolved)} resolved`,
  );

  printGroups("unresolved imports", coverage.unresolvedByReason);
  printGroups("excluded imports", coverage.excludedByReason);

  const depended = [...result.files].sort(
    (left, right) => right.fanIn - left.fanIn || (left.path < right.path ? -1 : 1),
  );
  if (depended.length > 0) {
    console.log("");
    console.log("most depended on");
    for (const file of depended.slice(0, 10)) {
      console.log(`  ${String(file.fanIn).padStart(6)}  ${file.path}`);
    }
  }
}

function writeDataFile(result: ParseResult, out: string): void {
  const absoluteOut = resolve(out);
  const typesPath = fileURLToPath(new URL("../lib/parser/types.ts", import.meta.url));
  let importPath = relative(dirname(absoluteOut), typesPath).split(sep).join("/");
  if (!importPath.startsWith(".")) importPath = `./${importPath}`;

  const text = toTypedModule(result, importPath);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, text, "utf8");

  label("wrote", `${absoluteOut}  (${count(text.length)} characters)`);
}

async function readBack(options: Options, read: string): Promise<void> {
  const absolute = resolve(read);
  const loaded: unknown = await import(pathToFileURL(absolute).href);
  const stored = readParseResultModule(loaded, read);

  console.log(`stored   ${stored.repository.name}  ${stored.repository.root}`);
  console.log(
    `         files ${count(stored.stats.filesParsed)}   edges ${count(stored.stats.edges)}   imports ${count(stored.stats.importsSeen)}   folders ${count(stored.stats.folders)}`,
  );

  const fresh = parseRepository(options.directory);
  const identical = JSON.stringify(fresh) === JSON.stringify(stored);
  console.log(
    `fresh    ${fresh.repository.name}  files ${count(fresh.stats.filesParsed)}   edges ${count(fresh.stats.edges)}   imports ${count(fresh.stats.importsSeen)}   folders ${count(fresh.stats.folders)}`,
  );
  console.log(identical ? "round trip: identical" : "round trip: differs");
  if (!identical) process.exitCode = 1;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }

  if (options.read !== undefined) {
    await readBack(options, options.read);
    return;
  }

  const result = parseRepository(options.directory);
  printReport(result);
  if (options.out !== undefined) writeDataFile(result, options.out);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

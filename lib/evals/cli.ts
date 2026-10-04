/**
 * The evaluation CLI.
 *
 * Every command prints a number and says what it is a number over. None of them
 * needs the app running; the live check needs only the traces the app already
 * wrote, and the role check needs nothing but the parser.
 */
import { filePrompt, type FileFacts } from "../ai/prompts.ts";
import { evalClient, tracingProject } from "./client.ts";
import { findInventedPaths, pathTokens } from "./invented-paths.ts";
import { runPromptVersions } from "./prompt-versions.ts";
import { runRoleAccuracy } from "./roles.ts";
import { recentExplanations, runUrl, type CheckedExplanation } from "./traffic.ts";

const USAGE = `cartograph evals — the checks that turn "is this any good" into a number

  node scripts/evals.ts invented-paths [--limit N]   score recent real explanations
  node scripts/evals.ts invented-paths --demo        splice in a fake path and catch it
  node scripts/evals.ts roles                        role accuracy over the held-out fixture
  node scripts/evals.ts prompts [--limit N]          two explanation prompts, side by side

Options:
  --limit N    how many of each kind to read, most recent first (default 20)`;

const DEFAULT_LIMIT = 20;

/** The facts of a made-up explanation, so --demo works with no traffic at all. */
const DEMO_FACTS: FileFacts = {
  path: "src/components/Button.tsx",
  lines: 42,
  role: "component",
  imports: [{ path: "src/lib/theme.ts", kinds: ["import"] }],
  importers: [{ path: "src/features/auth/LoginForm.tsx", kinds: ["import"] }],
};

const DEMO_INVENTED = "src/lib/nonexistent.ts";

function readLimit(args: readonly string[], fallback: number): number {
  const at = args.indexOf("--limit");
  if (at === -1) return fallback;

  const raw = args[at + 1];
  const value = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("--limit needs a positive whole number.");
  }
  return value;
}

function when(startedAt: number): string {
  return new Date(startedAt).toISOString().replace("T", " ").slice(0, 16);
}

function scoreExplanations(entries: readonly CheckedExplanation[]): {
  clean: number;
  failures: { token: string; entry: CheckedExplanation }[];
} {
  const failures: { token: string; entry: CheckedExplanation }[] = [];
  let clean = 0;

  for (const entry of entries) {
    const invented = findInventedPaths(entry.body, entry.shown);
    if (invented.length === 0) clean += 1;
    else for (const token of invented) failures.push({ token, entry });
  }

  return { clean, failures };
}

function demo(): void {
  const shown = new Set(pathTokens(filePrompt(DEMO_FACTS)));
  const body = [
    "A button component. It takes its colours from `src/lib/theme.ts` and is used by",
    "`src/features/auth/LoginForm.tsx`, with the shared styles coming from",
    `\`${DEMO_INVENTED}\`.`,
  ].join(" ");

  const invented = findInventedPaths(body, shown);
  const caught = invented.includes(DEMO_INVENTED);
  const falseAlarm = invented.filter((token) => token !== DEMO_INVENTED);

  console.log("");
  console.log("invented-path check — spliced example");
  console.log("");
  console.log("  explanation  three paths named, one of them invented");
  console.log(`  caught       ${caught ? DEMO_INVENTED : "nothing"}`);
  console.log(`  false alarm  ${falseAlarm.length === 0 ? "none" : falseAlarm.join(", ")}`);

  if (!caught) {
    throw new Error("The check did not catch a spliced path, so it cannot be trusted.");
  }
}

async function inventedPaths(args: readonly string[]): Promise<void> {
  if (args.includes("--demo")) {
    demo();
    return;
  }

  const client = evalClient();
  const project = tracingProject();
  const { checked, skipped } = await recentExplanations(client, project, readLimit(args, DEFAULT_LIMIT));

  if (checked.length === 0) {
    throw new Error(
      `No explanations are recorded in the "${project}" project. Explain some files in the ` +
        "app first, or run with --demo.",
    );
  }

  const { clean, failures } = scoreExplanations(checked);
  const score = (clean / checked.length) * 100;

  console.log("");
  console.log(`invented-path check — ${checked.length} explanations from "${project}"`);
  console.log("");
  console.log(`  checked      ${checked.length}`);
  console.log(`  clean        ${clean}`);
  console.log(`  flagged      ${checked.length - clean}`);
  console.log(`  score        ${score.toFixed(1)}%`);
  if (skipped.length > 0) console.log(`  skipped      ${skipped.length}`);

  if (failures.length > 0) {
    console.log("");
    console.log("  failures");
    for (const { token, entry } of failures) {
      console.log(`    ${token}   (${entry.kind}, ${when(entry.startedAt)})`);
      console.log(`      ${await runUrl(client, entry)}`);
    }
  }

  if (skipped.length > 0) {
    console.log("");
    console.log("  skipped runs");
    for (const run of skipped) console.log(`    ${run.name}  ${run.reason}  (${run.runId})`);
  }
}

export async function runEvals(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;

  switch (command) {
    case "invented-paths":
      return inventedPaths(rest);
    case "roles":
      return runRoleAccuracy(evalClient());
    case "prompts":
      return runPromptVersions(evalClient(), tracingProject(), readLimit(rest, DEFAULT_LIMIT));
    case undefined:
    case "--help":
    case "-h":
      console.log(USAGE);
      return;
    default:
      throw new Error(`Unknown command "${command}".\n\n${USAGE}`);
  }
}

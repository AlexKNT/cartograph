/**
 * The evaluation CLI.
 *
 * Every command prints a number and says what it is a number over. None of them
 * needs the app running; the live check needs only the traces the app already
 * wrote, and the role check needs nothing but the parser.
 */
import { filePrompt, type FileFacts } from "../ai/prompts.ts";
import { recentTurns, scoreTurns, turnUrl, type CheckedTurn } from "./agent.ts";
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
  node scripts/evals.ts agent [--limit N]            did the agent look, and did it talk about itself
  node scripts/evals.ts agent --demo                 score a spliced pair of turns

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

/** Two turns that hedge and one that does not, so --demo works with no traffic. */
const DEMO_TURNS: readonly CheckedTurn[] = [
  {
    runId: "",
    sessionId: null,
    traceId: null,
    question: "where is authentication handled?",
    lookups: ["find_files", "file_neighbours"],
    answer: "Authentication lives in `src/lib/auth.ts`, which `src/app/login/page.tsx` imports.",
    startedAt: 0,
  },
  {
    runId: "",
    sessionId: null,
    traceId: null,
    question: "is this code any good?",
    lookups: [],
    answer:
      "I cannot judge quality from a dependency graph. I can say what imports what, and what breaks if a file changes.",
    startedAt: 0,
  },
  {
    runId: "",
    sessionId: null,
    traceId: null,
    question: "summarise this repository",
    lookups: ["write_todos"],
    answer: "My tools were not needed: this looks like a well-organised service.",
    startedAt: 0,
  },
];

function agentDemo(): void {
  const score = scoreTurns(DEMO_TURNS);
  const hedge = score.hedged.find((turn) => turn.question === "summarise this repository");
  const plumbing = score.plumbing.find((entry) => entry.turn.question === "summarise this repository");
  const refusal =
    score.plumbing.find((entry) => entry.turn.question === "is this code any good?") ?? null;

  console.log("");
  console.log("agent check — spliced turns");
  console.log("");
  console.log("  looked       " + `${score.looked} of ${score.checked}`);
  console.log(`  hedged       ${hedge === undefined ? "nothing" : "\"" + hedge.question + "\""}`);
  console.log(`  plumbing     ${plumbing === undefined ? "nothing" : `"${plumbing.phrase}"`}`);
  console.log(`  refusal      ${refusal === null ? "read as the code's answer, not the agent's" : `flagged as "${refusal.phrase}"`}`);

  if (hedge === undefined) {
    throw new Error("The check did not catch an answer with no lookups behind it.");
  }
  if (plumbing === undefined) {
    throw new Error("The check did not catch an answer that talks about the agent's own plumbing.");
  }
  if (refusal !== null) {
    throw new Error("The check counted a refusal as plumbing, which would punish the right answer.");
  }
}

async function agent(args: readonly string[]): Promise<void> {
  if (args.includes("--demo")) {
    agentDemo();
    return;
  }

  const client = evalClient();
  const project = tracingProject();
  const { checked, skipped } = await recentTurns(client, project, readLimit(args, DEFAULT_LIMIT));

  if (checked.length === 0) {
    throw new Error(
      `No agent turns are recorded in the "${project}" project. Ask the repository something in ` +
        "the app first, or run with --demo.",
    );
  }

  const score = scoreTurns(checked);
  const lookedPercent = (score.looked / checked.length) * 100;

  console.log("");
  console.log(`agent check — ${checked.length} turns from "${project}"`);
  console.log("");
  console.log(`  checked      ${score.checked}`);
  console.log(`  looked       ${score.looked}`);
  console.log(`  looked %     ${lookedPercent.toFixed(1)}%`);
  console.log(`  hedged       ${score.hedged.length}`);
  console.log(`  plumbing     ${score.plumbing.length}`);
  if (skipped.length > 0) console.log(`  skipped      ${skipped.length}`);

  if (score.hedged.length > 0) {
    console.log("");
    console.log("  answered without looking");
    for (const turn of score.hedged) {
      console.log(`    ${when(turn.startedAt)}  "${turn.question}"`);
      const url = await turnUrl(client, turn);
      if (url !== "") console.log(`      ${url}`);
    }
  }

  if (score.plumbing.length > 0) {
    console.log("");
    console.log("  talked about itself");
    for (const { turn, phrase } of score.plumbing) {
      console.log(`    ${when(turn.startedAt)}  "${phrase}"  "${turn.question}"`);
      const url = await turnUrl(client, turn);
      if (url !== "") console.log(`      ${url}`);
    }
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
    case "agent":
      return agent(rest);
    case undefined:
    case "--help":
    case "-h":
      console.log(USAGE);
      return;
    default:
      throw new Error(`Unknown command "${command}".\n\n${USAGE}`);
  }
}

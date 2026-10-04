/**
 * Two explanation prompts, over one dataset, scored side by side.
 *
 * This comparison needs a model as judge and there is no way around it: "is
 * this specific enough to be useful" has no exact answer, unlike the
 * invented-path check. The score is a ranking aid, not ground truth — it is
 * printed with that said out loud rather than dressed up as harder than it is.
 *
 * The dataset is built from real explanations the app already answered: the
 * facts each was written from, and the answer itself as a reference. Both
 * prompts are then asked the same real questions, as two LangSmith experiments,
 * so the dashboard and this output agree on which is better and by how much.
 */
import type { Client } from "langsmith";
import { evaluate, type EvaluationResult, type EvaluatorT } from "langsmith/evaluation";
import type { ExampleCreate, KVMap } from "langsmith/schemas";
import { aiClient } from "../ai/client.ts";
import { askExplanation } from "../ai/model.ts";
import {
  EXPLAIN_SYSTEM,
  FILE_PROMPT_VERSION,
  MODEL,
  filePrompt,
  type FileFacts,
} from "../ai/prompts.ts";
import { datasetExamples, ensureDataset } from "./datasets.ts";
import { isFileFacts } from "./facts.ts";
import {
  RETIRED_EXPLAIN_SYSTEM,
  RETIRED_FILE_PROMPT_VERSION,
  retiredFilePrompt,
} from "./retired-prompts.ts";
import { recentExplanations } from "./traffic.ts";

const DATASET = "cartograph-explanations";
const DEFAULT_LIMIT = 20;

const JUDGE_SYSTEM = [
  "You compare one explanation of a code file against the facts it was written from.",
  "Score how specifically and usefully the explanation uses those facts, from 1 to 5.",
  "5 means it is grounded in the given connections and says what the file is for.",
  "1 means it is vague, generic, or describes code it was not shown.",
  'Do not reward length. Reply with JSON only: {"score": <number>, "why": "<one sentence>"}.',
].join("\n");

function parseScore(content: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const score = (parsed as Record<string, unknown>).score;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return Math.min(5, Math.max(1, score));
}

/**
 * The judge is a model judging a model. It is asked against the facts, not
 * against the file, because the explanation was never shown the file either.
 */
const judge: EvaluatorT = async ({ inputs, outputs }: KVMap): Promise<EvaluationResult> => {
  const body = typeof outputs?.body === "string" ? outputs.body : "";
  if (body === "") {
    return { key: "specificity", score: 1, comment: "the prompt produced nothing" };
  }

  const response = await aiClient().chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 80,
    store: false,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      {
        role: "user",
        content: [
          "Facts the explanation was given:",
          JSON.stringify(inputs?.facts, null, 2),
          "",
          "Explanation:",
          body,
        ].join("\n"),
      },
    ],
  });

  const score = parseScore(response.choices[0]?.message.content ?? "");
  return score === null
    ? { key: "specificity", comment: "the judge did not answer with a score" }
    : { key: "specificity", score };
};

interface ExplainInput {
  facts: FileFacts;
}

const currentTarget = async (input: ExplainInput): Promise<{ body: string }> => ({
  body: await askExplanation(EXPLAIN_SYSTEM, filePrompt(input.facts)),
});

const retiredTarget = async (input: ExplainInput): Promise<{ body: string }> => ({
  body: await askExplanation(RETIRED_EXPLAIN_SYSTEM, retiredFilePrompt(input.facts)),
});

/** The number of examples in the shared dataset, built from real traffic once. */
async function explanationDataset(
  client: Client,
  project: string,
  limit: number,
): Promise<number> {
  let count = (await datasetExamples(client, DATASET)).length;
  if (count > 0) return count;

  const { checked } = await recentExplanations(client, project, limit);
  const uploads: ExampleCreate[] = [];
  for (const entry of checked) {
    if (entry.kind !== "file" || !isFileFacts(entry.facts)) continue;
    uploads.push({ inputs: { facts: entry.facts }, outputs: { reference: entry.body } });
  }

  if (uploads.length === 0) {
    throw new Error(
      `No file explanations are recorded in "${project}", so "${DATASET}" cannot be built. ` +
        "Explain some files in the app first.",
    );
  }

  await ensureDataset(
    client,
    DATASET,
    "Real file explanations, kept as the facts each was written from plus the answer itself.",
    uploads,
  );

  count = (await datasetExamples(client, DATASET)).length;
  if (count === 0) {
    throw new Error(`"${DATASET}" was created but holds no examples.`);
  }
  return count;
}

type Experiment = Awaited<ReturnType<typeof evaluate>>;

async function meanScore(experiment: Experiment): Promise<{ mean: number; graded: number }> {
  let total = 0;
  let graded = 0;

  for (const row of experiment.results) {
    for (const result of row.evaluationResults.results) {
      if (result.key !== "specificity" || typeof result.score !== "number") continue;
      total += result.score;
      graded += 1;
    }
  }

  return { mean: graded === 0 ? 0 : total / graded, graded };
}

export async function runPromptVersions(
  client: Client,
  project: string,
  limit: number = DEFAULT_LIMIT,
): Promise<void> {
  const count = await explanationDataset(client, project, limit);

  const current = await evaluate(currentTarget, {
    data: DATASET,
    client,
    experimentPrefix: "explain-current",
    maxConcurrency: 3,
    evaluators: [judge],
  });
  const retired = await evaluate(retiredTarget, {
    data: DATASET,
    client,
    experimentPrefix: "explain-retired",
    maxConcurrency: 3,
    evaluators: [judge],
  });

  const currentScore = await meanScore(current);
  const retiredScore = await meanScore(retired);
  const difference = currentScore.mean - retiredScore.mean;
  const better =
    difference > 0
      ? `the current prompt (${FILE_PROMPT_VERSION}) by ${difference.toFixed(2)}`
      : difference < 0
        ? `the retired prompt (${RETIRED_FILE_PROMPT_VERSION}) by ${Math.abs(difference).toFixed(2)}`
        : "neither — the two scored level";

  console.log("");
  console.log(`prompt versions — ${DATASET} (${count} examples)`);
  console.log("");
  console.log(`  current    ${FILE_PROMPT_VERSION.padEnd(16)}${currentScore.mean.toFixed(2)}`);
  console.log(`  retired    ${RETIRED_FILE_PROMPT_VERSION.padEnd(16)}${retiredScore.mean.toFixed(2)}`);
  console.log(`  better     ${better}`);
  console.log("");
  console.log("  A model judged this, not arithmetic: the score ranks the two prompts and is");
  console.log("  not ground truth. The invented-path check is the exact half of the evals.");
  console.log("");
  console.log(`  dataset    ${await client.getDatasetUrl({ datasetName: DATASET })}`);
  console.log(`  current    ${await client.getProjectUrl({ projectName: current.experimentName })}`);
  console.log(`  retired    ${await client.getProjectUrl({ projectName: retired.experimentName })}`);
}

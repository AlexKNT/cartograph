/**
 * Role accuracy, over a set convention already labelled.
 *
 * Convention decides a role from the path with certainty, and those files never
 * reach the classifier in normal operation — so they are a held-out set with
 * ground truth rather than the model marking its own homework. The role is
 * hidden from the model by construction: the classification prompt carries
 * paths and nothing else.
 *
 * Runs as a LangSmith experiment so the number sits in a dashboard beside the
 * prompt comparison, and prints the same number here so a check does not
 * require a browser.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Client } from "langsmith";
import { evaluate, type EvaluationResult, type EvaluatorT } from "langsmith/evaluation";
import type { KVMap } from "langsmith/schemas";
import { classifyPaths } from "../ai/model.ts";
import { CLASSIFIABLE_ROLE_IDS } from "../graph/rail.ts";
import { parseRepository } from "../parser/index.ts";
import { datasetExamples, ensureDataset } from "./datasets.ts";
import { ROLE_FIXTURE } from "./roles-fixture.ts";

const DATASET = "cartograph-role-accuracy";

/** The phase asks for a dataset of at least thirty files; short is a failure. */
const MINIMUM = 30;

export interface RoleTruth {
  path: string;
  role: string;
}

/**
 * Writes the fixture to a temporary directory and reads it with the real
 * parser, so the label comes from convention rather than from this file.
 */
export async function roleGroundTruth(): Promise<RoleTruth[]> {
  const directory = await mkdtemp(join(tmpdir(), "cartograph-roles-"));

  try {
    for (const file of ROLE_FIXTURE) {
      const absolute = join(directory, file.path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, file.text, "utf8");
    }

    return parseRepository(directory)
      .roles.filter((role) => CLASSIFIABLE_ROLE_IDS.includes(role.role))
      .map((role) => ({ path: role.file, role: role.role }))
      .sort((left, right) => (left.path < right.path ? -1 : 1));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const roleMatch: EvaluatorT = ({ outputs, referenceOutputs }: KVMap): EvaluationResult => {
  const expected = referenceOutputs?.role;
  const answered = outputs?.role;
  const correct = typeof expected === "string" && answered === expected;

  return {
    key: "role",
    score: correct ? 1 : 0,
    comment: correct ? undefined : `answered ${String(answered)}, convention said ${String(expected)}`,
  };
};

export async function runRoleAccuracy(client: Client): Promise<void> {
  const truth = await roleGroundTruth();
  if (truth.length < MINIMUM) {
    throw new Error(
      `The fixture produced ${truth.length} files with a role the classifier may answer; ` +
        `the check needs at least ${MINIMUM}, so something is wrong with the fixture or the parser.`,
    );
  }

  await ensureDataset(
    client,
    DATASET,
    "Files whose framework convention assigned a role the classifier may also answer, held out from the classifier in normal operation.",
    truth.map((item) => ({ inputs: { path: item.path }, outputs: { role: item.role } })),
  );

  const examples = await datasetExamples(client, DATASET);
  if (examples.length < MINIMUM) {
    throw new Error(
      `The dataset "${DATASET}" holds ${examples.length} examples; the check needs at least ${MINIMUM}.`,
    );
  }

  const experiment = await evaluate(
    async (input: { path: string }) => ({
      role: (await classifyPaths([input.path])).get(input.path) ?? "unknown",
    }),
    {
      data: DATASET,
      client,
      experimentPrefix: "role-accuracy",
      maxConcurrency: 4,
      evaluators: [roleMatch],
    },
  );

  let correct = 0;
  let total = 0;
  for (const row of experiment.results) {
    for (const result of row.evaluationResults.results) {
      if (result.key !== "role" || typeof result.score !== "number") continue;
      total += 1;
      if (result.score === 1) correct += 1;
    }
  }

  const percent = total === 0 ? 0 : (correct / total) * 100;
  const datasetUrl = await client.getDatasetUrl({ datasetName: DATASET });
  const experimentUrl = await client.getProjectUrl({ projectName: experiment.experimentName });

  console.log("");
  console.log(`role accuracy — ${DATASET} (${examples.length} held-out files)`);
  console.log("");
  console.log(`  correct      ${correct} / ${total}`);
  console.log(`  accuracy     ${percent.toFixed(1)}%`);
  console.log(`  experiment   ${experimentUrl}`);
  console.log(`  dataset      ${datasetUrl}`);
}

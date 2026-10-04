/**
 * Datasets, reused rather than rebuilt.
 *
 * Two experiments over "the same dataset" only compare if it is literally the
 * same set of examples, so a dataset is created once and returned as it stands
 * on every later run. Re-uploading would quietly change the denominator between
 * two experiments and make the side-by-side a comparison of two things.
 */
import type { Client } from "langsmith";
import type { Dataset, Example, ExampleCreate } from "langsmith/schemas";

export async function ensureDataset(
  client: Client,
  name: string,
  description: string,
  uploads: readonly ExampleCreate[],
): Promise<Dataset> {
  for await (const dataset of client.listDatasets({ datasetName: name })) {
    if (dataset.name !== name) continue;
    // An empty dataset is a half-finished first run, not an answer; fill it.
    if ((await datasetExamples(client, name)).length > 0) return dataset;
    await upload(client, dataset.id, uploads);
    return dataset;
  }

  const dataset = await client.createDataset(name, { description });
  await upload(client, dataset.id, uploads);
  return dataset;
}

async function upload(
  client: Client,
  datasetId: string,
  uploads: readonly ExampleCreate[],
): Promise<void> {
  if (uploads.length === 0) return;
  await client.createExamples(
    uploads.map((upload) => ({ ...upload, dataset_id: datasetId })),
  );
}

export async function datasetExamples(client: Client, name: string): Promise<Example[]> {
  const examples: Example[] = [];
  for await (const example of client.listExamples({ datasetName: name })) {
    examples.push(example);
  }
  return examples;
}

/**
 * Whether an explanation still describes what is on GitHub.
 *
 * A cached explanation is only worth keeping if it is still about the
 * repository the reader is looking at, so the stored content hash is checked
 * against the file as it is now, and the commit the run read is checked against
 * the commit at the head. Both answers are factual: the file's bytes are hashed
 * with the same function the parser used, and "the head moved" is GitHub's own
 * answer rather than an inference.
 *
 * Server side: this is where the network and the row it reads live.
 */

import type { RepositoryRef } from "./url.ts";
import { fileBytesAt, headCommit } from "./fetch.ts";
import { contentHashOf } from "../parser/index.ts";

export type Staleness =
  /** The run's commit is still the head. */
  | { kind: "current" }
  /** The file is there and its bytes differ from the ones the run read. */
  | { kind: "file-changed" }
  /** The file is not in the repository any more. */
  | { kind: "file-gone" }
  /** The head moved, and this file is byte-for-byte the one that was read. */
  | { kind: "repository-moved" };

export async function repositoryStaleness(
  ref: RepositoryRef,
  branch: string | null,
  commitSha: string,
): Promise<Staleness> {
  const head = await headCommit(ref, branch);
  return head === commitSha ? { kind: "current" } : { kind: "repository-moved" };
}

export async function fileStaleness(
  ref: RepositoryRef,
  branch: string | null,
  commitSha: string,
  path: string,
  storedHash: string,
): Promise<Staleness> {
  const head = await headCommit(ref, branch);
  if (head === commitSha) return { kind: "current" };

  const bytes = await fileBytesAt(ref, head, path);
  if (bytes === null) return { kind: "file-gone" };
  return contentHashOf(bytes) === storedHash
    ? { kind: "repository-moved" }
    : { kind: "file-changed" };
}

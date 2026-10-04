/**
 * Which conversation a turn belongs to.
 *
 * A conversation is derived from the asker and the analysis, never handed in by
 * the browser. A client-supplied thread id would let someone continue a
 * conversation that is not theirs, and on a runtime with no per-user isolation
 * that means reading somebody else's turns. Deriving it means the same person
 * asking about the same analysis lands in the same conversation every time, and
 * nobody can land in anyone else's.
 */

import { createHash } from "node:crypto";

export function derivedThreadId(
  organizationId: string,
  userId: string,
  analysisId: string,
): string {
  const digest = createHash("sha256")
    .update(`${organizationId}\u0000${userId}\u0000${analysisId}`)
    .digest();

  const bytes = digest.subarray(0, 16);
  // A v5-shaped uuid: the runtime wants a uuid, and a hash formatted as one is
  // stable across processes.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

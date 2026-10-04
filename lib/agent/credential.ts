/**
 * The signed credential the agent's tools read with.
 *
 * It names exactly one analysis and the organization it belongs to, and it
 * carries the asker's own short-lived, org-scoped Supabase token. The signature
 * is ours, so the analysis cannot be swapped for another by anything the agent
 * reads; the token is the caller's, so nothing in this system holds a key that
 * bypasses row-level security. A read still only returns rows the policy allows.
 *
 * Server only: it uses the app secret and must never reach a browser.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "../env.ts";

export interface AgentCredential {
  /** The one analysis this credential may read. */
  analysisId: string;
  /** The organization that analysis belongs to, as the row records it. */
  organizationId: string;
  /** The asker's own Supabase token, which the read runs under. */
  token: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

const VERSION = "v1";

function signingSecret(): string {
  return requireEnv("AGENT_CREDENTIAL_SECRET", process.env.AGENT_CREDENTIAL_SECRET);
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

/** The signature covers the version, so a future format cannot be read as this one. */
function signature(payload: string): string {
  return createHmac("sha256", signingSecret()).update(`${VERSION}.${payload}`).digest("base64url");
}

export function mintCredential(input: {
  analysisId: string;
  organizationId: string;
  token: string;
  ttlSeconds: number;
}): string {
  const payload = encode(
    JSON.stringify({
      analysisId: input.analysisId,
      organizationId: input.organizationId,
      token: input.token,
      expiresAt: Date.now() + input.ttlSeconds * 1000,
    }),
  );
  return `${VERSION}.${payload}.${signature(payload)}`;
}

function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** The credential a request carried, or null when it is not ours or is spent. */
export function verifyCredential(raw: string): AgentCredential | null {
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;

  const [, payload, provided] = parts;
  if (payload === undefined || provided === undefined) return null;

  const given = Buffer.from(provided, "base64url");
  const wanted = Buffer.from(signature(payload), "base64url");
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(decode(payload));
  } catch {
    return null;
  }

  const analysisId = fieldOf(claims, "analysisId");
  const organizationId = fieldOf(claims, "organizationId");
  const token = fieldOf(claims, "token");
  const expiresAt = fieldOf(claims, "expiresAt");
  if (!isText(analysisId) || !isText(organizationId) || !isText(token)) return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;
  if (expiresAt <= Date.now()) return null;

  return { analysisId, organizationId, token, expiresAt };
}

function tokenClaims(token: string): unknown {
  const payload = token.split(".")[1];
  if (payload === undefined) return null;

  try {
    return JSON.parse(decode(payload)) as unknown;
  } catch {
    return null;
  }
}

/**
 * The organization a Supabase token names. The token's signature is checked by
 * Postgres, not here; this only lets the surface confirm that the token and the
 * credential agree about which organization is being read.
 */
export function organizationFromToken(token: string): string | null {
  const organizationId = fieldOf(tokenClaims(token), "org_id");
  return isText(organizationId) ? organizationId : null;
}

/**
 * When a token expires, in epoch milliseconds, read so a credential is never
 * asked to outlive the token inside it. Unverified on purpose: the signature is
 * Postgres's to check, and this only decides how long our own signature is good
 * for.
 */
export function expiryOfToken(token: string): number | null {
  const exp = fieldOf(tokenClaims(token), "exp");
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  return exp * 1000;
}

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env, SUPABASE_JWT_TEMPLATE } from "@/lib/env";
import { assertServerEnv } from "@/lib/env.server";

// Server-side reads and writes go through here. The token comes from the
// session, so row-level security sees the same organization the UI is showing.
// Nothing filters by organization in application code — that is the policy's
// job.
export function createServerSupabaseClient(): SupabaseClient {
  assertServerEnv();

  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    accessToken: async () => {
      const { getToken } = await auth();
      return (await getToken({ template: SUPABASE_JWT_TEMPLATE })) ?? null;
    },
  });
}

/**
 * The same client, reading under a token that was handed to it rather than one
 * read from a session. This is what the agent's tools surface uses: the token
 * is the asker's own org-scoped one, carried inside the signed credential, so
 * the policy still decides what comes back and no key here can read past it.
 */
export function createSupabaseClientWithToken(accessToken: string): SupabaseClient {
  assertServerEnv();

  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    accessToken: async () => accessToken,
  });
}

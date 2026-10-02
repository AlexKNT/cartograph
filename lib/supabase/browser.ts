"use client";

import { useSession } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import { env, SUPABASE_JWT_TEMPLATE } from "@/lib/env";

// Supabase never owns a session here — Clerk does, and passing `accessToken`
// turns off its own auth namespace. Every request carries the token, so a
// policy reading the organization claim has something to read.
export function useSupabaseClient(): SupabaseClient {
  const { session } = useSession();

  return useMemo(
    () =>
      createClient(env.supabaseUrl, env.supabasePublishableKey, {
        accessToken: async () =>
          (await session?.getToken({ template: SUPABASE_JWT_TEMPLATE })) ?? null,
      }),
    [session],
  );
}

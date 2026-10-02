import { requireEnv } from "@/lib/env";

// Called from instrumentation.ts, so a missing secret fails at startup instead
// of on the first request that happens to need it.
export function assertServerEnv(): void {
  requireEnv("CLERK_SECRET_KEY", process.env.CLERK_SECRET_KEY);
  requireEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

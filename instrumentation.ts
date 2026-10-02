import { assertServerEnv } from "@/lib/env.server";

// Runs once before the server accepts a request, which is where a missing
// environment variable should surface.
export function register(): void {
  assertServerEnv();
}

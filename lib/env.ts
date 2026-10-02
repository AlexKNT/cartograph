// Every environment value is read in one of these two files, and a missing one
// stops the server rather than turning into a confusing error three screens
// later. Values are read with a literal `process.env.X` because that is the
// only form Next inlines into the browser bundle.

export function requireEnv(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing environment variable ${name}. Add it to .env.local.`);
  }
  return value;
}

// Safe in the browser: NEXT_PUBLIC_ values are inlined at build time.
export const env = {
  supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: requireEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
};

// The JWT template Clerk mints for Supabase. It exists on the instance, not in
// code, and carries the organization claim the policies read.
export const SUPABASE_JWT_TEMPLATE = "supabase";

"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { parseRepositoryUrl } from "@/lib/analysis/url";

// The hero's first job is to keep the pasted repository, not to sign someone
// in: the URL is validated here, handed to sign-in as the place to come back
// to, and picked up again by the run that only a signed-in workspace can start.
// A "use server" module may only export async functions, so the state stays
// private and the form derives it from what this returns.

type LandingState = { status: "idle" } | { status: "error"; message: string };

export async function startFromLanding(
  _previous: LandingState,
  formData: FormData,
): Promise<LandingState> {
  const parsed = parseRepositoryUrl(String(formData.get("url") ?? ""));
  if (!parsed.ok) return { status: "error", message: parsed.message };

  // One level of encoding per level of navigation: the sign-in screen returns
  // to `/start`, and `/start` is where the canonical URL is carried.
  const continuation = `/start?url=${encodeURIComponent(parsed.ref.url)}`;

  const { userId } = await auth();
  if (userId === null) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(continuation)}`);
  }

  // Already signed in — a stale landing tab, or a second paste — goes straight
  // to the same continuation sign-in would have used.
  redirect(continuation);
}

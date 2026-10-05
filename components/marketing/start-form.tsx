"use client";

import { useActionState } from "react";
import { startFromLanding } from "@/lib/actions/landing";

type LandingState = Awaited<ReturnType<typeof startFromLanding>>;

const INITIAL_LANDING_STATE: LandingState = { status: "idle" };

/**
 * The hero is the product, so this is the dashboard's form wearing the landing
 * page's proportions: the same paste, the same validation, and for a signed-out
 * visitor the same trip through sign-in first.
 */
export function StartForm() {
  const [state, formAction, pending] = useActionState(startFromLanding, INITIAL_LANDING_STATE);

  return (
    <form action={formAction} className="mt-10 max-w-[42rem]">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="url"
          required
          placeholder="https://github.com/owner/repo"
          aria-label="Public repository URL"
          className="h-11 min-w-0 flex-1 rounded border border-border bg-surface px-3 font-mono text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-11 shrink-0 rounded bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "starting…" : "map it"}
        </button>
      </div>
      {state.status === "error" && (
        <p className="mt-2 font-mono text-[11px] text-outgoing">{state.message}</p>
      )}
    </form>
  );
}

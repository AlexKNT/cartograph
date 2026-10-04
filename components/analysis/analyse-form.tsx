"use client";

import { useActionState } from "react";
import { analyseRepository } from "@/lib/actions/analyse";

type AnalyseState = Awaited<ReturnType<typeof analyseRepository>>;

const INITIAL_ANALYSE_STATE: AnalyseState = { status: "idle" };

/** The dashboard used to end in a sentence saying nothing was behind it yet. */
export function AnalyseForm() {
  const [state, formAction, pending] = useActionState(analyseRepository, INITIAL_ANALYSE_STATE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input
        type="text"
        name="url"
        required
        placeholder="https://github.com/owner/repo"
        aria-label="Public repository URL"
        className="h-7 w-80 rounded border border-border bg-surface px-1.5 font-mono text-[11px] placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-7 rounded border border-border px-2 text-[11px] text-foreground hover:border-accent disabled:text-muted"
      >
        {pending ? "starting" : "analyse"}
      </button>
      {state.status === "error" && (
        <span className="font-mono text-[11px] text-outgoing">{state.message}</span>
      )}
    </form>
  );
}

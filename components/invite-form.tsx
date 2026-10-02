"use client";

import { useActionState } from "react";
import { inviteMember } from "@/lib/actions/invite";

type InviteState = Awaited<ReturnType<typeof inviteMember>>;

const INITIAL_INVITE_STATE: InviteState = { status: "idle" };

export function InviteForm() {
  const [state, formAction, pending] = useActionState(inviteMember, INITIAL_INVITE_STATE);

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input
        type="email"
        name="email"
        required
        placeholder="teammate@company.com"
        aria-label="Email address to invite"
        className="h-7 w-44 rounded border border-border bg-surface px-1.5 font-mono text-[11px] placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <select
        name="role"
        defaultValue="org:member"
        aria-label="Role"
        className="h-7 rounded border border-border bg-surface px-1 text-[11px] focus:border-accent focus:outline-none"
      >
        <option value="org:member">member</option>
        <option value="org:admin">admin</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="h-7 rounded border border-border px-2 text-[11px] text-foreground hover:border-accent disabled:text-muted"
      >
        {pending ? "sending" : "invite"}
      </button>
      {state.status === "sent" && (
        <span className="font-mono text-[11px] text-muted">sent to {state.email}</span>
      )}
      {state.status === "error" && (
        <span className="font-mono text-[11px] text-foreground">{state.message}</span>
      )}
    </form>
  );
}

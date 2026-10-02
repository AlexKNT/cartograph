import { auth } from "@clerk/nextjs/server";

// Read from the session token, not from the browser: the identity provider is
// never asked a question at render time, and the claim is there on first paint.
export default async function WorkspacePage() {
  const { userId, orgId } = await auth();

  return (
    <div className="p-4">
      <h1 className="text-sm font-medium">Workspace</h1>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
        <dt className="text-muted">signed in as</dt>
        <dd>{userId}</dd>
        <dt className="text-muted">organization</dt>
        <dd>{orgId ?? "none on this session"}</dd>
      </dl>
    </div>
  );
}

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { InviteForm } from "@/components/invite-form";
import { ThemeControl } from "@/components/theme-control";
import { isTheme, THEME_COOKIE } from "@/lib/theme";

// The shell every later phase renders inside: what you're looking at, which
// team it belongs to, and the controls that change either.
export default async function WorkspaceLayout({ children }: LayoutProps<"/">) {
  const { has } = await auth();
  // System permissions live on the identity provider, not in the session
  // claims, so the server gates on the default admin role.
  const canInvite = has({ role: "org:admin" });

  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(stored) ? stored : "system";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-2 py-1.5">
        <span className="font-mono text-[11px] font-medium tracking-tight">cartograph</span>
        <OrganizationSwitcher hidePersonal />
        {canInvite && <InviteForm />}
        <div className="ml-auto flex items-center gap-2">
          <ThemeControl initialTheme={theme} />
          <UserButton />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}

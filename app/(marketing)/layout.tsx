import Link from "next/link";
import { cookies } from "next/headers";
import { ThemeControl } from "@/components/theme-control";
import { isTheme, THEME_COOKIE } from "@/lib/theme";

// The chrome around the landing page. It is the product's own header, made
// roomier: the same name, the same theme control, and one way in.
export default async function MarketingLayout({ children }: LayoutProps<"/">) {
  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(stored) ? stored : "system";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-[1140px] items-center gap-3 px-6 py-3">
          <Link href="/" className="font-mono text-[12px] font-medium tracking-tight">
            cartograph
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ThemeControl initialTheme={theme} />
            <Link
              href="/sign-in"
              className="rounded border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-foreground"
            >
              sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1140px] flex-wrap items-baseline gap-x-2 gap-y-1 px-6 py-8 font-mono text-[11px] text-muted">
          <span className="text-foreground">cartograph</span>
          <span>a dependency map built from really parsing the code</span>
        </div>
      </footer>
    </div>
  );
}

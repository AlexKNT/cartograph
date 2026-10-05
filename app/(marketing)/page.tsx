import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { StartForm } from "@/components/marketing/start-form";
import {
  FoldedMap,
  FrameworkLayers,
  ParsePipeline,
} from "@/components/marketing/illustrations";

// The landing page is for people without a session; a signed-in visitor is
// sent to the workspace rather than shown a sign-in button they don't need.
export default async function LandingPage() {
  const { userId } = await auth();
  if (userId !== null) redirect("/dashboard");

  return (
    <>
      <section className="mx-auto flex min-h-[80vh] w-full max-w-[1140px] flex-col justify-center px-6 py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          dependency maps, parsed not guessed
        </p>
        <h1 className="mt-5 max-w-[16ch] text-balance text-[clamp(2.25rem,6vw,4rem)] font-medium leading-[1.05] tracking-[-0.03em]">
          See the shape of a codebase you didn&apos;t write.
        </h1>
        <p className="mt-6 max-w-[64ch] text-base leading-relaxed text-muted">
          Paste a public GitHub repository. Cartograph reads every file, resolves what imports
          what, and draws it — folders as boxes, imports as lines. The model explains the map;
          it never decides what is on it.
        </p>
        <StartForm />
      </section>

      <section className="border-t border-border">
        <div className="mx-auto grid w-full max-w-[1140px] items-center gap-20 px-6 py-32 lg:grid-cols-2">
          <div>
            <h2 className="max-w-[20ch] text-balance text-[clamp(1.5rem,3vw,2rem)] font-medium leading-[1.1] tracking-[-0.02em]">
              A map of what imports what
            </h2>
            <p className="mt-5 max-w-[46ch] text-sm leading-relaxed text-muted">
              Open a folder into its files. Select one and see what it imports, what imports it,
              and what breaks if it changes. Fan-in and fan-out are counted from the resolved
              edges, not estimated.
            </p>
          </div>
          <FoldedMap />
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto grid w-full max-w-[1140px] items-center gap-20 px-6 py-32 lg:grid-cols-2">
          <div className="lg:order-2">
            <h2 className="max-w-[20ch] text-balance text-[clamp(1.5rem,3vw,2rem)] font-medium leading-[1.1] tracking-[-0.02em]">
              Parsed first, drawn second
            </h2>
            <p className="mt-5 max-w-[46ch] text-sm leading-relaxed text-muted">
              Every file goes through a real TypeScript parser. Plain imports, re-exports,
              dynamic imports and <code className="font-mono text-foreground">require()</code>{" "}
              become edges — but only when the import resolves to a file that is really there.
            </p>
            <p className="mt-4 max-w-[46ch] text-sm leading-relaxed text-muted">
              What cannot be resolved is reported with a reason and counted, so an incomplete map
              says it is incomplete.
            </p>
          </div>
          <div className="lg:order-1">
            <ParsePipeline />
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto grid w-full max-w-[1140px] items-center gap-20 px-6 py-32 lg:grid-cols-2">
          <div>
            <h2 className="max-w-[20ch] text-balance text-[clamp(1.5rem,3vw,2rem)] font-medium leading-[1.1] tracking-[-0.02em]">
              It reads the framework, too
            </h2>
            <p className="mt-5 max-w-[46ch] text-sm leading-relaxed text-muted">
              Next.js routes, NestJS controllers and services, React components and hooks,
              Express routers. Each gets its own roles and, where the syntax gives an exact
              method and path, a route table.
            </p>
            <p className="mt-4 max-w-[46ch] text-sm leading-relaxed text-muted">
              A repository that matches none of them still gets a graph: every TypeScript and
              JavaScript file it can find, by kind.
            </p>
          </div>
          <FrameworkLayers />
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-[1140px] px-6 py-32">
          <h2 className="max-w-[20ch] text-balance text-[clamp(1.5rem,3vw,2rem)] font-medium leading-[1.1] tracking-[-0.02em]">
            What it deliberately won&apos;t do
          </h2>
          <p className="mt-5 max-w-[64ch] text-sm leading-relaxed text-muted">
            No scores, grades or severity badges — this explains a codebase, it does not review
            one. No guessed edges: an unresolved import is reported, never approximated. No
            approximate routes: if a method and a full path can&apos;t both be recovered, nothing
            is shown. No private repositories. No languages beyond TypeScript and JavaScript.
          </p>
          <p className="mt-4 max-w-[64ch] text-sm leading-relaxed text-muted">
            And the model never walks the graph itself. It picks a starting point, and the same
            arithmetic that draws the canvas does the walking.
          </p>
        </div>
      </section>
    </>
  );
}

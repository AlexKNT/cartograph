import type { FileCategory } from "@/lib/graph/types";

// The only place a category's colour is written down. Each is a literal class
// so Tailwind can see it; the tokens live in globals.css with the rest.
const SWATCH: Record<FileCategory, string> = {
  source: "bg-kind-source",
  test: "bg-kind-test",
  barrel: "bg-kind-barrel",
  declaration: "bg-kind-declaration",
};

export function CategorySwatch({ swatch }: { swatch: FileCategory | null }) {
  if (swatch === null) return null;
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-[1px] ${SWATCH[swatch]}`}
    />
  );
}

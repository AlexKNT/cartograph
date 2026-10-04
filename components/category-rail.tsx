import { CategorySwatch } from "@/components/category-swatch";
import type { CategoryTotal, MapSummary } from "@/lib/graph/types";

/**
 * The left rail. What the map is of, then the categories the framework puts
 * its files in: a swatch, a name, and how many files are in it. The names are
 * the framework's own — a NestJS repository says Controllers, not Entry points.
 * A category is a filter, not a cut: clicking one dims everything that is not
 * in it and leaves the rest of the picture where it was. Clicking it again
 * lets go.
 */
export function CategoryRail({
  summary,
  counts,
  active,
  onCategory,
}: {
  summary: MapSummary;
  /** The rail's categories that have files, already in reading order. */
  counts: readonly CategoryTotal[];
  active: string | null;
  onCategory: (category: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-2">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[11px]">{summary.repository}</span>
        <span className="font-mono text-[11px] text-muted">
          {summary.framework === "none" ? "no framework" : summary.framework}
        </span>
        <span className="font-mono text-[11px] text-muted">
          {summary.fileCount} files · {summary.nodeCount} nodes
        </span>
        <span className="font-mono text-[11px] text-muted">folded at {summary.threshold}</span>
      </div>

      <ul className="flex flex-col gap-0.5">
        {counts.map(({ id, label, swatch, count }) => {
          const here = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onCategory(here ? null : id)}
                className={`flex w-full items-center gap-1.5 rounded-[2px] px-1 py-0.5 text-left ${
                  here ? "bg-accent/10 text-accent" : "hover:bg-background"
                }`}
              >
                <CategorySwatch swatch={swatch} />
                <span className="flex-1 text-[11px]">{label}</span>
                <span className="font-mono text-[11px] text-muted">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

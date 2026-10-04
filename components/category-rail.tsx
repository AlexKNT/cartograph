import { CategorySwatch } from "@/components/category-swatch";
import type { FileCategory, MapSummary } from "@/lib/graph/types";

/**
 * The left rail. What the map is of, then the categories of file in it: a
 * swatch, a name, and how many files are in it. A category is a filter, not a
 * cut: clicking one dims everything that is not that kind of file and leaves
 * the rest of the picture where it was. Clicking it again lets go.
 */
export function CategoryRail({
  summary,
  active,
  onCategory,
}: {
  summary: MapSummary;
  active: FileCategory | null;
  onCategory: (category: FileCategory | null) => void;
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
        {summary.categories.map(({ category, count }) => {
          const here = active === category;
          return (
            <li key={category}>
              <button
                type="button"
                onClick={() => onCategory(here ? null : category)}
                className={`flex w-full items-center gap-1.5 rounded-[2px] px-1 py-0.5 text-left ${
                  here ? "bg-accent/10 text-accent" : "hover:bg-background"
                }`}
              >
                <CategorySwatch category={category} />
                <span className="flex-1 text-[11px]">{category}</span>
                <span className="font-mono text-[11px] text-muted">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

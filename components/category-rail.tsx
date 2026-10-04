import { CategorySwatch } from "@/components/category-swatch";
import type { MapSummary } from "@/lib/graph/types";

/**
 * The left rail. What the map is of, then the categories of file in it: a
 * swatch, a name, and how many files are in it. Nothing here is clickable yet.
 */
export function CategoryRail({ summary }: { summary: MapSummary }) {
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
        {summary.categories.map(({ category, count }) => (
          <li key={category} className="flex items-center gap-1.5">
            <CategorySwatch category={category} />
            <span className="flex-1 text-[11px]">{category}</span>
            <span className="font-mono text-[11px] text-muted">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

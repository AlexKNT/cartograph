import { CategoryRail } from "@/components/category-rail";
import { DependencyCanvas } from "@/components/graph/dependency-canvas";
import { MapShell } from "@/components/map-shell";
import { countCategories } from "@/lib/graph/categories";
import { foldFiles } from "@/lib/graph/fold";
import type { MapSummary } from "@/lib/graph/types";
import { parsed } from "@/lib/preview/mobx";

/**
 * Scaffolding for this phase: a repository the parser really ran over, checked
 * in as data, so the canvas can be built without an account, a database or a
 * network. It goes away once analyses are stored properly.
 */
export default function PreviewPage() {
  const fold = foldFiles(parsed.files, parsed.edges);

  const summary: MapSummary = {
    repository: parsed.repository.name,
    framework: parsed.repository.framework,
    fileCount: parsed.stats.filesParsed,
    nodeCount: fold.nodes.length,
    threshold: fold.threshold,
    categories: countCategories(parsed.files),
  };

  return (
    <div className="flex h-dvh flex-col">
      <MapShell rail={<CategoryRail summary={summary} />}>
        <DependencyCanvas fold={fold} edges={parsed.edges} />
      </MapShell>
    </div>
  );
}

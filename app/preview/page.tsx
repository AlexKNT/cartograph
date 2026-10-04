import { Explorer } from "@/components/graph/explorer";
import { countCategories } from "@/lib/graph/categories";
import { foldFiles } from "@/lib/graph/fold";
import type { MapSummary, RepositoryFacts } from "@/lib/graph/types";
import { parsed } from "@/lib/preview/mobx";

/**
 * Scaffolding for this phase: a repository the parser really ran over, checked
 * in as data, so the map and the pane can be built without an account, a
 * database or a network. It goes away once analyses are stored properly.
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

  const facts: RepositoryFacts = {
    repository: parsed.repository.name,
    framework: parsed.repository.framework,
    fileCount: parsed.stats.filesParsed,
    importCount: parsed.stats.importsSeen,
    edgeCount: parsed.stats.edges,
  };

  return (
    <div className="flex h-dvh flex-col">
      <Explorer
        fold={fold}
        files={parsed.files}
        edges={parsed.edges}
        summary={summary}
        facts={facts}
      />
    </div>
  );
}

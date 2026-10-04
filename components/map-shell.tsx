import type { ReactNode } from "react";

/**
 * The three columns, settled here: a narrow rail, the map filling the middle,
 * and the detail pane. Later phases fill these; none of them moves, and the
 * detail pane is a column from the start rather than a drawer that becomes one.
 */
export function MapShell({
  rail,
  map,
  pane,
}: {
  rail: ReactNode;
  map: ReactNode;
  pane: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="w-44 shrink-0 overflow-y-auto border-r border-border bg-surface">
        {rail}
      </aside>

      <div className="relative min-h-0 min-w-0 flex-1">{map}</div>

      <aside className="flex min-h-0 w-72 shrink-0 flex-col overflow-hidden border-l border-border bg-surface">
        {pane}
      </aside>
    </div>
  );
}

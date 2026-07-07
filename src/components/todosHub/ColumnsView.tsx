import React, { useEffect, useState } from 'react';
import { Column, ColumnContext } from './Column';

// The Finder-style columns view: a horizontal strip of columns, each one level of
// the collection tree. `rootId` (the sidebar's selected collection, else null =
// top level) is the leftmost column; drilling into a collection appends a column to
// its right and truncates anything deeper. All rendering is the reused `column`
// TaskTable — this component owns only the drill path.
export const ColumnsView: React.FC<{
  ctx: ColumnContext;
  rootId: string | null;
  // Column header labels: the node's name, or the view label for the root.
  labelFor: (nodeId: string | null) => string;
}> = ({ ctx, rootId, labelFor }) => {
  const [path, setPath] = useState<(string | null)[]>([rootId]);

  // Re-root when the sidebar selection changes.
  useEffect(() => { setPath([rootId]); }, [rootId]);

  // Drill from column `index` into child `id`: keep columns up to and including the
  // clicked one, then open the child as the next column (replacing any deeper ones).
  const drillAt = (index: number, id: string) =>
    setPath((p) => [...p.slice(0, index + 1), id]);

  return (
    <div className="flex-1 min-h-0 flex overflow-x-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:bg-fg/15 [&::-webkit-scrollbar-thumb]:rounded-full">
      {path.map((nodeId, i) => (
        <div
          key={`${i}:${nodeId ?? '__root'}`}
          className="w-80 shrink-0 min-h-0 flex flex-col border-r border-fg/8"
        >
          <div className="shrink-0 h-9 flex items-center px-3 border-b border-fg/10 text-xs font-semibold tracking-wide text-fg/60 truncate">
            {labelFor(nodeId)}
          </div>
          <Column
            ctx={ctx}
            nodeId={nodeId}
            selectedChildId={path[i + 1] ?? null}
            onDrill={(id) => drillAt(i, id)}
          />
        </div>
      ))}
    </div>
  );
};

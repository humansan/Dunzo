import React from 'react';
import { Layers, Inbox, Shapes, ChevronRight, ChevronDown } from 'lucide-react';
import { DEFAULT_COLLECTION_COLOR, SIDEBAR_INDENT } from './constants';
import { FinderVisibleCollection } from './useTaskFinderData';

// The Task Finder's left pane: All / Uncategorized + the collection tree filtered to
// collections that contain a match. A focused, read-only cousin of HubSidebar — no
// workspace switcher, drag-and-drop, rename, context menu, or new-collection — so it
// doesn't drag the planner's sidebar machinery into the finder. Selecting an entry
// scopes the right pane; the chevron expands/collapses a sub-tree.
export const FinderCollectionList: React.FC<{
  visibleCollections: FinderVisibleCollection[];
  selectedView: string;
  onSelectView: (v: string) => void;
  allCount: number;
  uncategorizedCount: number;
  collectionCount: (id: string) => number;
  collapsedColls: Set<string>;
  toggleCollColl: (id: string) => void;
}> = ({
  visibleCollections,
  selectedView,
  onSelectView,
  allCount,
  uncategorizedCount,
  collectionCount,
  collapsedColls,
  toggleCollColl,
}) => {
  const itemCls = (view: string) =>
    `group/row w-full flex items-center rounded-lg text-left transition-colors gap-2 pr-1.5 py-1.5 text-sm ${
      selectedView === view
        ? 'bg-white/10 text-white font-medium'
        : 'text-white/65 hover:bg-white/[0.05] hover:text-white'
    }`;

  return (
    <div className="w-56 shrink-0 min-h-0 flex flex-col border-r border-white/10">
      <div className="shrink-0 px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/30">
        Collections
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 pt-1 space-y-0.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full">
        <button type="button" onClick={() => onSelectView('all')} className={`${itemCls('all')} pl-2.5`} title="All Tasks">
          <Layers size={15} className="shrink-0 text-white/45" />
          <span className="flex-1 truncate">All Tasks</span>
          <span className="text-xs text-white/35 font-mono">{allCount}</span>
        </button>
        <button type="button" onClick={() => onSelectView('uncategorized')} className={`${itemCls('uncategorized')} pl-2.5`} title="Uncategorized">
          <Inbox size={15} className="shrink-0 text-white/45" />
          <span className="flex-1 truncate">Uncategorized</span>
          <span className="text-xs text-white/35 font-mono">{uncategorizedCount}</span>
        </button>

        {visibleCollections.map(({ entry: c, depth, hasChildren }) => {
          const color = c.todo.color || DEFAULT_COLLECTION_COLOR;
          return (
            <button
              key={c.todo.id}
              type="button"
              onClick={() => onSelectView(c.todo.id)}
              style={{ paddingLeft: 6 + depth * SIDEBAR_INDENT }}
              className={itemCls(c.todo.id)}
              title={c.todo.text || 'Untitled collection'}
            >
              <Shapes size={15} className="shrink-0" style={{ color }} />
              <span className="flex-1 truncate">{c.todo.text || 'Untitled collection'}</span>
              {hasChildren ? (
                <>
                  <span className="text-xs text-white/35 group-hover/row:hidden font-mono">{collectionCount(c.todo.id)}</span>
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); toggleCollColl(c.todo.id); }}
                    className="hidden shrink-0 -my-0.5 items-center justify-center rounded p-0.5 text-white/45 hover:text-white hover:bg-white/10 transition-colors group-hover/row:flex"
                    title={collapsedColls.has(c.todo.id) ? 'Expand' : 'Collapse'}
                  >
                    {collapsedColls.has(c.todo.id) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </span>
                </>
              ) : (
                <span className="text-xs text-white/35 font-mono">{collectionCount(c.todo.id)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

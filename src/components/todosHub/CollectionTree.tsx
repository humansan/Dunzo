import React from 'react';
import { Layers, Inbox, Shapes, ChevronRight, ChevronDown } from 'lucide-react';
import { OrganizerEntry } from '../../utils/todoFilters';
import { collectionColor, SIDEBAR_INDENT } from './constants';
import { useCollectionDnD } from './useCollectionDnD';

export type VisibleCollection = { entry: OrganizerEntry; depth: number; hasChildren: boolean };

// The shared collections navigator: the "All Tasks" / "Uncategorized" pseudo-views
// plus the nested collection tree (counts, selection, expand/collapse). Used by both
// the Task Planner sidebar and the Task Finder's two-pane view, so styling + behavior
// stay in one place. Drag-to-reorder/nest and the right-click menu are opt-in via the
// `dnd` and `onOpenMenu` props — the planner passes them, search omits them.
export const CollectionTree: React.FC<{
  selectedView: string;
  onSelectView: (v: string) => void;
  allCount: number;
  uncategorizedCount: number;
  visibleCollections: VisibleCollection[];
  collectionCount: (id: string) => number;
  collapsedColls: Set<string>;
  toggleCollColl: (id: string) => void;
  // Opt-in collection drag-and-drop (reorder + nest); omit to disable.
  dnd?: ReturnType<typeof useCollectionDnD>;
  // Opt-in right-click context menu on a collection row.
  onOpenMenu?: (id: string, x: number, y: number) => void;
}> = ({
  selectedView,
  onSelectView,
  allCount,
  uncategorizedCount,
  visibleCollections,
  collectionCount,
  collapsedColls,
  toggleCollColl,
  dnd,
  onOpenMenu,
}) => {
  const itemCls = (view: string) =>
    `w-full flex items-center rounded-lg text-left transition-colors gap-2 pl-2.5 pr-1.5 py-1.5 text-sm ${
      selectedView === view
        ? 'bg-fg/10 text-fg font-medium'
        : 'text-fg/65 hover:bg-fg/[0.05] hover:text-fg'
    }`;

  return (
    <div className="group/pane flex-1 min-h-0 flex flex-col">
      {/* Fixed header: title + the two pseudo-views as separate rows */}
      <div className="shrink-0 p-2 pb-1 space-y-0.5">
        <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-fg/30">
          Collections
        </div>
        <button type="button" onClick={() => onSelectView('all')} className={itemCls('all')} title="All Tasks">
          <Layers size={15} className="shrink-0 text-fg/45" />
          <span className="flex-1 truncate">All Tasks</span>
          <span className="text-xs text-fg/35 font-mono mr-1.5">{allCount}</span>
        </button>
        <button type="button" onClick={() => onSelectView('uncategorized')} className={itemCls('uncategorized')} title="Uncategorized">
          <Inbox size={15} className="shrink-0 text-fg/45" />
          <span className="flex-1 truncate">Uncategorized</span>
          <span className="text-xs text-fg/35 font-mono mr-1.5">{uncategorizedCount}</span>
        </button>
      </div>

      {/* Scrollable list of collections — nested tree, indented by depth. The drop is
          handled on the container (not per-row) so releases in the gaps still commit. */}
      <div
        ref={dnd?.sideScroll.ref}
        className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-fg/15 [&::-webkit-scrollbar-thumb]:rounded-full"
        onDragOver={dnd?.dragCollId ? dnd.sideScroll.onDragOver : undefined}
        onDragEnter={dnd?.dragCollId ? dnd.sideScroll.onDragEnter : undefined}
        onDrop={dnd ? (e) => { e.preventDefault(); dnd.onCollDrop(); } : undefined}
      >
        {visibleCollections.map(({ entry: c, depth, hasChildren }) => {
          const color = collectionColor(c.todo.color);
          const indent = depth * SIDEBAR_INDENT;
          const drop = dnd?.dropInfo?.id === c.todo.id ? dnd.dropInfo.pos : null;
          const button = (
            <button
              type="button"
              onClick={() => onSelectView(c.todo.id)}
              onContextMenu={onOpenMenu ? (e) => { e.preventDefault(); onOpenMenu(c.todo.id, e.clientX, e.clientY); } : undefined}
              style={{ paddingLeft: 6 + indent }}
              className={`${itemCls(c.todo.id)} ${dnd?.dragCollId === c.todo.id ? 'opacity-40' : ''} ${
                drop === 'inside' ? 'ring-2 ring-inset ring-[var(--accent2)] bg-[var(--accent2)]/10' : ''
              }`}
              title={c.todo.text || 'Untitled collection'}
            >
              <Shapes size={15} className="shrink-0" style={{ color }} />
              <span className="flex-1 truncate">{c.todo.text || 'Untitled collection'}</span>
              {/* Right slot: task count by default; on pane hover, collections with
                  nested children swap it for an expand/collapse toggle. */}
              {hasChildren ? (
                <>
                  <span className="text-xs text-fg/35 group-hover/pane:hidden mr-1.5 font-mono">{collectionCount(c.todo.id)}</span>
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); toggleCollColl(c.todo.id); }}
                    className="hidden shrink-0 -my-0.5 items-center justify-center rounded p-0.5 text-fg/45 hover:text-fg hover:bg-fg/10 transition-colors group-hover/pane:flex"
                    title={collapsedColls.has(c.todo.id) ? 'Expand' : 'Collapse'}
                  >
                    {collapsedColls.has(c.todo.id) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </span>
                </>
              ) : (
                <span className="text-xs text-fg/35 font-mono mr-1.5">{collectionCount(c.todo.id)}</span>
              )}
            </button>
          );

          if (!dnd) return <div key={c.todo.id} className="relative">{button}</div>;
          return (
            <div
              key={c.todo.id}
              className="relative"
              draggable
              onDragStart={(e) => {
                dnd.setDragCollId(c.todo.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', c.todo.id);
              }}
              onDragEnd={() => { dnd.setDragCollId(null); dnd.setDropInfo(null); dnd.sideScroll.stop(); }}
              onDragOver={(e) => dnd.onCollDragOver(e, c.todo.id)}
            >
              {/* Reorder line — drawn at the target's indent level */}
              {drop === 'before' && (
                <div className="pointer-events-none absolute -top-px left-0 right-1.5 z-10 h-0.5 rounded-full bg-[var(--accent2)]" style={{ marginLeft: 6 + indent }} />
              )}
              {drop === 'after' && (
                <div className="pointer-events-none absolute -bottom-px left-0 right-1.5 z-10 h-0.5 rounded-full bg-[var(--accent2)]" style={{ marginLeft: 6 + indent }} />
              )}
              {button}
            </div>
          );
        })}
      </div>
    </div>
  );
};

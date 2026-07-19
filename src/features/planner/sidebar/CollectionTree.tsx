import React from 'react';
import { Layers, Inbox, Archive, Shapes, ChevronRight, ChevronDown, CalendarCheck, FolderCheck } from 'lucide-react';
import { OrganizerEntry } from '@/features/tasks/model';
import { collectionColor } from '@/theme/collectionColor';
import { SIDEBAR_INDENT } from '@/features/planner/constants';
import { btnGhost } from '@/theme/buttons';
import { useCollectionDnD } from '@/features/planner/hooks/useCollectionDnD';

export type VisibleCollection = { entry: OrganizerEntry; depth: number; hasChildren: boolean };

// The shared collections navigator: the "All Tasks" / "Uncategorized" pseudo-views
// plus the nested collection tree (counts, selection, expand/collapse). Used by both
// the Task Planner sidebar and the Task Finder's two-pane view, so styling + behavior
// stay in one place. Drag-to-reorder/nest and the right-click menu are opt-in via the
// `dnd` and `onOpenMenu` props - the planner passes them, search omits them.
export const CollectionTree: React.FC<{
  // Nav mode (planner sidebar / Task Finder): single-select by view string. Optional
  // so the calendar's checkbox mode can omit them (see checkedColls below).
  selectedView?: string;
  onSelectView?: (v: string) => void;
  allCount?: number;
  uncategorizedCount: number;
  // Omit to hide the "Archived" pseudo-view (the Task Finder's picker doesn't
  // support it - its data layer only knows 'all' / 'uncategorized' / a collection id).
  archivedCount?: number;
  // Omit to hide the "In Daily List" / "Categorized" pseudo-views (same reason as
  // Archived - the Task Finder only navigates all / uncategorized / a collection).
  inDailyListCount?: number;
  categorizedCount?: number;
  visibleCollections: VisibleCollection[];
  collectionCount: (id: string) => number;
  collapsedColls: Set<string>;
  toggleCollColl: (id: string) => void;
  // Opt-in collection drag-and-drop (reorder + nest); omit to disable.
  dnd?: ReturnType<typeof useCollectionDnD>;
  // Opt-in right-click context menu on a collection row.
  onOpenMenu?: (id: string, x: number, y: number) => void;
  // Checkbox / multi-select mode (used by the Calendar's collection filter). When
  // `onToggleChecked` is provided the tree drops the nav pseudo-views, shows only an
  // "Uncategorized" row plus the collection tree, and each row becomes a toggle: its
  // Shapes icon fills only when checked and the row brightens. `'uncategorized'` is the
  // sentinel id for the Uncategorized row.
  checkedColls?: Set<string>;
  onToggleChecked?: (id: string) => void;
}> = ({
  selectedView,
  onSelectView,
  allCount,
  uncategorizedCount,
  archivedCount,
  inDailyListCount,
  categorizedCount,
  visibleCollections,
  collectionCount,
  collapsedColls,
  toggleCollColl,
  dnd,
  onOpenMenu,
  checkedColls,
  onToggleChecked,
}) => {
  const checkMode = !!onToggleChecked;
  // In nav mode the active look keys off the selected view; in check mode it keys off
  // whether the row's id is in `checkedColls`.
  const itemCls = (id: string) =>
    `w-full flex items-center rounded-lg text-left transition-colors gap-2 pl-2.5 pr-1.5 py-1.5 text-sm ${
      (checkMode ? checkedColls?.has(id) : selectedView === id)
        ? 'bg-fill text-fg font-medium'
        : 'text-fg-muted hover:bg-fill-subtle hover:text-fg'
    }`;

  return (
    <div className="group/pane flex-1 min-h-0 flex flex-col">
      {/* Section 1: All Tasks · Archived (nav mode only) */}
      {!checkMode && (
        <div className="shrink-0 p-2 pb-0 space-y-0.5">
          <button type="button" onClick={() => onSelectView?.('all')} className={itemCls('all')} title="All Planner Tasks">
            <Layers size={15} className="shrink-0 text-fg-subtle" />
            <span className="flex-1 truncate">All Planner Tasks</span>
            <span className="text-xs text-fg-faint font-mono mr-1.5">{allCount}</span>
          </button>
          {archivedCount !== undefined && (
            <button type="button" onClick={() => onSelectView?.('archived')} className={itemCls('archived')} title="Archived">
              <Archive size={15} className="shrink-0 text-fg-subtle" />
              <span className="flex-1 truncate">Archived</span>
              <span className="text-xs text-fg-faint font-mono mr-1.5">{archivedCount}</span>
            </button>
          )}
        </div>
      )}

      {!checkMode && <div className="my-2 mx-3 border-t border-line"></div>}

      {/* Section 2: In Daily List · Uncategorized · Categorized. In check mode this
          collapses to just the Uncategorized checkbox row. */}
      <div className={`shrink-0 px-2 space-y-0.5 ${checkMode ? 'pt-2' : ''}`}>
        {!checkMode && inDailyListCount !== undefined && (
          <button type="button" onClick={() => onSelectView?.('in-daily-list')} className={itemCls('in-daily-list')} title="Also In Daily List">
            <CalendarCheck size={15} className="shrink-0 text-fg-subtle" />
            <span className="flex-1 truncate">Also In Daily List</span>
            <span className="text-xs text-fg-faint font-mono mr-1.5">{inDailyListCount}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => (checkMode ? onToggleChecked?.('uncategorized') : onSelectView?.('uncategorized'))}
          className={itemCls('uncategorized')}
          title="Uncategorized"
        >
          <Inbox
            size={15}
            className="shrink-0 text-fg-subtle"
            {...(checkMode ? { fill: checkedColls?.has('uncategorized') ? 'currentColor' : 'none' } : {})}
          />
          <span className="flex-1 truncate">Uncategorized</span>
          <span className="text-xs text-fg-faint font-mono mr-1.5">{uncategorizedCount}</span>
        </button>
        {!checkMode && categorizedCount !== undefined && (
          <button type="button" onClick={() => onSelectView?.('categorized')} className={itemCls('categorized')} title="Categorized">
            <FolderCheck size={15} className="shrink-0 text-fg-subtle" />
            <span className="flex-1 truncate">Categorized</span>
            <span className="text-xs text-fg-faint font-mono mr-1.5">{categorizedCount}</span>
          </button>
        )}
      </div>

      <div className="my-2 mx-3 border-t border-line"></div>

      {/* Section 3: user collections */}
      <div className="shrink-0 px-2 pb-0">
        <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-ghost">
          Collections
        </div>
      </div>

      {/* Scrollable list of collections - nested tree, indented by depth. The drop is
          handled on the container (not per-row) so releases in the gaps still commit. */}
      <div
        ref={dnd?.sideScroll.ref}
        className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-fill-strong [&::-webkit-scrollbar-thumb]:rounded-full"
        onDragOver={dnd?.dragCollId ? dnd.sideScroll.onDragOver : undefined}
        onDragEnter={dnd?.dragCollId ? dnd.sideScroll.onDragEnter : undefined}
        onDrop={dnd ? (e) => { e.preventDefault(); dnd.onCollDrop(); } : undefined}
      >
        {visibleCollections.map(({ entry: c, depth, hasChildren }) => {
          const color = collectionColor(c.todo.color);
          const indent = depth * SIDEBAR_INDENT;
          const drop = dnd?.dropInfo?.id === c.todo.id ? dnd.dropInfo.pos : null;
          // In check mode the Shapes glyph is the checkbox: filled colored glyph when
          // checked, colored outline when not.
          const checked = checkMode && checkedColls?.has(c.todo.id);
          const button = (
            <button
              type="button"
              onClick={() => (checkMode ? onToggleChecked?.(c.todo.id) : onSelectView?.(c.todo.id))}
              onContextMenu={onOpenMenu ? (e) => { e.preventDefault(); onOpenMenu(c.todo.id, e.clientX, e.clientY); } : undefined}
              style={{ paddingLeft: 6 + indent }}
              className={`${itemCls(c.todo.id)} ${dnd?.dragCollId === c.todo.id ? 'opacity-40' : ''} ${
                drop === 'inside' ? 'ring-2 ring-inset ring-[var(--accent2)] bg-[var(--accent2)]/10' : ''
              }`}
              title={c.todo.text || 'Untitled collection'}
            >
              <Shapes size={15} className="shrink-0" style={{ color }} fill={checkMode && !checked ? 'none' : 'currentColor'} strokeWidth={1.5} />
              <span className="flex-1 truncate">{c.todo.text || 'Untitled collection'}</span>
              {/* Right slot: task count by default; on pane hover, collections with
                  nested children swap it for an expand/collapse toggle. */}
              {hasChildren ? (
                <>
                  <span className="text-xs text-fg-faint group-hover/pane:hidden mr-1.5 font-mono">{collectionCount(c.todo.id)}</span>
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); toggleCollColl(c.todo.id); }}
                    className={`hidden shrink-0 -my-0.5 items-center justify-center rounded p-0.5 group-hover/pane:flex ${btnGhost()}`}
                    title={collapsedColls.has(c.todo.id) ? 'Expand' : 'Collapse'}
                  >
                    {collapsedColls.has(c.todo.id) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </span>
                </>
              ) : (
                <span className="text-xs text-fg-faint font-mono mr-1.5">{collectionCount(c.todo.id)}</span>
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
              {/* Reorder line - drawn at the target's indent level */}
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

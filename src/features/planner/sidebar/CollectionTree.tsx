import React, { useState } from 'react';
import { Layers, Inbox, Archive, CircleCheckBig, Shapes, ChevronRight, ChevronDown, CalendarCheck, FolderCheck, Eye, EyeOff, Plus } from 'lucide-react';
import { OrganizerEntry } from '@/features/tasks/model';
import { collectionColor } from '@/theme/collectionColor';
import { SIDEBAR_INDENT } from '@/features/planner/constants';
import { btnGhost, btnNeutral } from '@/theme/buttons';
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
  // Rendered only in nav mode (the calendar's checkbox mode drops the Uncategorized row).
  uncategorizedCount?: number;
  // Omit to hide the "Archived" pseudo-view (the Task Finder's picker doesn't
  // support it - its data layer only knows 'all' / 'uncategorized' / a collection id).
  archivedCount?: number;
  // Omit to hide the "Completed" pseudo-view (same reason as Archived).
  completedCount?: number;
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
  onOpenMenu?: (id: string, x: number, y: number, sidebar?: true) => void;
  // Checkbox / multi-select mode (used by the Calendar's collection filter). When
  // `onToggleChecked` is provided the tree drops the nav pseudo-views, shows only an
  // "Uncategorized" row plus the collection tree, and each row becomes a toggle: its
  // Shapes icon fills only when checked and the row brightens. `'uncategorized'` is the
  // sentinel id for the Uncategorized row.
  checkedColls?: Set<string>;
  onToggleChecked?: (id: string) => void;
  // Check-mode header "Select all"/"Deselect all" toggle.
  allChecked?: boolean;
  onToggleAll?: () => void;
  // Set a collection's whole subtree (all descendant collections) to `checked`. When
  // provided, toggling a collection that has sub-collections shows a small confirm prompt.
  onToggleSubtree?: (id: string, checked: boolean) => void;
  onNewCollection?: () => void;
}> = ({
  selectedView,
  onSelectView,
  allCount,
  uncategorizedCount,
  archivedCount,
  completedCount,
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
  allChecked,
  onToggleAll,
  onToggleSubtree,
  onNewCollection
}) => {
  const checkMode = !!onToggleChecked;
  // Which collection's "apply to subcollections?" prompt is currently open (check mode).
  const [subtreePrompt, setSubtreePrompt] = useState<{ id: string; checked: boolean } | null>(null);
  // In nav mode the active look keys off the selected view; in check mode it keys off
  // whether the row's id is in `checkedColls`.
  const itemCls = (id: string) =>
    `w-full flex items-center rounded-lg text-left transition-colors gap-2 pl-2.5 pr-1.5 py-1.5 text-sm ${btnGhost(selectedView === id)} ${
      (checkMode ? checkedColls?.has(id) : selectedView === id) && 'font-medium'
    }`;

  return (
    <div className="group/pane flex-1 min-h-0 flex flex-col">
      {/* Section 1: All Tasks · Archived · Completed (nav mode only) */}
      {!checkMode && (
        <div className="shrink-0 p-2 pb-0 space-y-0.5">
          <button type="button" onClick={() => onSelectView?.('all')} className={itemCls('all')} title="All Planner Tasks">
            <Layers size={15} className="shrink-0 text-fg-subtle" />
            <span className="flex-1 truncate">All Planner Tasks</span>
            <span className="text-xs text-fg-faint font-mono mr-1.5">{allCount}</span>
          </button>
          {completedCount !== undefined && (
            <button type="button" onClick={() => onSelectView?.('completed')} className={itemCls('completed')} title="Completed">
              <CircleCheckBig size={15} className="shrink-0 text-fg-subtle" />
              <span className="flex-1 truncate">Completed</span>
              <span className="text-xs text-fg-faint font-mono mr-1.5">{completedCount}</span>
            </button>
          )}
        </div>
      )}

      {/* Section 2: In Daily List · Uncategorized · Categorized (nav mode only - in the
          calendar's checkbox mode these pseudo-views live outside the tree). */}
      {!checkMode && (
        <>
          <div className="my-2 mx-3 border-t border-line"></div>
          <div className="shrink-0 px-2 space-y-0.5">
            {inDailyListCount !== undefined && (
              <button type="button" onClick={() => onSelectView?.('in-daily-list')} className={itemCls('in-daily-list')} title="Also In Daily List">
                <CalendarCheck size={15} className="shrink-0 text-fg-subtle" />
                <span className="flex-1 truncate">Also In Daily List</span>
                <span className="text-xs text-fg-faint font-mono mr-1.5">{inDailyListCount}</span>
              </button>
            )}
            <button type="button" onClick={() => onSelectView?.('uncategorized')} className={itemCls('uncategorized')} title="Uncategorized">
              <Inbox size={15} className="shrink-0 text-fg-subtle" />
              <span className="flex-1 truncate">Uncategorized</span>
              <span className="text-xs text-fg-faint font-mono mr-1.5">{uncategorizedCount}</span>
            </button>
            {categorizedCount !== undefined && (
              <button type="button" onClick={() => onSelectView?.('categorized')} className={itemCls('categorized')} title="Categorized">
                <FolderCheck size={15} className="shrink-0 text-fg-subtle" />
                <span className="flex-1 truncate">Categorized</span>
                <span className="text-xs text-fg-faint font-mono mr-1.5">{categorizedCount}</span>
              </button>
            )}
          </div>
        </>
      )}

      {!checkMode && <div className="my-2 mx-3 border-t border-line"></div>}

      {/* Section 3: user collections */}
      <div className="shrink-0 px-1 pb-0">
        <div className="px-2.5 pb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-fg-muted truncate flex-1">Collections</span>
          {checkMode && onToggleAll && (
            <button
              type="button"
              onClick={onToggleAll}
              className={`shrink-0 flex items-center gap-1 rounded pl-2 pr-1.25 py-0.75 text-[11px] font-semibold ${btnNeutral}`}
            >
              {allChecked ? 'Hide all' : 'Show all'} 
              {allChecked ? <EyeOff size={12}></EyeOff> : <Eye size={12}></Eye>}
              
            </button>
          )}
          {!checkMode && onNewCollection && (
            <button
              type="button"
              onClick={onNewCollection}
              className={`shrink-0 flex items-center gap-1 rounded pl-2 pr-1.25 py-0.75 text-[11px] font-semibold ${btnNeutral}`}
            >
              Create new
              <Plus size={12}></Plus>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable list of collections - nested tree, indented by depth. The drop is
          handled on the container (not per-row) so releases in the gaps still commit. */}

      {visibleCollections.length === 0 && (
        <div className="flex flex-col items-center py-4 px-8 text-center text-xs text-fg-faint gap-2">
          <Shapes className="text-fg-faint" size={16}/>
          No collections. Create one to get started.
        </div>
      )}
      <div
        ref={dnd?.sideScroll.ref}
        className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5 "
        onDragOver={dnd?.dragCollId ? dnd.sideScroll.onDragOver : undefined}
        onDragEnter={dnd?.dragCollId ? dnd.sideScroll.onDragEnter : undefined}
        onDrop={dnd ? (e) => { e.preventDefault(); dnd.onCollDrop(); } : undefined}
      >
        {visibleCollections.map(({ entry: c, depth, hasChildren }) => {
          const color = collectionColor(c.todo.color);
          const indent = depth * SIDEBAR_INDENT;
          const drop = dnd?.dropInfo?.id === c.todo.id ? dnd.dropInfo.pos : null;
          // In check mode the Shapes glyph is the checkbox: filled colored glyph when
          // checked, colored outline when not. No fill background (unlike nav mode); the
          // text stays fg-subtle to match the rest of the sidebar, and unselected rows dim
          // to 60% opacity - so the filled icon + full opacity is what reads as "selected".
          const checked = checkMode && checkedColls?.has(c.todo.id);
          const rowCls = checkMode
            ? `w-full flex items-center rounded-lg text-left transition-colors gap-2 pl-2.5 pr-1.5 py-1.5 text-sm hover:bg-fill-subtle cursor-pointer ${
                checked ? 'text-fg-muted' : 'text-fg-subtle opacity-60 hover:text-fg-muted'
              }`
            : itemCls(c.todo.id);
          const onRowClick = () => {
            if (!checkMode) return onSelectView?.(c.todo.id);
            const nowChecked = !checkedColls?.has(c.todo.id);
            onToggleChecked?.(c.todo.id);
            // Toggling a collection with sub-collections offers to cascade to them.
            setSubtreePrompt(hasChildren && onToggleSubtree ? { id: c.todo.id, checked: nowChecked } : null);
          };
          const button = (
            <button
              type="button"
              onClick={onRowClick}
              onContextMenu={onOpenMenu ? (e) => { e.preventDefault(); onOpenMenu(c.todo.id, e.clientX, e.clientY, true); } : undefined}
              style={{ paddingLeft: 6 + indent }}
              className={`${rowCls} ${dnd?.dragCollId === c.todo.id ? 'opacity-40' : ''} ${
                drop === 'inside' ? 'ring-2 ring-inset ring-[var(--accent2)] bg-[var(--accent2)]/10' : ''
              }`}
              title={c.todo.text || 'Untitled collection'}
            >
              <Shapes size={15} className={`shrink-0 ${checkMode && !checked ? "fill-none stroke-2" : "fill-current stroke-2"}`} style={{ color }} />
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

          // Inline "apply to subcollections?" prompt, shown below the just-toggled row.
          const promptEl = subtreePrompt?.id === c.todo.id && (
            <div
              style={{ marginLeft: 6 + indent }}
              className="my-1 flex items-center rounded-md bg-fill-subtle px-2 py-1 text-[11px] text-fg-muted"
            >
              <span className="flex-1">{subtreePrompt.checked ? 'Show' : 'Hide'} subcollections too?</span>
              <button
                type="button"
                onClick={() => { onToggleSubtree?.(subtreePrompt.id, subtreePrompt.checked); setSubtreePrompt(null); }}
                className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${btnGhost()}`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setSubtreePrompt(null)}
                className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${btnGhost()}`}
              >
                No
              </button>
            </div>
          );

          if (!dnd) return <div key={c.todo.id} className="relative">{button}{promptEl}</div>;
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

      <div className="mb-1.5 mx-3 border-t border-line"></div>
      <div className="shrink-0 px-2">
        {archivedCount !== undefined && (
          <button type="button" onClick={() => onSelectView?.('archived')} className={itemCls('archived')} title="Archived">
            <Archive size={15} className="shrink-0 text-fg-subtle" />
            <span className="flex-1 truncate">Archived</span>
            <span className="text-xs text-fg-faint font-mono mr-1.5">{archivedCount}</span>
          </button>
        )}
      </div>
    </div>
  );
};

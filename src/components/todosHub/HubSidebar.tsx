import React from 'react';
import { Box, Plus, Layers, Inbox, Shapes, ChevronRight, ChevronDown, FolderPlus } from 'lucide-react';
import { Workspace } from '../../types';
import { OrganizerEntry } from '../../utils/todoFilters';
import { DEFAULT_COLLECTION_COLOR, SIDEBAR_INDENT } from './constants';
import { useCollectionDnD } from './useCollectionDnD';

type VisibleCollection = { entry: OrganizerEntry; depth: number; hasChildren: boolean };

// The hub's left pane: the Workspaces switcher (top) and the Collections tree
// (All / Uncategorized pseudo-views + the nested, drag-reorderable collection
// list), plus the New-collection button and the pane resize handle.
export const HubSidebar: React.FC<{
  sidebarWidth: number;
  startSidebarResize: (e: React.MouseEvent) => void;
  // Workspaces
  workspaces: Workspace[];
  activeWorkspaceId: string;
  renamingWorkspaceId: string | null;
  setRenamingWorkspaceId: (id: string | null) => void;
  onSelectWorkspace: (id: string) => void;
  onRenameWorkspace: (id: string, name: string) => void;
  onNewWorkspace: () => void;
  // Collections
  selectedView: string;
  setSelectedView: (v: string) => void;
  allCount: number;
  uncategorizedCount: number;
  visibleCollections: VisibleCollection[];
  collectionCount: (cid: string) => number;
  collapsedColls: Set<string>;
  toggleCollColl: (id: string) => void;
  openMenu: (id: string, x: number, y: number) => void;
  onNewCollection: () => void;
  // Collection drag-and-drop (reorder + nest)
  dnd: ReturnType<typeof useCollectionDnD>;
}> = ({
  sidebarWidth,
  startSidebarResize,
  workspaces,
  activeWorkspaceId,
  renamingWorkspaceId,
  setRenamingWorkspaceId,
  onSelectWorkspace,
  onRenameWorkspace,
  onNewWorkspace,
  selectedView,
  setSelectedView,
  allCount,
  uncategorizedCount,
  visibleCollections,
  collectionCount,
  collapsedColls,
  toggleCollColl,
  openMenu,
  onNewCollection,
  dnd,
}) => {
  const { sideScroll, dragCollId, setDragCollId, dropInfo, setDropInfo, onCollDragOver, onCollDrop } = dnd;

  const sidebarItemCls = (view: string) =>
    `w-full flex items-center rounded-lg text-left transition-colors gap-2 pl-2.5 pr-1.5 py-1.5 text-sm ${
      selectedView === view
        ? 'bg-white/10 text-white font-medium'
        : 'text-white/65 hover:bg-white/[0.05] hover:text-white'
    }`;

  return (
    <aside
      style={{ width: sidebarWidth }}
      className="group/pane relative shrink-0 flex flex-col min-h-0 border-r border-white/10"
    >
      {/* ── Workspaces section (top) — independent todo databases ───────── */}
      <div className="shrink-0 flex flex-col max-h-[38%] border-b border-white/10 p-2">
        <div className="shrink-0 px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/30">
          Workspaces
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full">
          {workspaces.map((ws) => {
            const active = ws.id === activeWorkspaceId;
            if (renamingWorkspaceId === ws.id) {
              return (
                <input
                  key={ws.id}
                  type="text"
                  autoFocus
                  defaultValue={ws.name}
                  onChange={(e) => onRenameWorkspace(ws.id, e.target.value)}
                  onBlur={() => setRenamingWorkspaceId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
                  }}
                  placeholder="Workspace name"
                  className="w-full rounded-lg px-2.5 py-1.5 text-sm font-medium bg-white/10 text-white focus:outline-none ring-1 ring-inset ring-[var(--accent2)]/60 placeholder:text-white/40"
                />
              );
            }
            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => onSelectWorkspace(ws.id)}
                onDoubleClick={() => setRenamingWorkspaceId(ws.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left transition-colors ${
                  active ? 'bg-white/10 text-white font-medium' : 'text-white/65 hover:bg-white/[0.05] hover:text-white'
                }`}
                title={ws.name || 'Untitled workspace'}
              >
                <Box size={15} className="shrink-0 text-white/45" />
                <span className="flex-1 truncate">{ws.name || 'Untitled workspace'}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onNewWorkspace}
          title="New workspace"
          className="shrink-0 mt-0.5 w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <Plus size={15} />
          <span>New workspace</span>
        </button>
      </div>

      {/* ── Collections section (bottom) ────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Fixed header: title + the two pseudo-views as separate rows */}
        <div className="shrink-0 p-2 pb-1 space-y-0.5">
          <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/30">
            Collections
          </div>
          <button type="button" onClick={() => setSelectedView('all')} className={sidebarItemCls('all')} title="All Tasks">
            <Layers size={15} className="shrink-0 text-white/45" />
            <span className="flex-1 truncate">All Tasks</span>
            <span className="text-xs text-white/35 font-mono mr-1.5">{allCount}</span>
          </button>
          <button type="button" onClick={() => setSelectedView('uncategorized')} className={sidebarItemCls('uncategorized')} title="Uncategorized">
            <Inbox size={15} className="shrink-0 text-white/45" />
            <span className="flex-1 truncate">Uncategorized</span>
            <span className="text-xs text-white/35 font-mono mr-1.5">{uncategorizedCount}</span>
          </button>
        </div>

        {/* Scrollable list of collections — nested tree, indented by depth.
            The drop is handled here (not per-row) so releases that land in
            the gap between rows still commit the current drop target. */}
        <div
          ref={sideScroll.ref}
          className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full"
          onDragOver={dragCollId ? sideScroll.onDragOver : undefined}
          onDragEnter={dragCollId ? sideScroll.onDragEnter : undefined}
          onDrop={(e) => { e.preventDefault(); onCollDrop(); }}
        >
          {visibleCollections.map(({ entry: c, depth, hasChildren }) => {
            const color = c.todo.color || DEFAULT_COLLECTION_COLOR;
            const indent = depth * SIDEBAR_INDENT;
            const drop = dropInfo?.id === c.todo.id ? dropInfo.pos : null;
            return (
              <div
                key={c.todo.id}
                className="relative"
                draggable
                onDragStart={(e) => {
                  setDragCollId(c.todo.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', c.todo.id);
                }}
                onDragEnd={() => { setDragCollId(null); setDropInfo(null); sideScroll.stop(); }}
                onDragOver={(e) => onCollDragOver(e, c.todo.id)}
              >
                {/* Reorder line — drawn at the target's indent level */}
                {drop === 'before' && (
                  <div className="pointer-events-none absolute -top-px left-0 right-1.5 z-10 h-0.5 rounded-full bg-[var(--accent2)]" style={{ marginLeft: 6 + indent }} />
                )}
                {drop === 'after' && (
                  <div className="pointer-events-none absolute -bottom-px left-0 right-1.5 z-10 h-0.5 rounded-full bg-[var(--accent2)]" style={{ marginLeft: 6 + indent }} />
                )}
                <button
                  type="button"
                  onClick={() => setSelectedView(c.todo.id)}
                  onContextMenu={(e) => { e.preventDefault(); openMenu(c.todo.id, e.clientX, e.clientY); }}
                  style={{ paddingLeft: 6 + indent }}
                  className={`${sidebarItemCls(c.todo.id)} ${dragCollId === c.todo.id ? 'opacity-40' : ''} ${
                    drop === 'inside' ? 'ring-2 ring-inset ring-[var(--accent2)] bg-[var(--accent2)]/10' : ''
                  }`}
                  title={c.todo.text || 'Untitled collection'}
                >
                  <Shapes size={15} className="shrink-0" style={{ color }} />
                  <span className="flex-1 truncate">{c.todo.text || 'Untitled collection'}</span>
                  {/* Right slot: task count by default; on pane hover, collections
                      with nested children swap it for an expand/collapse toggle. */}
                  {hasChildren ? (
                    <>
                      <span className="text-xs text-white/35 group-hover/pane:hidden mr-1.5 font-mono">{collectionCount(c.todo.id)}</span>
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); toggleCollColl(c.todo.id); }}
                        className="hidden shrink-0 -my-0.5 items-center justify-center rounded p-0.5 text-white/45 hover:text-white hover:bg-white/10 transition-colors group-hover/pane:flex"
                        title={collapsedColls.has(c.todo.id) ? 'Expand' : 'Collapse'}
                      >
                        {collapsedColls.has(c.todo.id) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-white/35 font-mono mr-1.5">{collectionCount(c.todo.id)}</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* New collection */}
      <button
        type="button"
        onClick={onNewCollection}
        className="shrink-0 m-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
      >
        <FolderPlus size={15} />
        <span>New collection</span>
      </button>

      {/* Drag handle to resize the pane */}
      <div
        onMouseDown={startSidebarResize}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[var(--accent2)]/40 transition-colors"
      />
    </aside>
  );
};

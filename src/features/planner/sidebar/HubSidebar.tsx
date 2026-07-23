import React from 'react';
import { Box, Plus, FolderPlus } from 'lucide-react';
import { Workspace } from '@shared/types';
import { useCollectionDnD } from '@/features/planner/hooks/useCollectionDnD';
import { btnGhost } from '@/theme/buttons';
import { CollectionTree, VisibleCollection } from '@/features/planner/sidebar/CollectionTree';

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
  archivedCount: number;
  inDailyListCount: number;
  categorizedCount: number;
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
  archivedCount,
  inDailyListCount,
  categorizedCount,
  visibleCollections,
  collectionCount,
  collapsedColls,
  toggleCollColl,
  openMenu,
  onNewCollection,
  dnd,
}) => {
  return (
    <aside
      style={{ width: sidebarWidth }}
      className="group/pane relative shrink-0 flex flex-col min-h-0 border-r border-line bg-surface py-1"
    >
      {/* ── Workspaces section (top) - independent todo databases ───────── */}
      {/* <div className="shrink-0 flex flex-col max-h-[38%] border-b border-line p-2">
        <div className="shrink-0 px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-ghost">
          Workspaces
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-fill-strong [&::-webkit-scrollbar-thumb]:rounded-full">
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
                  className="w-full rounded-lg px-2.5 py-1.5 text-sm font-medium bg-fill text-fg focus:outline-none ring-1 ring-inset ring-[var(--accent2)]/60 placeholder:text-fg-faint"
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
                  active ? 'bg-fill text-fg font-medium' : 'text-fg-muted hover:bg-fill-subtle hover:text-fg'
                }`}
                title={ws.name || 'Untitled workspace'}
              >
                <Box size={15} className="shrink-0 text-fg-subtle" />
                <span className="flex-1 truncate">{ws.name || 'Untitled workspace'}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onNewWorkspace}
          title="New workspace"
          className={`shrink-0 mt-0.5 w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm ${btnGhost()}`}
        >
          <Plus size={15} />
          <span>New workspace</span>
        </button>
      </div> */}

      {/* ── Collections section (bottom) - shared with the Task Finder ────── */}
      <CollectionTree
        selectedView={selectedView}
        onSelectView={setSelectedView}
        allCount={allCount}
        uncategorizedCount={uncategorizedCount}
        archivedCount={archivedCount}
        inDailyListCount={inDailyListCount}
        categorizedCount={categorizedCount}
        visibleCollections={visibleCollections}
        collectionCount={collectionCount}
        collapsedColls={collapsedColls}
        toggleCollColl={toggleCollColl}
        dnd={dnd}
        onOpenMenu={openMenu}
        onNewCollection={onNewCollection}
      />

      {/* New collection */}
      {/* <button
        type="button"
        onClick={onNewCollection}
        className={`shrink-0 m-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm ${btnGhost()}`}
      >
        <FolderPlus size={15} />
        <span>New collection</span>
      </button> */}

      {/* Drag handle to resize the pane */}
      <div
        onMouseDown={startSidebarResize}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[var(--accent2)]/40 transition-colors"
      />
    </aside>
  );
};

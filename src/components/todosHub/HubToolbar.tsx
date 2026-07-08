import React from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Table,
  List,
  GanttChart,
  Group,
  Columns3,
  Filter,
  ArrowUpDown,
} from 'lucide-react';
import { Todo } from '../../types';
import { collectionPath } from '../../utils/todoFilters';
import { btnGhost } from '../../theme/buttons';
import { CollectionBreadcrumb } from '../todoFields';

export type ToolbarMenuKey = 'sections' | 'fields' | 'filter' | 'sort';

// The right pane's header (sidebar toggle + breadcrumb/title + item count) and
// the view toolbar (Table/List/Timeline tabs + the Sections/Fields/Filter/Sort
// menu buttons with their active-count badges). Menu open/close is owned by the
// parent via onToggleMenu; this is otherwise presentational.
export const HubToolbar: React.FC<{
  sidebarHidden: boolean;
  onToggleSidebar: () => void;
  viewMode: 'table' | 'list';
  onSetViewMode: (m: 'table' | 'list') => void;
  selectedCollectionId: string | null;
  todoById: Map<string, Todo>;
  viewLabel: string;
  currentCount: number;
  filterCount: number;
  sortCount: number;
  menuOpen: Record<ToolbarMenuKey, boolean>;
  onToggleMenu: (which: ToolbarMenuKey, e: React.MouseEvent) => void;
}> = ({
  sidebarHidden,
  onToggleSidebar,
  viewMode,
  onSetViewMode,
  selectedCollectionId,
  todoById,
  viewLabel,
  currentCount,
  filterCount,
  sortCount,
  menuOpen,
  onToggleMenu,
}) => {
  const actions: { key: ToolbarMenuKey; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'sections', label: 'Sections', icon: Group },
    { key: 'fields', label: 'Fields', icon: Columns3 },
    { key: 'filter', label: 'Filter', icon: Filter, count: filterCount },
    { key: 'sort', label: 'Sort', icon: ArrowUpDown, count: sortCount },
  ];

  return (
    <>
      {/* Page header — tight, Notion-like */}
      <div className="shrink-0 flex items-center gap-2.5 px-4 pt-4 pb-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarHidden ? 'Show collections' : 'Hide collections'}
          className={`shrink-0 p-1 -ml-0.5 rounded ${btnGhost()}`}
        >
          {sidebarHidden ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <h1 className="text-lg font-bold">Task Planner</h1>
        <span className="text-xs text-fg-ghost">/</span>
        {selectedCollectionId ? (
          <CollectionBreadcrumb
            path={collectionPath(selectedCollectionId, todoById).map((c) => ({
              id: c.id,
              name: c.text || 'Untitled',
              color: c.color,
            }))}
          />
        ) : (
          <span className="text-xs font-medium text-fg-muted truncate max-w-[260px]">{viewLabel}</span>
        )}
        <span className="text-xs text-fg-faint">{currentCount} item{currentCount === 1 ? '' : 's'}</span>
      </div>

      {/* View toolbar */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 pb-4">
        {/* View tabs — Table/List switch the view; Timeline is not built yet. */}
        <div className="flex items-center gap-1">
          {([
            { key: 'table', label: 'Table', icon: Table, disabled: false },
            { key: 'list', label: 'List', icon: List, disabled: false },
            { key: 'timeline', label: 'Timeline', icon: GanttChart, disabled: true },
          ] as const).map(({ key, label, icon: Icon, disabled }) => {
            const active = !disabled && viewMode === key;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={disabled ? undefined : () => onSetViewMode(key as 'table' | 'list')}
                title={disabled ? 'Timeline view coming soon' : undefined}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-medium ${
                  disabled ? 'text-fg-ghost cursor-not-allowed transition-all' : btnGhost(active)
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Right-side actions — Sections / Fields / Filter / Sort */}
        <div className="flex items-center gap-1">
          {actions.map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              type="button"
              onClick={(e) => onToggleMenu(key, e)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] ${btnGhost(menuOpen[key])}`}
            >
              <Icon size={14} /> {label}
              {count !== undefined && count > 0 && (
                <span className="ml-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-fg-muted text-[10px] font-bold text-canvas px-1">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

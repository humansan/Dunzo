import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { NAME_BASE_PAD, INDENT, pillTextColor } from './constants';

// The single source of truth for how a section header looks in the Task Planner —
// the collapse chevron, the colored name pill, the count badge, and (critically)
// the section spacing, which differs between the Table and List (`listView`)
// variants. BOTH grouping paths render through this: collection sections (via
// HubRow's collection branch) and attribute sections — Date/Status/Priority —
// (via GroupHeaderRow). Keeping the chrome here means a styling change applies to
// every grouping at once, instead of having to be mirrored across two components.
export interface SectionHeaderProps {
  listView: boolean;
  gridTemplateColumns: string;
  // Pill — the shell renders a standard pill from `label` + `color`; pass
  // `pillOverride` to swap in a custom node (e.g. the collection's inline-edit
  // input). `onPillClick` makes the standard pill act as an edit affordance.
  color: string;
  label?: string;
  pillOverride?: React.ReactNode;
  onPillClick?: (e: React.MouseEvent) => void;
  // Collapse toggle. `hasToggle === false` renders a spacer instead (a childless
  // collection has nothing to collapse).
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  hasToggle?: boolean;
  toggleTitle?: { expand: string; collapse: string };
  count?: number;
  // Nesting indent (collection sub-sections); 0 for top-level attribute sections.
  depth?: number;
  // Slots: `leading` sits before the pill (drag handle), `actions` after the count
  // (options / add buttons), `dropDecorations` are absolutely-positioned drop
  // indicators drawn within the row.
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  dropDecorations?: React.ReactNode;
  // Outer-row passthrough (drag source dimming, drag image, native DnD, context menu).
  isDragSource?: boolean;
  dragImageRef?: React.Ref<HTMLDivElement>;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  listView,
  gridTemplateColumns,
  color,
  label,
  pillOverride,
  onPillClick,
  isCollapsed,
  onToggleCollapse,
  hasToggle = true,
  toggleTitle,
  count,
  depth = 0,
  leading,
  actions,
  dropDecorations,
  isDragSource = false,
  dragImageRef,
  onContextMenu,
  onDragOver,
  onDrop,
}) => {
  const pill = pillOverride ?? (
    <span
      onClick={onPillClick}
      style={{ backgroundColor: `${color}40`, color: pillTextColor(color) }}
      className={`min-w-0 max-w-full truncate rounded-full px-2.5 py-px font-medium ${
        onPillClick ? 'cursor-text' : ''
      } ${listView ? 'text-base' : 'text-sm'}`}
    >
      {label}
    </span>
  );

  return (
    <div
      style={{ gridTemplateColumns }}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
      // List view gives sections an airier, Todoist-like rhythm: more space above
      // (pt-6) and a little room (pb-2) between the label and its underline; table
      // view stays tight (pt-4). Both keep the bottom border.
      className={`relative grid items-end border-white/8 border-b group/row ${
        listView ? 'min-h-12 pt-6 pb-2' : 'min-h-12 pt-4'
      } ${isDragSource ? 'opacity-50' : ''}`}
    >
      {dropDecorations}
      {/* Header group, pinned left so it stays visible on horizontal scroll.
          Indents by nesting depth so sub-sections sit under their parent. */}
      <div
        ref={dragImageRef}
        style={{ paddingLeft: NAME_BASE_PAD + depth * INDENT }}
        className="sticky left-0 z-20 flex items-center h-full min-w-0 overflow-hidden bg-[#0a0a0a]"
      >
        {hasToggle ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
            className="shrink-0 p-0.5 flex items-center justify-center rounded text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
            title={isCollapsed ? toggleTitle?.expand : toggleTitle?.collapse}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
          </button>
        ) : (
          <span className="shrink-0 w-5.5" />
        )}

        {leading}

        {pill}

        {count !== undefined && (
          <span className="shrink-0 text-xs px-1.5 text-white/40 font-mono">{count}</span>
        )}

        {actions}
      </div>
    </div>
  );
};

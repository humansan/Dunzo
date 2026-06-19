import React, { useState } from 'react';
import { Todo } from '../../types';
import { OrganizerEntry } from '../../utils/todoFilters';
import { FlatNode, GroupRow, SectionsConfig } from './types';
import { flattenTree, orderFromFlat } from './treeUtils';
import { groupAssignmentPatch } from './viewUtils';
import { useDragAutoScroll } from './useDragAutoScroll';
import { useStableCallback } from './useStableCallback';

// The dragged row's resolved drop: which row, whether it lands before/after
// (reorder) or inside (nest), the resolved parent + indent depth (to draw the
// line), and — in attribute-grouped mode — the destination section.
export type RowDrop = {
  id: string;
  pos: 'before' | 'inside' | 'after';
  depth: number;
  parentId: string | null;
  group?: string;
};

// Native HTML5 drag-and-drop for the table body, sidebar-style: a drop indicator
// shows where the row will land and nothing shifts until release. Handles both
// collection-tree mode (reorder + nest, with section snapping) and attribute-
// grouped mode (reorder + cross-section reassignment). Owns the table auto-scroll.
export function useRowDnD(params: {
  entries: OrganizerEntry[];
  processedEntries: OrganizerEntry[];
  flattened: FlatNode[];
  flatById: Map<string, FlatNode>;
  groupedRows: GroupRow[];
  byId: Map<string, OrganizerEntry>;
  isDescendantOf: (e: OrganizerEntry, cid: string) => boolean;
  selectedCollectionId: string | null;
  sectionsConfig: SectionsConfig;
  onReorder: (items: { id: string; parentId: string | null }[]) => void;
  onSaveTodo: (oldDate: string | null, newDate: string | null, updatedTodo: Todo) => void;
  // Clear any open inline editor / context menu when a drag begins.
  clearInteraction: () => void;
}) {
  const {
    entries,
    processedEntries,
    flattened,
    flatById,
    groupedRows,
    byId,
    isDescendantOf,
    selectedCollectionId,
    sectionsConfig,
    onReorder,
    onSaveTodo,
    clearInteraction,
  } = params;

  const [rowDragId, setRowDragId] = useState<string | null>(null);
  const [rowDrop, setRowDrop] = useState<RowDrop | null>(null);
  // Edge auto-scroll for the table drag surface. Its onDragOver/onDragEnter also
  // keep the whole surface a valid drop zone.
  const tableScroll = useDragAutoScroll<HTMLDivElement>();

  const resetDrag = useStableCallback(() => { setRowDragId(null); setRowDrop(null); tableScroll.stop(); });

  // Nearest collection ancestor id (or null) — collections may only nest under
  // collections, so a collection drag snaps its parent up to one.
  const nearestCollectionId = (startId: string | null): string | null => {
    let cur = startId;
    const seen = new Set<string>();
    while (cur && byId.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      const e = byId.get(cur)!;
      if (e.todo.isCollection) return cur;
      cur = e.todo.parentId ?? null;
    }
    return null;
  };

  // Resolve the drop for collection-tree mode from the hovered row + cursor Y:
  // top/bottom thirds reorder (before/after, as a sibling); the middle nests
  // inside. Collections snap to a valid (collection/root) parent.
  const computeTreeDrop = (targetId: string, e: React.DragEvent): RowDrop | null => {
    if (!rowDragId || targetId === rowDragId) return null;
    const target = flatById.get(targetId);
    if (!target) return null;
    // Can't drop into the dragged node's own subtree.
    if (isDescendantOf(target.entry, rowDragId)) return null;

    const draggedIsColl = !!byId.get(rowDragId)?.todo.isCollection;
    const targetIsColl = !!target.entry.todo.isCollection;

    const rect = e.currentTarget.getBoundingClientRect();
    const r = (e.clientY - rect.top) / rect.height;

    // ── Section (collection) header target, dragging a TASK ──────────────────
    // A section's drop points must never yield a "no section" result. The top
    // zone appends the task to the section ABOVE (where the previous row lives);
    // the rest nests it inside this section. Sibling before/after on a section is
    // kept only for collection drags (below), so sections stay reorderable.
    if (targetIsColl && !draggedIsColl) {
      if (r < 0.3) {
        const idx = flattened.findIndex((n) => n.id === targetId);
        const prev = idx > 0 ? flattened[idx - 1] : null;
        if (prev && prev.id !== rowDragId && !isDescendantOf(prev.entry, rowDragId)) {
          // Land where the previous row lives: inside it if it's a (collapsed/
          // empty) section, else as its sibling — i.e. the section above.
          return prev.entry.todo.isCollection
            ? { id: targetId, pos: 'before', depth: prev.depth + 1, parentId: prev.id }
            : { id: targetId, pos: 'before', depth: prev.depth, parentId: prev.parentId };
        }
        // This section is the very first row — keep a top-of-list drop so a task
        // can become the first, top-level (section-less) item above it.
        if (idx === 0) return { id: targetId, pos: 'before', depth: 0, parentId: null };
        // Otherwise (the row above is the dragged one) nest into this section.
        return { id: targetId, pos: 'inside', depth: target.depth + 1, parentId: targetId };
      }
      return { id: targetId, pos: 'inside', depth: target.depth + 1, parentId: targetId };
    } // end this section

    // 'inside' (nest) only when the target can legally parent the dragged node.
    const canNest = draggedIsColl ? targetIsColl : true;
    const pos: RowDrop['pos'] = canNest
      ? (r < 0.3 ? 'before' : r > 0.7 ? 'after' : 'inside')
      : (r < 0.5 ? 'before' : 'after');

    let parentId: string | null;
    let depth: number;
    if (pos === 'inside') {
      parentId = targetId;
      depth = target.depth + 1;
    } else {
      parentId = target.parentId;
      depth = target.depth;
      // A collection sibling must still sit under a collection (or root); snap up.
      if (draggedIsColl && parentId && !byId.get(parentId)?.todo.isCollection) {
        parentId = nearestCollectionId(parentId);
        depth = parentId ? (flatById.get(parentId)?.depth ?? 0) + 1 : 0;
      }
    }

    // Merge the two redundant boundary drop points: "after A" equals "before B"
    // when both resolve to the same spot, so the shared gap shows one stable
    // indicator instead of flipping between two. (Differing levels keep both.)
    // Cases that coincide: B is a sibling at the same level; or B is the next
    // section header, whose top zone appends to this same section above it.
    if (pos === 'after') {
      const idx = flattened.findIndex((n) => n.id === targetId);
      const next = idx >= 0 ? flattened[idx + 1] : null;
      if (next && next.id !== rowDragId) {
        const sameLevelSibling = next.parentId === parentId && next.depth === depth;
        const nextSectionHeader = !draggedIsColl && !!next.entry.todo.isCollection;
        if (sameLevelSibling || nextSectionHeader) {
          return { id: next.id, pos: 'before', depth, parentId };
        }
      }
    }
    return { id: targetId, pos, depth, parentId };
  };

  const sameDrop = (a: RowDrop | null, b: RowDrop | null) =>
    (!a && !b) || (!!a && !!b && a.id === b.id && a.pos === b.pos && a.depth === b.depth);

  const onRowDragStart = useStableCallback((id: string) => {
    // Defer the state update: setting React state synchronously inside dragstart
    // re-renders the dragged row and aborts the native drag (the "first drag does
    // nothing / row stays dimmed" bug). A frame later the drag is committed.
    requestAnimationFrame(() => {
      setRowDragId(id);
      setRowDrop(null);
      clearInteraction();
    });
  });

  // dragOver on a task/collection row — recompute and stash the resolved drop.
  const onRowDragOver = useStableCallback((targetId: string, e: React.DragEvent) => {
    if (!rowDragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    let next: RowDrop | null = null;
    if (sectionsConfig.groupBy === 'collection') {
      next = computeTreeDrop(targetId, e);
    } else if (targetId !== rowDragId) {
      // Attribute-grouped: reorder before/after; no nesting (depth stays fixed).
      const idx = groupedRows.findIndex((r) => r.type === 'task' && r.node.id === targetId);
      const row = idx >= 0 ? groupedRows[idx] : null;
      if (row && row.type === 'task') {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientY - rect.top) / rect.height;
        if (ratio < 0.5) {
          next = { id: targetId, pos: 'before', depth: row.node.depth, parentId: null, group: row.group };
        } else {
          // 'after' — merge with the next task when it's in the same group, so the
          // single gap between two same-group siblings shows one stable indicator.
          const nxt = groupedRows[idx + 1];
          next = nxt && nxt.type === 'task' && nxt.group === row.group && nxt.node.id !== rowDragId
            ? { id: nxt.node.id, pos: 'before', depth: nxt.node.depth, parentId: null, group: nxt.group }
            : { id: targetId, pos: 'after', depth: row.node.depth, parentId: null, group: row.group };
        }
      }
    }
    setRowDrop((prev) => (sameDrop(prev, next) ? prev : next));
  });

  // dragOver on a section header (attribute-grouped mode) — drop at the top of it.
  const onHeaderDragOver = (headerId: string, group: string, e: React.DragEvent) => {
    if (!rowDragId || sectionsConfig.groupBy === 'collection') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const next: RowDrop = { id: headerId, pos: 'inside', depth: 1, parentId: null, group };
    setRowDrop((prev) => (sameDrop(prev, next) ? prev : next));
  };

  // Commit a collection-tree drop: set the moved node's parent, splice it next to
  // the target in the full order, then persist via orderFromFlat (children follow).
  const commitTreeDrop = (dragId: string, drop: RowDrop) => {
    const full = flattenTree(processedEntries).map((n) => ({ id: n.id, parentId: n.parentId }));
    const fromIdx = full.findIndex((n) => n.id === dragId);
    if (fromIdx === -1) return;
    const moved = { id: dragId, parentId: drop.parentId };
    const without = full.filter((_, i) => i !== fromIdx);
    let at = without.findIndex((n) => n.id === drop.id);
    if (at === -1) return;
    if (drop.pos === 'after' || drop.pos === 'inside') at += 1;
    without.splice(at, 0, moved);
    let order = orderFromFlat(without);
    // In a collection view the collection node is hidden, so its direct children
    // read as depth-0 (parentId null). Re-anchor them to the collection on save.
    if (selectedCollectionId) order = order.map((n) => ({ id: n.id, parentId: n.parentId ?? selectedCollectionId }));
    onReorder(order);
  };

  // Commit an attribute-grouped drop: optionally reassign the grouping attribute
  // (cross-section), then reorder within the global hub order (parentId preserved).
  const commitGroupedDrop = (dragId: string, drop: RowDrop) => {
    const activeEntry = byId.get(dragId);
    if (!activeEntry) return;
    const taskRows = groupedRows.filter((r): r is Extract<GroupRow, { type: 'task' }> => r.type === 'task');
    const activeGroup = taskRows.find((r) => r.node.id === dragId)?.group ?? '';
    const targetGroup = drop.group ?? '';

    if (targetGroup !== activeGroup) {
      const patch = groupAssignmentPatch(sectionsConfig.groupBy, targetGroup);
      if (patch) onSaveTodo(activeEntry.date, activeEntry.date, { ...activeEntry.todo, ...patch });
    }

    const ordered = [...entries]
      .sort((a, b) => (a.todo.hubOrder ?? a.todo.createdAt) - (b.todo.hubOrder ?? b.todo.createdAt))
      .map((e) => e.todo.id);
    const without = ordered.filter((id) => id !== dragId);
    // Header drop ('inside') anchors before the first task already in that section.
    let targetId = drop.id;
    if (drop.pos === 'inside') {
      targetId = taskRows.find((r) => r.group === targetGroup && r.node.id !== dragId)?.node.id ?? '';
    }
    let at = without.indexOf(targetId);
    if (at !== -1) {
      if (drop.pos === 'after') at += 1;
      without.splice(at, 0, dragId);
      onReorder(without.map((id) => ({ id, parentId: byId.get(id)?.todo.parentId ?? null })));
    }
  };

  const onRowDrop = useStableCallback(() => {
    if (rowDragId && rowDrop) {
      if (sectionsConfig.groupBy === 'collection') commitTreeDrop(rowDragId, rowDrop);
      else commitGroupedDrop(rowDragId, rowDrop);
    }
    resetDrag();
  });

  return {
    tableScroll,
    rowDragId,
    rowDrop,
    onRowDragStart,
    onRowDragOver,
    onHeaderDragOver,
    onRowDrop,
    resetDrag,
  };
}

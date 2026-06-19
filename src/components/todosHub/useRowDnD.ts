import React, { useMemo, useState } from 'react';
import { Todo } from '../../types';
import { OrganizerEntry } from '../../utils/todoFilters';
import { FlatNode, GroupRow, SectionsConfig } from './types';
import { flattenTree, orderFromFlat } from './treeUtils';
import { groupAssignmentPatch, groupCreateSpec } from './viewUtils';
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
// shows where the row will land and nothing shifts until release. Both modes share
// the same reorder + nest model; collection mode adds collection→collection section
// snapping, while attribute-grouped mode reassigns the grouping attribute when a
// task is moved between sections. Owns the table auto-scroll.
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
  onSaveTodo: (updatedTodo: Todo) => void;
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

  // Grouped-mode task rows as a flat tree (real parentId/depth, render order), plus
  // each row's section key — the attribute-grouped analogue of `flattened`.
  const groupNodes = useMemo(
    () => groupedRows.filter((r): r is Extract<GroupRow, { type: 'task' }> => r.type === 'task').map((r) => r.node),
    [groupedRows]
  );
  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of groupedRows) if (r.type === 'task') m.set(r.node.id, r.group);
    return m;
  }, [groupedRows]);

  // Is `target` the last among its siblings within `nodes`? Inserting between two
  // siblings is always expressed as the next sibling's 'before' point, so an
  // 'after' point is only meaningful on the last sibling (no next sibling whose
  // 'before' could stand in). The dragged node — which is leaving its current spot
  // — is skipped, so the row above it can still read as last. Siblings share a
  // parent; for root-level nodes (parentId null) `sectionOf` additionally requires
  // the same section, so section roots in different sections aren't siblings.
  const isLastSiblingIn = (nodes: FlatNode[], target: FlatNode, sectionOf?: Map<string, string>): boolean => {
    const idx = nodes.findIndex((n) => n.id === target.id);
    if (idx === -1) return true;
    for (let i = idx + 1; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.id === rowDragId || isDescendantOf(n.entry, rowDragId)) continue; // leaving
      if (n.depth > target.depth) continue; // target's own subtree
      const sameParent =
        n.parentId === target.parentId &&
        (target.parentId !== null || !sectionOf || sectionOf.get(n.id) === sectionOf.get(target.id));
      return !sameParent;
    }
    return true; // nothing follows → last
  };

  // An expanded node shows its children directly below it, so the next row in the
  // (collapse-aware) order is one of them (deeper than target).
  const isExpandedIn = (nodes: FlatNode[], target: FlatNode): boolean => {
    const idx = nodes.findIndex((n) => n.id === target.id);
    return idx >= 0 && idx + 1 < nodes.length && nodes[idx + 1].depth > target.depth;
  };

  // Resolve the drop for collection-tree mode from the hovered row + cursor Y:
  // the top zone reorders before (as a sibling); the rest nests inside. An 'after'
  // (sibling below) point only appears on a last sibling that isn't expanded —
  // otherwise drop after it via the row below. Collections snap to a valid parent.
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

    // 'inside' (nest) only when the target can legally parent the dragged node.
    // 'after' (sibling below) only on the last sibling — and never on an expanded
    // node, whose 'after' line would sit between it and its visible children
    // (ambiguous with nesting); drop after such a node via the row below instead.
    const canNest = draggedIsColl ? targetIsColl : true;
    const afterAllowed = isLastSiblingIn(flattened, target) && !isExpandedIn(flattened, target);
    const pos: RowDrop['pos'] = canNest
      ? (r < 0.3 ? 'before' : afterAllowed && r > 0.7 ? 'after' : 'inside')
      : afterAllowed
        ? (r < 0.5 ? 'before' : 'after')
        : 'before';

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

    return { id: targetId, pos, depth, parentId };
  };

  // Resolve the drop for attribute-grouped mode. Structurally identical to
  // collection mode (before / inside / after, last-sibling + expanded suppression),
  // but every row is a task so nesting is always allowed and there's no snap-up.
  // The carried `group` is the target's section, which the commit uses to reassign
  // the grouping attribute when the drop lands at a section root.
  const computeGroupedDrop = (targetId: string, e: React.DragEvent): RowDrop | null => {
    if (!rowDragId || targetId === rowDragId) return null;
    const target = groupNodes.find((n) => n.id === targetId);
    if (!target) return null;
    if (isDescendantOf(target.entry, rowDragId)) return null; // can't drop into own subtree

    const rect = e.currentTarget.getBoundingClientRect();
    const r = (e.clientY - rect.top) / rect.height;

    const afterAllowed = isLastSiblingIn(groupNodes, target, groupOf) && !isExpandedIn(groupNodes, target);
    const pos: RowDrop['pos'] = r < 0.3 ? 'before' : afterAllowed && r > 0.7 ? 'after' : 'inside';

    const parentId = pos === 'inside' ? targetId : target.parentId;
    const depth = pos === 'inside' ? target.depth + 1 : target.depth;
    // A node and its parent always share a section, so the target's own section is
    // the section the drop lands in.
    return { id: targetId, pos, depth, parentId, group: groupOf.get(targetId) ?? '' };
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
    const next = sectionsConfig.groupBy === 'collection'
      ? computeTreeDrop(targetId, e)
      : computeGroupedDrop(targetId, e);
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

  // Commit an attribute-grouped drop. Reparents + reorders exactly like collection
  // mode (children follow via orderFromFlat). Then, ONLY when the task lands at a
  // section root (no task parent) — a genuine move between sections — it reassigns
  // the grouping attribute to the destination section: a status/priority patch, or
  // the bucket's earliest day for date (same as the header "+"), or a clear for the
  // ungrouped section. Nesting under a task just reparents; the subtree follows its
  // new parent's section, so the attribute is left untouched.
  const commitGroupedDrop = (dragId: string, drop: RowDrop) => {
    const activeEntry = byId.get(dragId);
    if (!activeEntry) return;
    const groupField = sectionsConfig.groupBy;
    const targetGroup = drop.group ?? '';
    const isHeaderTarget = groupedRows.some((r) => r.type === 'header' && r.id === drop.id);

    // 1. Reorder + reparent over the global hub order, keeping subtrees contiguous.
    const base = [...entries]
      .sort((a, b) => (a.todo.hubOrder ?? a.todo.createdAt) - (b.todo.hubOrder ?? b.todo.createdAt))
      .map((e) => ({ id: e.todo.id, parentId: e.todo.parentId ?? null }));
    const fromIdx = base.findIndex((n) => n.id === dragId);
    if (fromIdx === -1) return;
    const moved = { id: dragId, parentId: drop.parentId };
    const without = base.filter((_, i) => i !== fromIdx);

    // Resolve the anchor row + side. A header drop lands at the top of its section
    // (before its first root task); 'inside' sits right after the parent (first
    // child); before/after splice next to the target.
    let anchorId = drop.id;
    let after = drop.pos === 'after';
    if (isHeaderTarget) {
      const firstRoot = groupedRows.find(
        (r) => r.type === 'task' && r.group === targetGroup && r.node.parentId === null && r.node.id !== dragId
      );
      anchorId = firstRoot && firstRoot.type === 'task' ? firstRoot.node.id : '';
      after = false;
    } else if (drop.pos === 'inside') {
      after = true;
    }
    const at = without.findIndex((n) => n.id === anchorId);
    if (at === -1) without.push(moved); // empty section / no anchor → end of order
    else without.splice(after ? at + 1 : at, 0, moved);
    const order = orderFromFlat(without);

    // 2. Reassign the grouping attribute only on a section-root landing.
    if (drop.parentId === null) {
      const activeGroup = groupOf.get(dragId) ?? '';
      if (targetGroup !== activeGroup) {
        if (groupField === 'date') {
          const { date } = groupCreateSpec('date', targetGroup); // earliest day in bucket, or null to clear
          onSaveTodo({ ...activeEntry.todo, parentId: null, dueDate: date ?? undefined });
        } else {
          const patch = groupAssignmentPatch(groupField, targetGroup); // '' clears the field
          if (patch) onSaveTodo({ ...activeEntry.todo, parentId: null, ...patch });
        }
      }
    }

    onReorder(order);
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

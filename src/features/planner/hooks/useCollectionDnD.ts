import React, { useState } from 'react';
import { OrganizerEntry } from '../../utils/todoFilters';
import { flattenTree, orderFromFlat } from './treeUtils';
import { useDragAutoScroll } from './useDragAutoScroll';

// Native HTML5 drag-and-drop for the sidebar collection tree: drag a collection
// over another to nest it (hover the middle), or between two to reorder it (hover
// an edge). Owns the sidebar's edge auto-scroll. Returns the state + handlers the
// sidebar list wires onto each row.
export function useCollectionDnD(params: {
  entries: OrganizerEntry[];
  collections: OrganizerEntry[];
  byId: Map<string, OrganizerEntry>;
  isDescendantOf: (e: OrganizerEntry, cid: string) => boolean;
  onReorder: (items: { id: string; parentId: string | null }[]) => void;
  setCollapsedColls: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const { entries, collections, byId, isDescendantOf, onReorder, setCollapsedColls } = params;

  const sideScroll = useDragAutoScroll<HTMLDivElement>();
  const [dragCollId, setDragCollId] = useState<string | null>(null);
  const [dropInfo, setDropInfo] = useState<{ id: string; pos: 'before' | 'inside' | 'after' } | null>(null);

  // The dragged collection can't land on itself or inside its own subtree.
  const inDraggedSubtree = (id: string) => {
    if (!dragCollId) return false;
    if (id === dragCollId) return true;
    const e = byId.get(id);
    return e ? isDescendantOf(e, dragCollId) : false;
  };

  const onCollDragOver = (e: React.DragEvent, targetId: string) => {
    if (!dragCollId) return;
    // preventDefault unconditionally so the cursor stays "move" — even over the
    // dragged item or its own subtree (where there's no valid drop), which would
    // otherwise flicker the no-drop icon.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (inDraggedSubtree(targetId)) { if (dropInfo) setDropInfo(null); return; } // not a valid target
    const rect = e.currentTarget.getBoundingClientRect();
    const r = (e.clientY - rect.top) / rect.height;
    const pos: 'before' | 'inside' | 'after' = r < 0.3 ? 'before' : r > 0.7 ? 'after' : 'inside';
    setDropInfo((prev) => (prev?.id === targetId && prev.pos === pos ? prev : { id: targetId, pos }));
  };

  // Re-parent / reorder the dragged collection relative to the drop target, then
  // persist a fresh full ordering. Only the dragged node moves; its subtree (and
  // every other node) keeps its parentId, so orderFromFlat re-nests everything.
  const moveCollection = (draggedId: string, targetId: string, pos: 'before' | 'inside' | 'after') => {
    const collIds = new Set(collections.map((c) => c.todo.id));
    const effParent = (id: string): string | null => {
      const p = byId.get(id)?.todo.parentId ?? null;
      return p && collIds.has(p) ? p : null;
    };
    const newParent = pos === 'inside' ? targetId : effParent(targetId);

    const nodes = flattenTree(entries)
      .map((n) => ({ id: n.id, parentId: n.parentId }))
      .filter((n) => n.id !== draggedId);
    const ti = nodes.findIndex((n) => n.id === targetId);
    if (ti === -1) return;
    nodes.splice(pos === 'before' ? ti : ti + 1, 0, { id: draggedId, parentId: newParent });

    onReorder(orderFromFlat(nodes));
    if (pos === 'inside') {
      setCollapsedColls((prev) => { const n = new Set(prev); n.delete(targetId); return n; });
    }
  };

  // Commit using the live dropInfo (what the highlight/line shows), not the DOM
  // element the drop happened to land on — the "after" line sits in the gap
  // between rows, so the release often lands off the intended row.
  const onCollDrop = () => {
    if (dragCollId && dropInfo && !inDraggedSubtree(dropInfo.id)) {
      moveCollection(dragCollId, dropInfo.id, dropInfo.pos);
    }
    setDragCollId(null);
    setDropInfo(null);
    sideScroll.stop();
  };

  return { sideScroll, dragCollId, setDragCollId, dropInfo, setDropInfo, onCollDragOver, onCollDrop };
}

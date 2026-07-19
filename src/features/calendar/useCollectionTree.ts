import { useMemo, useState, useCallback } from 'react';
import type { Todo, DayTodos } from '@shared/types';
import { todoIndex, type OrganizerEntry } from '@/features/tasks/model';

// Same shape as the planner's VisibleCollection (structurally assignable to
// CollectionTree's prop). Kept local so this hook doesn't reach into planner internals.
type VisibleCollection = { entry: OrganizerEntry; depth: number; hasChildren: boolean };

// The collection tree the Calendar's filter needs, derived straight from `dayTodos`.
// The planner builds the same shapes inside useHubData (its heavy read pipeline); the
// calendar only needs the navigator data, so this mirrors that small slice standalone:
// the flattened collection tree (+ collapse state), per-collection task counts, and the
// uncategorized count. Collapse state is local/ephemeral - the calendar doesn't DB-sync
// it the way the planner sidebar does.
export function useCollectionTree(dayTodos: DayTodos[]): {
  byId: Map<string, Todo>;
  visibleCollections: VisibleCollection[];
  collectionCount: (id: string) => number;
  uncategorizedCount: number;
  allCollectionIds: string[];
  descendantCollIds: (id: string) => string[];
  collapsedColls: Set<string>;
  toggleCollColl: (id: string) => void;
} {
  const [collapsedColls, setCollapsedColls] = useState<Set<string>>(new Set());
  const toggleCollColl = useCallback((id: string) => {
    setCollapsedColls((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const byId = useMemo(() => todoIndex(dayTodos), [dayTodos]);

  // Collections grouped by parent (root = null), each list in hub order. A parentId
  // pointing outside the collection set is treated as a root.
  const collChildren = useMemo(() => {
    const collections = [...byId.values()].filter((t) => t.isCollection);
    collections.sort((a, b) => (a.hubOrder ?? a.createdAt) - (b.hubOrder ?? b.createdAt));
    const ids = new Set(collections.map((c) => c.id));
    const m = new Map<string | null, Todo[]>();
    for (const c of collections) {
      const pid = c.parentId && ids.has(c.parentId) ? c.parentId : null;
      const arr = m.get(pid) ?? [];
      arr.push(c);
      m.set(pid, arr);
    }
    return m;
  }, [byId]);

  // Depth-first flatten into render order, hiding children of collapsed collections.
  const visibleCollections = useMemo(() => {
    const out: VisibleCollection[] = [];
    const walk = (pid: string | null, depth: number) => {
      for (const c of collChildren.get(pid) ?? []) {
        const kids = collChildren.get(c.id) ?? [];
        out.push({ entry: { todo: c }, depth, hasChildren: kids.length > 0 });
        if (kids.length && !collapsedColls.has(c.id)) walk(c.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [collChildren, collapsedColls]);

  // Task-descendant count per collection (every non-collection descendant), computed in
  // one ancestor walk - matches useHubData's collectionCounts.
  const collectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of byId.values()) {
      if (t.isCollection) continue;
      let p: string | null = t.parentId ?? null;
      const seen = new Set<string>();
      while (p && byId.has(p) && !seen.has(p)) {
        seen.add(p);
        const pe = byId.get(p)!;
        if (pe.isCollection) counts.set(p, (counts.get(p) ?? 0) + 1);
        p = pe.parentId ?? null;
      }
    }
    return counts;
  }, [byId]);
  const collectionCount = useCallback(
    (id: string) => collectionCounts.get(id) ?? 0,
    [collectionCounts]
  );

  // Non-collection todos with no collection ancestor at all.
  const uncategorizedCount = useMemo(() => {
    let n = 0;
    for (const t of byId.values()) {
      if (t.isCollection) continue;
      if (taskCollectionAncestors(t, byId).size === 0) n++;
    }
    return n;
  }, [byId]);

  // Every collection id (for select-all + default seeding).
  const allCollectionIds = useMemo(
    () => [...byId.values()].filter((t) => t.isCollection).map((t) => t.id),
    [byId]
  );

  // All descendant collection ids of `id` (sub-collections, recursively) - used by the
  // "also apply to subcollections" prompt.
  const descendantCollIds = useCallback(
    (id: string): string[] => {
      const out: string[] = [];
      const stack = [...(collChildren.get(id) ?? [])];
      while (stack.length) {
        const c = stack.pop()!;
        out.push(c.id);
        for (const k of collChildren.get(c.id) ?? []) stack.push(k);
      }
      return out;
    },
    [collChildren]
  );

  return {
    byId,
    visibleCollections,
    collectionCount,
    uncategorizedCount,
    allCollectionIds,
    descendantCollIds,
    collapsedColls,
    toggleCollColl,
  };
}

// The set of collection ids `todo` belongs to - every isCollection ancestor along the
// parentId chain (root → nearest). Empty when the task is uncategorized.
export function taskCollectionAncestors(todo: Todo, byId: Map<string, Todo>): Set<string> {
  const out = new Set<string>();
  let pid = todo.parentId ?? null;
  const seen = new Set<string>();
  while (pid && byId.has(pid) && !seen.has(pid)) {
    seen.add(pid);
    const p = byId.get(pid)!;
    if (p.isCollection) out.add(p.id);
    pid = p.parentId ?? null;
  }
  return out;
}

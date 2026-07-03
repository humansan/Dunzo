import { OrganizerEntry } from '../../utils/todoFilters';
import { FlatNode } from './types';

// ── Tree helpers ─────────────────────────────────────────────────────────────

// Flatten the organizer todos into display order (depth-first by hubOrder),
// hiding collapsed nodes' children and, during a drag, the active node's subtree.
// With `flat`, hierarchy is dropped entirely: every entry becomes a depth-0 node
// with no children (search-style), still honoring the same sort/leaf ordering.
export function flattenTree(
  entries: OrganizerEntry[],
  opts: {
    collapsed?: Set<string>;
    excludeId?: string;
    // When provided, siblings are sorted by this comparator instead of hubOrder.
    sortFn?: (a: OrganizerEntry, b: OrganizerEntry) => number;
    // Segregate leaf tasks (non-collection items) to the top or bottom of each
    // sibling group. 'none' preserves the mixed order (default).
    leafPosition?: 'top' | 'bottom' | 'none';
    // Ignore nesting: emit one flat, sorted, depth-0 list with no collapse.
    flat?: boolean;
  } = {}
): FlatNode[] {
  // Sibling order: leaf segregation first (when enabled), then user sort / hubOrder.
  const cmp = (a: OrganizerEntry, b: OrganizerEntry) => {
    if (opts.leafPosition === 'top') {
      const diff = (a.todo.isCollection ? 1 : 0) - (b.todo.isCollection ? 1 : 0);
      if (diff !== 0) return diff;
    } else if (opts.leafPosition === 'bottom') {
      const diff = (a.todo.isCollection ? 0 : 1) - (b.todo.isCollection ? 0 : 1);
      if (diff !== 0) return diff;
    }
    if (opts.sortFn) return opts.sortFn(a, b);
    return (a.todo.hubOrder ?? a.todo.createdAt) - (b.todo.hubOrder ?? b.todo.createdAt);
  };

  // Flat mode: one sorted pass, no tree walk, no collapse — every node at depth 0.
  if (opts.flat) {
    return entries
      .filter((e) => e.todo.id !== opts.excludeId)
      .slice()
      .sort(cmp)
      .map((e) => ({
        id: e.todo.id,
        parentId: e.todo.parentId ?? null,
        depth: 0,
        entry: e,
        hasChildren: false,
      }));
  }

  const ids = new Set(entries.map((e) => e.todo.id));
  const byParent = new Map<string | null, OrganizerEntry[]>();
  for (const e of entries) {
    const pid = e.todo.parentId && ids.has(e.todo.parentId) ? e.todo.parentId : null;
    const arr = byParent.get(pid) ?? [];
    arr.push(e);
    byParent.set(pid, arr);
  }
  for (const list of byParent.values()) list.sort(cmp);
  const out: FlatNode[] = [];
  const walk = (pid: string | null, depth: number) => {
    for (const e of byParent.get(pid) ?? []) {
      const id = e.todo.id;
      const hasChildren = (byParent.get(id)?.length ?? 0) > 0;
      out.push({ id, parentId: pid, depth, entry: e, hasChildren });
      const skip = opts.collapsed?.has(id) || opts.excludeId === id;
      if (!skip) walk(id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// Rebuild a contiguous parent-grouped order from a (possibly detached) flat list,
// so subtasks always follow their parent after a drop.
export function orderFromFlat(
  nodes: { id: string; parentId: string | null }[]
): { id: string; parentId: string | null }[] {
  const byParent = new Map<string | null, string[]>();
  for (const n of nodes) {
    const arr = byParent.get(n.parentId) ?? [];
    arr.push(n.id);
    byParent.set(n.parentId, arr);
  }
  const out: { id: string; parentId: string | null }[] = [];
  const visited = new Set<string>();
  const walk = (pid: string | null) => {
    for (const id of byParent.get(pid) ?? []) {
      if (visited.has(id)) continue;
      visited.add(id);
      out.push({ id, parentId: pid });
      walk(id);
    }
  };
  walk(null);
  // Safety: any unreachable nodes (e.g. cycles) fall back to the root.
  for (const n of nodes) if (!visited.has(n.id)) { visited.add(n.id); out.push({ id: n.id, parentId: null }); }
  return out;
}

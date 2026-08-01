import { Todo } from '../types';

// ── Archive invariant (a subtree archives together) ──────────────────────────
//
// Archiving a todo archives its whole subtree (see handleArchiveTodo). Every
// read path then assumes the result:
//
//   INVARIANT: a todo whose PARENT is archived is itself archived.
//
// Equivalently, "archived" flows down and never stops halfway: there is no such
// thing as a live todo hanging under an archived one. The read pipeline relies on
// it - the Planner's ancestry walks run over the NON-archived entry set, so a live
// child of an archived parent has an ancestor chain that simply stops. It renders
// un-nested at the root of the tree, counts as uncategorized while its Collection
// cell still resolves the archived ancestor to a collection name, and is missing
// from that collection's own view and its sidebar count. The row exists in two
// contradictory states at once because half the app can see its parent and half
// cannot.
//
// That state used to be reachable: "Create task inside" on an archived row made a
// live child under an archived parent, and nothing reconciled it. Cascading on
// archive is not enough on its own - it fixes the todos that exist at that moment
// and says nothing about the ones written afterwards. So the rule is enforced at
// the write boundary instead, on the client (composed into the write chain) and
// again on the server (an authoritative backstop), exactly like the visibility and
// schedule invariants next door.
//
// Direction matters: only DOWN. A child may be archived under a live parent - that
// is the ordinary case the Archived view is built around, and it is why unarchiving
// a parent must not drag its archived children back out.
//
// Checking the DIRECT parent is enough. The invariant holds inductively: if it is
// true of every parent/child pair, no chain can contain a live node beneath an
// archived one. That keeps the server backstop to a single-row lookup instead of a
// recursive ancestor walk.

// The fields that can break the invariant: the archived flag itself, and the
// parentId that decides WHICH parent the todo answers to. A patch touching
// neither cannot violate it, so the server can skip its parent lookup (mirrors
// touchesVisibility / touchesSchedule).
export const ARCHIVE_KEYS = ['archived', 'parentId'] as const;

export function touchesArchive(patch: object): boolean {
  return ARCHIVE_KEYS.some((k) => k in patch);
}

// Return a copy of `todo` corrected to satisfy the invariant against its parent.
// `parent` is the todo's CURRENT parent row (undefined/null when it has none, or
// when the parent could not be resolved - an unresolvable parent is left alone
// rather than guessed at).
//
// The correction archives the child rather than rejecting the write: it keeps the
// subtree intact and matches what archiving the parent would have done anyway. The
// alternative - refusing - would silently discard a task the user just created.
export function reconcileArchived(todo: Todo, parent: Todo | null | undefined): Todo {
  if (!parent) return todo;
  if (parent.archived !== true) return todo;
  return todo.archived === true ? todo : { ...todo, archived: true };
}

// Whether `todo` currently satisfies the invariant against `parent`. For callers
// that want to gate an action (e.g. hide a "create inside" affordance) rather than
// correct a write.
export function archiveConsistent(todo: Todo, parent: Todo | null | undefined): boolean {
  return reconcileArchived(todo, parent) === todo;
}

// ── The two subtree operations ───────────────────────────────────────────────
//
// The upward per-row rule above can only ever correct the row being written, and
// that is not enough on its own: archiving a PARENT is a statement about rows
// nobody is writing. So archive and unarchive are subtree operations, and these
// compute exactly which rows each one has to touch. Pure, so the confirmation
// dialog can count the same rows the write will change - the number in the prompt
// and the number of patches are the same list.
//
// Both take a flat todo list (every todo, archived included) rather than an index,
// because archiving needs children-by-parent and unarchiving needs parent-by-id.

// `rootId` plus every descendant that isn't already archived - what archiving the
// root must also archive. Cycle-safe via the visited set.
export function descendantsToArchive(todos: Todo[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const t of todos) {
    if (!t?.parentId) continue;
    const arr = childrenOf.get(t.parentId) ?? [];
    arr.push(t.id);
    childrenOf.set(t.parentId, arr);
  }
  const byId = new Map(todos.filter(Boolean).map((t) => [t.id, t]));
  const out: string[] = [];
  const seen = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    const t = byId.get(id);
    if (t && t.archived !== true) out.push(id);
    for (const c of childrenOf.get(id) ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      stack.push(c);
    }
  }
  return out;
}

// `rootId` plus every ARCHIVED ancestor - what unarchiving the root must also
// unarchive, because a live todo may not sit under an archived one. Live ancestors
// are already fine and are left out; the walk continues past them so an archived
// grandparent above a live parent is still caught.
export function ancestorsToUnarchive(todos: Todo[], rootId: string): string[] {
  const byId = new Map(todos.filter(Boolean).map((t) => [t.id, t]));
  const out: string[] = [];
  const root = byId.get(rootId);
  if (!root) return out;
  if (root.archived === true) out.push(rootId);
  let pid = root.parentId ?? null;
  const seen = new Set<string>([rootId]);
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    const parent = byId.get(pid);
    if (!parent) break;
    if (parent.archived === true) out.push(parent.id);
    pid = parent.parentId ?? null;
  }
  return out;
}

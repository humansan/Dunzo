import { Todo } from '@shared/types';

// ── Ancestry: one upward walk, one explicit domain ───────────────────────────
//
// Collection membership is positional: a task's collection is its nearest
// `isCollection` ancestor along the parentId chain, and it belongs to every
// collection on the way to the root. Almost every question the app asks about a
// task's place in the tree - what collection is it in, is it uncategorized, is it
// inside this subtree, how many tasks does this collection hold - is that same
// walk with a different stopping condition.
//
// It used to be written out by hand at a dozen call sites, and the copies did not
// agree on THE DOMAIN: which index they walked over.
//
//   • The FULL index (todoIndex(dayTodos)) contains every todo, archived ones
//     included. It answers questions about the data.
//   • A live-only index (built from the non-archived organizer entries) stops
//     dead at an archived row, because that row simply isn't in it.
//
// A live task under an archived parent therefore came out uncategorized when the
// walk ran over the live index, while its Collection cell - resolved over the full
// index - still showed the collection it was in. The same row, in two contradictory
// states, depending on which copy of the walk happened to ask.
//
// So: PASS THE FULL INDEX. The archive invariant (shared/domain/todoArchive)
// guarantees that a live todo's ancestors are all live, so for any live row the two
// indexes give the same answer anyway - the live-only walk was never buying
// anything, and it was wrong for archived rows. Reserve a narrower index for
// questions that are genuinely about what's RENDERABLE right now (e.g. "which of
// the rows on screen can accept this drop"), and say so at that call site.
//
// `index` is a plain `Map<string, Todo>` so the domain is always a visible argument
// rather than something a helper closes over.

export type TodoIndex = Map<string, Todo>;

// THE walk: every ancestor of `todo`, nearest first, ending at the root. Stops at
// an id missing from `index` (the domain boundary) and is cycle-safe, so corrupt
// parentId loops terminate instead of hanging the render.
export function* ancestorsOf(todo: Pick<Todo, 'parentId'>, index: TodoIndex): Generator<Todo> {
  let pid = todo.parentId ?? null;
  const seen = new Set<string>();
  while (pid && !seen.has(pid)) {
    const parent = index.get(pid);
    if (!parent) return;
    seen.add(pid);
    yield parent;
    pid = parent.parentId ?? null;
  }
}

// The id of the nearest collection ancestor, or null when the task sits at the
// root of the tree (an "uncategorized" task).
export function collectionOf(todo: Pick<Todo, 'parentId'>, index: TodoIndex): string | null {
  for (const a of ancestorsOf(todo, index)) if (a.isCollection) return a.id;
  return null;
}

// Whether the task is inside any collection - the exact complement of
// "uncategorized", so both views are driven by one predicate.
export function hasCollectionAncestor(todo: Pick<Todo, 'parentId'>, index: TodoIndex): boolean {
  return collectionOf(todo, index) !== null;
}

// Every collection the task belongs to (root → nearest are all included, order not
// significant). A task belongs to its whole collection chain, not just the nearest.
export function collectionAncestors(todo: Pick<Todo, 'parentId'>, index: TodoIndex): Set<string> {
  const out = new Set<string>();
  for (const a of ancestorsOf(todo, index)) if (a.isCollection) out.add(a.id);
  return out;
}

// Whether `ancestorId` is anywhere above `todo`. Used for subtree views, for
// "can't nest a task inside its own descendant" guards, and for drag targeting.
// Strict: a todo is not its own descendant.
export function isDescendantOf(
  todo: Pick<Todo, 'parentId'>,
  ancestorId: string,
  index: TodoIndex
): boolean {
  for (const a of ancestorsOf(todo, index)) if (a.id === ancestorId) return true;
  return false;
}

// Root → leaf chain of collections ending at `collId` (for breadcrumb display).
// Walks from a collection id rather than a task, and stops at the first ancestor
// that isn't a collection.
export function collectionPath(collId: string | null, index: TodoIndex): Todo[] {
  const out: Todo[] = [];
  let id: string | null = collId;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    const c = index.get(id);
    if (!c || !c.isCollection) break;
    seen.add(id);
    out.unshift(c);
    id = c.parentId ?? null;
  }
  return out;
}

// The nearest collection at or above `startId` (unlike collectionOf, `startId`
// itself counts). Used when a dragged collection has to snap up to a legal parent.
export function nearestCollectionAt(startId: string | null, index: TodoIndex): string | null {
  if (!startId) return null;
  const start = index.get(startId);
  if (!start) return null;
  if (start.isCollection) return start.id;
  return collectionOf(start, index);
}

import { Todo } from '../types';

// ── Task Planner visibility invariant (a subtree shows together) ─────────────
//
//   INVARIANT: a todo that shows in the Task Planner has a PARENT that shows in
//   the Task Planner.
//
// Equivalently: hidden flows DOWN and never stops halfway - there is no such
// thing as a Planner-visible todo hanging under a Planner-hidden one.
//
// This is the same failure the archive invariant next door describes, reached by
// a different route. The Planner's entry set is `showsInOrganizer`, so a hidden
// PARENT is missing from it and the child's ancestor chain simply stops: the row
// renders un-nested at the ROOT of the tree, orphaned from the task it belongs
// to, while its Collection cell still resolves through the hidden ancestor. Half
// the app can see its parent and half cannot - see todoArchive.ts, and the same
// note on applyFilters (features/planner/model/viewUtils), where the row-by-row
// filter used to re-parent survivors to the root for exactly this reason.
//
// Planner-only, deliberately. The daily checklist is flat and date-keyed - a
// subtask renders there as its own row, with no ancestry to break - so
// `showInDailyList` carries no such constraint.
//
// Direction of correction matters, and it is the opposite of the archive rule:
// there, `archived` flows down, so a child is corrected TO the parent's state.
// Here the same is true for the per-row check below (a Planner-visible child of a
// hidden parent gets hidden), but the SUBTREE operations go both ways - see the
// three of them at the bottom.
//
// Enforced at the write boundary on the client (composed into the write chain in
// lib/app-data) and again on the server (server/routes/todos), exactly like the
// visibility, schedule and archive invariants - which is why it lives in
// `shared/` rather than in either tree.
//
// Checking the DIRECT parent is enough, inductively: if it holds of every
// parent/child pair, no chain can contain a visible node beneath a hidden one.
// That keeps the server backstop to a single-row lookup instead of an ancestor
// walk.

// The fields that can break the invariant: the flag itself, and the parentId that
// decides WHICH parent the todo answers to. A patch touching neither cannot
// violate it (mirrors touchesArchive / touchesSchedule).
//
// `parentId` is why un-parenting needs no special handling anywhere: a child that
// loses its parent is re-evaluated as a root by normalizeVisibility, which forces
// it back into the Planner if it has no date to reach the daily checklist with.
// Every re-parent path - the parent picker, a Planner drag, a subtask-list drag,
// the collection picker - goes through the same boundary and gets that for free.
export const PLANNER_VIS_KEYS = ['showInDatabase', 'parentId'] as const;

export function touchesPlannerVisibility(patch: object): boolean {
  return PLANNER_VIS_KEYS.some((k) => k in patch);
}

// Whether a todo is Planner-visible for the purposes of THIS invariant: the raw
// flag, not showsInOrganizer. The archived half of that predicate is deliberately
// left out - the archive invariant already guarantees a live todo never hangs
// under an archived one, so folding `archived` in here would only let the two
// rules fight over the same rows.
const shows = (todo: Todo): boolean => todo.showInDatabase === true;

// Return a copy of `todo` corrected to satisfy the invariant against its parent.
// `parent` is the todo's CURRENT parent row (undefined/null when it has none, or
// when the parent could not be resolved - an unresolvable parent is left alone
// rather than guessed at, as in reconcileArchived).
//
// The correction HIDES the child rather than rejecting the write or promoting the
// parent: dropping a task into a hidden parent is a statement about where the task
// belongs, not about what the parent should look like, and promoting the parent
// would silently undo a deliberate hide. The task stays reachable inside its
// parent's full view either way (see normalizeVisibility).
//
// Collections are exempt: they are database-only folders, pinned visible by
// normalizeVisibility, and they nest under collections - never under a task - so
// this can only ever fire on one via malformed data. Hiding it would just start a
// fight between the two rules.
export function reconcilePlannerVisibility(todo: Todo, parent: Todo | null | undefined): Todo {
  if (!parent || todo.isCollection) return todo;
  if (shows(parent)) return todo;
  return shows(todo) ? { ...todo, showInDatabase: false } : todo;
}

// Whether `todo` currently satisfies the invariant against `parent`. For callers
// that want to gate an action rather than correct a write.
export function plannerVisibilityConsistent(todo: Todo, parent: Todo | null | undefined): boolean {
  return reconcilePlannerVisibility(todo, parent) === todo;
}

// ── The three subtree operations ─────────────────────────────────────────────
//
// The per-row rule above can only correct the row being written, and that is not
// enough on its own: hiding a PARENT is a statement about rows nobody is writing.
// So these compute exactly which rows each direction has to touch. Pure, so the
// confirmation dialogs can count the same rows the write will change - the number
// in the prompt and the number of patches are the same list.
//
// Two of the three are mandatory (they ARE the invariant) and one is a choice:
//
//   hide down    hiding a task hides everything inside it.        mandatory
//   show up      showing a task shows its hidden parents.         mandatory
//   show down    showing a task MAY show its hidden children.     optional
//
// The last one is a genuine choice because a hidden child under a visible parent
// is an ordinary, legal state (it is how you hide a single subtask). After a
// cascade-hide, though, a child hidden deliberately and a child hidden as
// collateral are indistinguishable - so the caller asks rather than guessing.
//
// All three take a flat todo list (every todo) rather than an index, because the
// downward walks need children-by-parent and the upward one needs parent-by-id.

function childIndex(todos: Todo[]): Map<string, string[]> {
  const childrenOf = new Map<string, string[]>();
  for (const t of todos) {
    if (!t?.parentId) continue;
    const arr = childrenOf.get(t.parentId) ?? [];
    arr.push(t.id);
    childrenOf.set(t.parentId, arr);
  }
  return childrenOf;
}

// Walk `rootId`'s subtree, collecting the ids whose todo passes `take`. Cycle-safe
// via the visited set; the walk continues THROUGH rows it doesn't collect, so a
// non-matching row never hides its matching descendants.
function subtree(todos: Todo[], rootId: string, take: (t: Todo) => boolean): string[] {
  const childrenOf = childIndex(todos);
  const byId = new Map(todos.filter(Boolean).map((t) => [t.id, t]));
  const out: string[] = [];
  const seen = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    const t = byId.get(id);
    if (t && take(t)) out.push(id);
    for (const c of childrenOf.get(id) ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      stack.push(c);
    }
  }
  return out;
}

// `rootId` plus every descendant currently visible in the Planner - what hiding
// the root must also hide. Collections are skipped (they can't be hidden), but the
// walk passes through them so a task nested below one is still caught.
export function descendantsToHide(todos: Todo[], rootId: string): string[] {
  return subtree(todos, rootId, (t) => shows(t) && !t.isCollection);
}

// `rootId` plus every descendant currently hidden - what showing the root MAY also
// show, if the user asks for it. Already-visible descendants are left out; they're
// untouched either way.
export function descendantsToShow(todos: Todo[], rootId: string): string[] {
  return subtree(todos, rootId, (t) => !shows(t) && !t.isCollection);
}

// `rootId` plus every HIDDEN ancestor - what showing the root must also show,
// because a todo may not appear in the Planner without its parents. Visible
// ancestors are already fine and are left out; the walk continues past them so a
// hidden grandparent above a visible parent is still caught. Unlike the descendant
// lift this one is mandatory - it's the invariant, not a preference.
export function ancestorsToShow(todos: Todo[], rootId: string): string[] {
  const byId = new Map(todos.filter(Boolean).map((t) => [t.id, t]));
  const out: string[] = [];
  const root = byId.get(rootId);
  if (!root) return out;
  if (!shows(root)) out.push(rootId);
  let pid = root.parentId ?? null;
  const seen = new Set<string>([rootId]);
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    const parent = byId.get(pid);
    if (!parent) break;
    if (!shows(parent) && !parent.isCollection) out.push(parent.id);
    pid = parent.parentId ?? null;
  }
  return out;
}

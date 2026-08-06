import { format } from 'date-fns';
import type { Todo } from '@shared/types';
import type { ColKey, FilterRule } from '@/features/planner/types';
import type { ViewDef } from '@/features/planner/views';
import { buildFilterCreatePatch, groupCreateSpec, owningGroupOfTodo } from '@/features/planner/model/viewUtils';

// ── The one answer to "what does a new task need?" ───────────────────────────
//
// Every Planner create surface - the add-row, both kinds of section "+", the
// context menu's create-inside and add-above/below - is the same operation with a
// different destination, and a task's seed is a function of exactly that: WHERE it
// will land. Stating it once here is what keeps the surfaces from disagreeing,
// which they did in five different ways: the subtask creators seeded nothing at
// all (so a task created inside another in a filtered view was filtered straight
// back out, leaving its inline title editor attached to a row that had left the
// screen), and add-above/below applied a view's seed PATCH while dropping its
// DATE, which did the same thing in the In Daily List tab.
//
// The invariant this exists to hold: a task created in a view satisfies that view
// and lands in the section it was created from.

export interface CreateArgs {
  parentId: string | null;
  date?: string | null;
  patch: Partial<Todo>;
}

export interface CreateContext {
  // Where the task will live in the tree. A collection id or a task id (a
  // subtask), or null for the view's root.
  parentId: string | null;
  // The section the new row will render in, as a raw group key - what the "+" on
  // that header would seed. null when nothing should be seeded from the grouping:
  //
  //   • 'collection' grouping (membership comes from `parentId`), or
  //   • a SUBTASK, whose section is decided by its root ancestor no matter what
  //     it carries (see buildGroupedItems/resolveOwningGroup). Seeding it there
  //     would write a field the user didn't ask for to no visible effect.
  groupValue: string | null;
  view: ViewDef;
  filters: FilterRule[];
  groupBy: ColKey;
}

// Precedence, widest to narrowest - later wins:
//   1. the view's own seed (what the tab needs to keep showing the task),
//   2. the active filters (the user's explicit, in-view constraints),
//   3. the section it was created from (the most specific statement of all).
// The base defaults (status, the visibility flags, hubOrder) sit below all of
// this in addHubTodo, where parent inheritance is also applied.
export function buildCreateArgs(ctx: CreateContext): CreateArgs {
  const { parentId, groupValue, view, filters, groupBy } = ctx;
  const seed = view.createSeed?.();
  const group =
    groupValue !== null && groupBy !== 'collection'
      ? groupCreateSpec(groupBy, groupValue)
      : { date: null, patch: {} };
  return {
    parentId,
    // A section's date (the bucket's earliest qualifying day) is more specific
    // than the view's, so it wins; `null` means the section named none.
    date: group.date ?? seed?.date,
    patch: { ...seed?.patch, ...buildFilterCreatePatch(filters), ...group.patch },
  };
}

// The section key a task created NEXT TO `anchor` should be seeded with - the
// anchor's own section, so "Add task above/below" lands the sibling where the
// user is looking, exactly as that section's "+" would.
//
// Read off the anchor's owning group rather than its raw field value: when the
// anchor is itself a subtask the pair will be placed by their shared root, and
// this keeps the seed consistent with that rather than with a value the section
// never consulted.
export function anchorGroupValue(
  anchor: Todo,
  groupBy: ColKey,
  todoById: Map<string, Todo>
): string | null {
  if (groupBy === 'collection') return null;
  return owningGroupOfTodo(anchor, groupBy, todoById, format(new Date(), 'yyyy-MM-dd'));
}

import { FlatNode, GroupRow, SectionsConfig } from '@/features/planner/types';

// ── Where the "+ New" rows go ────────────────────────────────────────────────
//
// The Planner used to offer one add-row, pinned under the last row of the table.
// In a view with sections that is the wrong place twice over: you scroll past
// every collection to reach it, and the task it creates appears back at the TOP,
// because loose tasks sort above collections (showLeafTasks) and the add-row was
// nowhere near the block it added to.
//
// So there is an add-row per CONTAINER now - the view's root, each collection or
// attribute section, and each task with subtasks - and one rule places all of
// them:
//
//   an add-row sits exactly where the task it creates will appear.
//
// That is knowable, not a guess: a new child gets hubOrder = max + 1 (see
// addHubTodo), so it sorts last among its siblings, and flattenTree's comparator
// then decides whether "last" means before or after the container's
// sub-collections (showLeafTasks: 'top' keeps leaf tasks above them, so a new
// task lands at the end of the leaf block rather than the end of the children).
// Both questions are answered here, once, for every container.
//
// The specs are POSITIONAL - "render after this row id" - rather than rows
// spliced into the list. The drag-and-drop layer indexes into the same flattened
// array for every drop computation (see useRowDnD), and a foreign row in it would
// silently corrupt that arithmetic.

export type AddRowKind = 'root' | 'collection' | 'group' | 'task';

export interface AddRowSpec {
  // Render this add-row directly after the row with this id; null = before every
  // row (an empty root block - where a first task would in fact appear).
  after: string | null;
  kind: AddRowKind;
  // The container to create in: a collection id, a task id, or null for the root.
  id: string | null;
  // 'group' only: the section's raw group value, as the header's "+" passes it.
  groupValue?: string;
  // Indent to draw at - the indent the created row will have, so the add-row
  // lines up with the rows it joins rather than with its container's header.
  indent: number;
}

// One-past-the-last row of each row's subtree. Rows are emitted depth-first, so a
// subtree is contiguous: row i's block ends at the first later row whose depth is
// not deeper than its own.
function blockEnds(depths: number[]): number[] {
  const end = new Array<number>(depths.length);
  const open: number[] = [];
  for (let i = 0; i < depths.length; i++) {
    while (open.length && depths[open[open.length - 1]] >= depths[i]) end[open.pop()!] = i;
    open.push(i);
  }
  while (open.length) end[open.pop()!] = depths.length;
  return end;
}

// The anchor for a container: the id of the last row of the block a new child
// would join, or the container's own row id when that block is empty (the
// add-row then sits directly under the header, above any sub-collections).
function anchorFor(
  rows: { id: string; parentId: string | null; isCollection: boolean }[],
  end: number[],
  containerIndex: number,
  containerId: string | null,
  containerRowId: string | null,
  leafPosition: SectionsConfig['showLeafTasks'],
): { after: string | null; childCount: number } {
  const from = containerIndex + 1;
  const to = containerIndex === -1 ? rows.length : end[containerIndex];
  let last: number | undefined;
  let childCount = 0;
  for (let j = from; j < to; j++) {
    if (rows[j].parentId !== containerId) continue;
    childCount++;
    // 'top' keeps leaf tasks above sub-collections, so a new task lands after the
    // last TASK child. 'bottom' and 'none' both put it after the last child of
    // any kind - under 'bottom' tasks are last anyway, and under 'none' the new
    // row simply carries the highest hubOrder.
    if (leafPosition === 'top' && rows[j].isCollection) continue;
    last = j;
  }
  return {
    after: last === undefined ? containerRowId : rows[end[last] - 1].id,
    childCount,
  };
}

// Collection-grouped mode (the default tree). Containers: the view root, every
// expanded collection, and every task with subtasks on screen.
export function planAddRows(
  rows: FlatNode[],
  opts: { leafPosition: SectionsConfig['showLeafTasks'] }
): AddRowSpec[] {
  const flat = rows.map((n) => ({
    id: n.id,
    parentId: n.parentId,
    isCollection: n.entry.todo.isCollection === true,
  }));
  const end = blockEnds(rows.map((n) => n.depth));
  const out: AddRowSpec[] = [];

  // The view root. Its container id is null here because flattenTree presents the
  // view's top level as parentless - in a collection view the collection node
  // itself isn't in the list. PlannerView re-attaches the real parent when it
  // creates (createArgs(selectedCollectionId)).
  const root = anchorFor(flat, end, -1, null, null, opts.leafPosition);
  out.push({ after: root.after, kind: 'root', id: null, indent: 0 });

  for (let i = 0; i < rows.length; i++) {
    const node = rows[i];
    const { after, childCount } = anchorFor(flat, end, i, node.id, node.id, opts.leafPosition);
    if (node.entry.todo.isCollection) {
      // A collection with children but none rendered is COLLAPSED - its block is
      // empty because the rows are folded away, not because it is empty - and an
      // add-row under a collapsed header would point at a list nobody can see.
      // A genuinely childless collection (hasChildren false) still gets one.
      if (node.hasChildren && childCount === 0) continue;
      // A collection doesn't cost its tasks an indent level (flattenTree's
      // indentOf), so its add-row sits at the collection's own indent.
      out.push({ after, kind: 'collection', id: node.id, indent: node.indent });
    } else {
      // Tasks get an add-row only when they actually have a subtask list on
      // screen: "the bottom of the subtasks" needs subtasks. Creating the first
      // one is what the context menu's "Create task inside" is for.
      if (childCount === 0) continue;
      out.push({ after, kind: 'task', id: node.id, indent: node.indent + 1 });
    }
  }
  return out;
}

// Attribute-grouped mode (Status / Priority / Date sections). Containers: every
// expanded section, and every task with subtasks. There is no root container -
// every task in this mode belongs to some section, including the "No <field>"
// one - EXCEPT when the view holds nothing at all, where a root add-row is the
// only way back from empty.
export function planGroupAddRows(rows: GroupRow[]): AddRowSpec[] {
  if (rows.length === 0) {
    return [{ after: null, kind: 'root', id: null, indent: 0 }];
  }
  const rowId = (r: GroupRow) => (r.type === 'header' ? r.id : r.node.id);
  const flat = rows.map((r) => ({
    id: rowId(r),
    // A section's own rows are its depth-0 tasks, which carry parentId null.
    parentId: r.type === 'header' ? null : r.node.parentId,
    isCollection: false,
  }));
  // A header closes every open task block: depth -1 sits above every task depth.
  const end = blockEnds(rows.map((r) => (r.type === 'header' ? -1 : r.node.depth)));
  const out: AddRowSpec[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.type === 'header') {
      if (row.isCollapsed) continue;
      // Sections hold no collections, so a new task always lands at the very end
      // of the section - the row before the next header.
      const to = end[i];
      out.push({
        after: to > i + 1 ? rowId(rows[to - 1]) : row.id,
        kind: 'group',
        id: null,
        groupValue: row.value,
        indent: 0,
      });
      continue;
    }
    // Same as the tree mode: only tasks with a rendered subtask list.
    if (end[i] <= i + 1) continue;
    out.push({
      after: rowId(rows[end[i] - 1]),
      kind: 'task',
      id: row.node.id,
      indent: row.node.indent + 1,
    });
  }
  return out;
}

// Group the specs by the row they follow, for rendering. Several containers can
// end on the same row - the last subtask of the last root task closes that task,
// its section, and the root all at once - and they are emitted DEEPEST FIRST so
// the add-rows step back out of the tree the way the rows they follow do.
export function addRowsByAnchor(specs: AddRowSpec[]): Map<string | null, AddRowSpec[]> {
  const m = new Map<string | null, AddRowSpec[]>();
  for (const s of specs) {
    const arr = m.get(s.after);
    if (arr) arr.push(s); else m.set(s.after, [s]);
  }
  for (const arr of m.values()) arr.sort((a, b) => b.indent - a.indent);
  return m;
}

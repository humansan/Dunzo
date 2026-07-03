# Task Planner — View Architecture

How to restructure the Task Planner so the **name cell / row** can power many views
(Table, List, flat search list, MacOS-Finder columns, list-as-sections) without a
mega-component full of `if (listView)` branches. This is an architecture proposal,
not a committed build — it evaluates the ideas in the brief and picks the cleanest
path. Companion to `GANTT_VIEW_IDEATION.md` / `TIMELINE_VIEW_IDEATION.md`, but this
one is about *code shape*, not a new visual view.

## TL;DR recommendation

1. **Kill the `listView: boolean`.** Replace it with a single `TableVariant`
   descriptor object (`mode`, `showNesting`, `columns`, `chrome`, `dnd`) provided
   via context. Adding a 3rd/4th view then means adding a descriptor, not editing a
   boolean ternary in five files.
2. **Make "show nesting" a real flag** (data layer *and* row), exactly as the brief
   suggests. This single flag is what unlocks the flat search list.
3. **Split `HubBody` into `TableSurface` (chrome/scroll) + `TableRows` (row-list
   generator)**, and wrap the whole thing as one `<TaskTable model variant />`
   component that takes a *few* grouped props instead of ~40 loose ones. Cheap to
   instantiate N times → Finder-columns and list-as-sections become trivial.
4. **Add `mode: 'column'`** as the brief proposes — pure styling (header rows sized
   like task rows), zero logic change.
5. **Keep drag-and-drop single-instance for now.** Gate it behind `variant.dnd` and
   leave it *on* only for Table/List; the multi-instance views (search, Finder
   columns) ship with DnD off. Cross-surface drag is a separate design problem — the
   same way the Timeline doc treats horizontal drag as net-new work.

## Grounding in what we already have

- **`TodosHubView.tsx`** (~760 lines) is the orchestrator. It owns *all* interaction
  state — `collapsed`, `editing`, the four toolbar-menu anchors, the row context
  menu, all modals — the DnD wiring (`useRowDnD` / `useCollectionDnD`), and it
  prop-drills **~40 props** straight into `HubBody`.
- **`useHubData`** is the data layer. It derives, for the *entire* current view, the
  `flattened` tree rows (collection grouping) and `groupedRows` (attribute grouping),
  plus counts. It assumes one dataset for one scroll surface.
- **`useHubViewConfig`** owns column layout: `visibleColumns`, `gridTemplateColumns`,
  widths, field order/visibility, filters, sorts, `SectionsConfig`.
- **`HubBody`** (~300 lines) is the presentation switch. A single `listView` boolean
  forks the render into **two large JSX trees**: table (sticky header row, all
  columns, horizontal scroll, an invisible width-anchor grid) vs. list (single Name
  column, `max-w-2xl` centered, a project-style `<h1>` title). Both then `.map()` the
  *same* `flattened`/`groupedRows` into `HubRow`/`GroupHeaderRow`.
- **`HubRow`** (~540 lines) renders one row. It branches `isCollection` →
  `SectionHeader`, else a grid of the sticky Name cell + field cells via `renderCell`.
  `listView` ternaries are sprinkled throughout (borders, backgrounds, wrap, spacer
  track).
- **`SectionHeader`** is already the shared shell for *both* collection headers and
  attribute-group headers (`GroupHeaderRow`) — a good existing example of the
  composition we want more of. It also carries its own `listView` conditional.
- Note: the top-level **`ListView.tsx`** is the *daily checklist* inside `TodoView`,
  a different component — not the planner's list mode. The planner's "list view" is
  purely the `viewMode === 'list'` path through `HubBody`.

So the bones are decent (data / config / presentation are already separate hooks; the
header shell is already shared). What resists new views is concentrated in three
places, below.

## Where the current code resists new views

1. **`listView` is a binary spread across files.** It's a prop on `HubBody`,
   `HubRow`, `SectionHeader`, and `GroupHeaderRow`, consumed as `listView ? A : B` in
   ~a dozen spots. A third mode (Column) forces every one of those ternaries to
   become a 3-way, and there's no single place that says "this is what a Column looks
   like." This is the #1 blocker to the brief's own "add a 3rd mode" idea.
2. **`HubBody` conflates three concerns** that want to vary independently:
   (a) the **scroll container + chrome** (sticky header bar vs. centered title vs.
   bare column), (b) the **row-list generation** (tree vs. grouped `.map`), and
   (c) the **column set / grid** (`effectiveColumns` / `effectiveGrid` are recomputed
   inline from `listView`). Because they're fused, you can't reuse the row-list
   generator under a different chrome, which is exactly what Finder-columns needs.
3. **Everything assumes one dataset in one scroll surface.** `useHubData` builds rows
   for the whole view; `useRowDnD` binds to one `tableScroll`; interaction state lives
   in the single parent. Any view that wants *multiple* independent row-lists on
   screen (Finder columns; list-as-sections) currently means running the whole
   40-prop pipeline N times.
4. **Nesting is not optional.** The expand/collapse chevron renders whenever
   `hasChildren`, and `flattenTree` always honors the tree + `collapsed`. There is no
   "flat" mode — so the search flat-list has nothing to switch off.

## The core idea: separate *what* from *how*, and name the *how*

Three layers, cleanly:

- **Model (what):** the row data + column layout. Already `useHubData` +
  `useHubViewConfig`. Minor additions below.
- **Variant (how):** a small descriptor object that *names* a presentation. Replaces
  the `listView` boolean.
- **Surface + Rows (render):** a chrome/scroll shell that hosts a reusable row-list
  generator.

### 1. `TableVariant` descriptor (replaces `listView`)

```ts
export type TableMode = 'table' | 'list' | 'column';

export interface TableVariant {
  mode: TableMode;          // drives chrome + row styling only
  showNesting: boolean;     // chevrons + indent + hierarchical flatten
  columns: 'all' | 'name';  // all fields, or just the Name column
  chrome: 'header' | 'title' | 'none'; // sticky header bar / project title / bare
  dnd: boolean;             // reorder-by-drag on this surface
}

export const VARIANTS: Record<string, TableVariant> = {
  table:  { mode: 'table',  showNesting: true,  columns: 'all',  chrome: 'header', dnd: true },
  list:   { mode: 'list',   showNesting: true,  columns: 'name', chrome: 'title',  dnd: true },
  column: { mode: 'column', showNesting: false, columns: 'name', chrome: 'none',   dnd: false },
  search: { mode: 'column', showNesting: false, columns: 'name', chrome: 'none',   dnd: false },
};
```

Provide it via a `TableVariantContext` so `HubRow` / `SectionHeader` read it instead
of receiving a `listView` prop. Because a variant object is stable (define the map at
module scope, or memoize per view), `React.memo` on `HubRow` stays effective — the
context value doesn't change identity between renders, so rows don't re-render just
because they now read context. This deletes `listView` from every row's prop list and
turns "what does Column look like?" into one object literal.

Every `listView ? A : B` becomes a lookup on `variant.mode` / `variant.chrome`, all
sourced from one descriptor. Adding a mode = adding a row to `VARIANTS`.

### 2. Make `showNesting` real (the flat-list unlock)

- **Data layer:** give `flattenTree` (or a thin wrapper in `useHubData`) a `flat`
  option. When off (current behavior) it walks the tree honoring `collapsed`. When on
  it emits every visible entry at `depth: 0`, `hasChildren: false`, ignoring
  `collapsed` — a flat list.
- **Row:** when `!variant.showNesting`, `HubRow` renders no chevron, no indent
  (`displayDepth` forced to 0), and no collapse affordance. The `hideDragHandle` prop
  already exists as precedent for conditionally dropping a control.

That's the whole flat search list: feed `<TaskTable>` a filtered entry set with
`variant.showNesting = false`.

### 3. Split `HubBody` → `TableSurface` + `TableRows`, expose `<TaskTable>`

- **`TableRows`** — pure generator. Given `{ rows, variant, model, interaction }`,
  emit `HubRow` / `GroupHeaderRow`. This is lines 113–189 of today's `HubBody`
  lifted out verbatim, minus the `listView` branching (now context). Reusable under
  *any* chrome.
- **`TableSurface`** — the scroll container + chrome, chosen by `variant.chrome`:
  `header` (sticky column-header bar + width anchor), `title` (centered `max-w-2xl`
  with the project `<h1>`), `none` (bare, for a Finder column or a search pane). Each
  is a small dedicated component; today's two big branches become two of them, and
  `none` is new and tiny.
- **`<TaskTable model variant interaction />`** — the public component that wires
  Surface + Rows together. Its props are a **handful of grouped bundles**, not 40
  loose ones:

  ```ts
  interface TaskTableProps {
    variant: TableVariant;
    model: { rows; columns; gridTemplateColumns; ... };  // from the hooks / a slice
    interaction: { editing; startEdit; stopEdit; openMenu; ... };
    rowHandlers: { onToggle; onSaveTodo; onAddSubtask; onQuickAdd; ... };
    dnd?: RowDnD;                                          // omit → no drag
    rootId?: string | null;                                // scope to a subtree slice
  }
  ```

  Grouping the props is what makes instantiating the table **N times** (Finder
  columns, list-as-sections) sane. Today you would prop-drill 40 × N.

### 4. `mode: 'column'` — pure style

As the brief says: Column mode changes nothing in logic. Header rows get the same
height/text-size as task rows (a branch already localized to `SectionHeader`), and
`chrome: 'none'`. It exists so the multi-column surfaces read as flat, even-height
lists. Implement purely inside `SectionHeader` + `TableSurface`.

## Mapping every target view onto the primitives

| View | How it's built |
|---|---|
| **Table** (today) | one `<TaskTable variant={VARIANTS.table}>` over the full model |
| **List** (today) | one `<TaskTable variant={VARIANTS.list}>` — same model, `title` chrome, name-only |
| **Flat search list** | one `<TaskTable variant={VARIANTS.search}>` fed a filtered, `flat` entry set — nesting off |
| **Finder columns** | a `<ColumnsView>` rendering an array of `<TaskTable rootId=… variant={VARIANTS.column}>`, one per drill level; clicking a collection pushes another column scoped to its children (nesting off, one level each) |
| **List-as-sections** | render one `<TaskTable variant={VARIANTS.column}>` per section, each scoped to that section's rows — *see the DnD caveat below* |

The `rootId` slice is the one data addition Finder-columns needs: a selector that,
given a collection id, returns just that collection's direct children as rows. It's a
filter over the existing `flattened` structure, not a new tree walk.

## Drag-and-drop: the real constraint (answers the brief's own worry)

The brief flags that splitting the list view into one-table-per-section "might break
drag and drop." It would — and here's exactly why: `useRowDnD` today sees **all**
rows and **all** group headers in one instance, which is what lets a task be dragged
*across* sections and reparented. Split that into N independent `<TaskTable>`
instances and each one only knows its own rows; cross-section drag dies unless DnD is
lifted into a **shared provider keyed by a surface id** — a real chunk of work.

Recommendation:

- **Do not** rebuild today's List view as N tables. Keep it a single `<TaskTable>`
  with a single-column grid (its current shape). It loses nothing and keeps DnD.
- **Reserve multi-instance rendering** for surfaces where cross-surface drag isn't
  required anyway: **search** (read/navigate only) and **Finder columns** (drag, if
  ever wanted, is a distinct interaction). Ship both with `variant.dnd = false`.
- Gate all of this behind the `variant.dnd` flag so a surface simply omits the `dnd`
  bundle to disable it. `HubRow` already supports `hideDragHandle` + optional drop
  handlers, so a DnD-less row is already expressible.

If cross-surface drag is wanted later, promote `useRowDnD` to a context provider that
tracks the active drag globally and lets any surface register as a drop zone — but
that's a follow-up, not a prerequisite.

## Suggested sequencing (each step independently shippable)

1. **Introduce `TableVariant` + context; delete the `listView` boolean.** Behavior-
   identical refactor — Table and List must render byte-for-byte the same. Easy to
   verify against the current UI; no new views yet.
2. **Add the `showNesting` flag** to the data flatten + `HubRow`. Still no new view,
   but now expressible.
3. **Extract `TableSurface` / `TableRows`; wrap as `<TaskTable>`** with grouped props.
   `HubBody` becomes a thin `<TaskTable variant={viewMode === 'list' ? list : table}>`.
4. **Add `mode: 'column'`** styling.
5. **Build the flat search list** (`variant.search` + a filtered entry feed) — the
   cheapest new view, validates the whole stack end-to-end.
6. **Build `<ColumnsView>`** (Finder) on top of `rootId`-scoped `<TaskTable>`s.

Steps 1–3 are pure refactors that pay for themselves even if no new view ships: they
shrink `HubBody`, remove ~40-prop drilling, and localize presentation decisions.

## What *not* to do

- Don't turn `HubRow` into a per-view component (`TableRow`, `ListRow`, `ColumnRow`).
  The name cell's value is that it's *one* component; forking it re-introduces the
  duplication `SectionHeader` was created to kill.
- Don't push view logic into `useHubData`. It should stay "here are the rows"; the
  variant decides how they look. The only data-side additions are the `flat` option
  and the `rootId` slice — both selectors over existing structure.
- Don't split today's List view into N tables (DnD, above).

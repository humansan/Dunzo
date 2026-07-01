# Gantt View — Feature Ideation

Third view for the Task Planner, alongside Table (done) and List (in progress). This
document is a brainstorm of features, abilities, and customization options to make
Gantt view feature-rich and competitive with Notion, Asana, and ClickUp timelines.
This is the classic Gantt layout — **one row per task or collection**, permanently —
as distinct from the lane-packing design in `TIMELINE_VIEW_IDEATION.md`, where
multiple tasks can share a row when their dates don't overlap. Nothing here is
committed to — it's a menu to pick from when we scope the actual build.

## Grounding in what we already have

- Every row (task *or* collection) is one `todos` record with `parentId` self-nesting
  and an `isCollection` flag — a Gantt needs to render both task bars and
  collection/section groupings from the same tree, and can reuse the exact
  flattened row list (`FlatNode`, `flattened`) that Table and List already build in
  `useHubData`/`HubBody`, in the same order, with the same collapse/expand state.
- Because each row is permanently one task, **the row model needs no new data
  structure at all** — Gantt is the view that reuses Table/List's row plumbing most
  directly. The one genuinely new piece of engineering is the bars themselves: date
  → pixel-position math, drag/resize hit-testing on bar edges, and (if built)
  dependency-arrow routing between two fixed rows.
- Tasks already carry `startDate`/`dueDate` + `startTime`/`dueTime`, so date-only bars
  and intraday (hour-level) bars are both possible without schema changes.
- `repeatInterval` is a simple "every N days" field — recurring bars on a Gantt is a
  natural showcase for this, but true RRULE-style recurrence would need schema work.
- Filter/Sort/Group menus, column-style field config, and drag-to-reorder/reparent
  already exist for Table view (`FilterMenu`, `SortMenu`, `SectionsMenu`,
  `useRowDnD`/`useCollectionDnD`) — Gantt should reuse these mechanisms/state
  directly and unmodified, since row order and row identity work exactly like they
  do in Table/List. This is a stronger reuse story than the timeline view gets,
  where sort only influences packing tie-breaks rather than row position.
- `GroupHeaderRow` (the existing swimlane/section divider used by Table/List for
  collection grouping) is directly reusable as-is for Gantt's collection swimlanes —
  it already renders as its own divider row between groups of task rows, which is
  exactly the shape a Gantt swimlane header needs.
- No gantt/calendar library is installed. `date-fns`, `recharts`, `motion`, and
  `@dnd-kit/*` are available; the grid, bars, and drag interactions would be
  hand-built on top of these.

## 1. Core timeline rendering

- Horizontal axis of dates with rows per task/collection (classic Gantt layout) —
  one row is always exactly one `todos` record, so row order is just the existing
  flattened tree order, not something computed from dates.
- **Left column decision: reuse the Name column, don't switch to swimlane-only
  labels.** Because a Gantt row already belongs to exactly one task, showing that
  task's name in a sticky left column (mirroring Table's sticky first column, the
  way List view already does) is free — it's information the row model already
  gives you, with indentation for nesting depth, a checkbox to toggle complete, a
  collapse/expand arrow for collections, and a drag handle for
  `useRowDnD`/`useCollectionDnD`, all reused verbatim from `HubRow`/`NAME_COL_KEY`.
  The alternative — left column shows only the swimlane/group name, task info moves
  into the bars — is what the *timeline* view is forced into, because a timeline
  lane can hold several tasks and there's no single row to label. Importing that
  constraint into Gantt would throw away already-solved UX (inline rename,
  nesting, drag-to-reparent) for no benefit, and would reintroduce the "bar too
  narrow for its label" overflow problem the timeline doc has to solve for a reason
  that simply doesn't apply here. Collection/swimlane names still surface via the
  existing `GroupHeaderRow` divider rows between groups — they don't need to
  replace the per-task label to be visible.
- Column width for the Name column is resizable (same `startResize`/`ColDef` width
  mechanism Table already has), so long task names aren't permanently cramped.
- Zoom levels: day / week / month / quarter / year — with the row grid density and
  bar label detail adapting per zoom.
- "Today" marker line, with a jump-to-today button.
- Weekend shading / non-working-day shading.
- Bars sized by `startDate`→`dueDate`; tasks with only a due date render as a
  milestone diamond/point instead of a bar.
- Hour-level precision option for same-day tasks using `startTime`/`dueTime` (zoom into
  a single day and see intraday blocks, similar to a calendar day view).
- Infinite/virtualized horizontal scroll instead of paginating by date range.
- Sticky left-hand list of task names (mirrors Table's sticky first column) so the
  name stays visible while scrolling the time axis horizontally.
- Row height is uniform and fixed per task (compact/comfortable, see §6) — unlike
  the timeline view, where a lane's height depends on how many sub-rows its packed
  tasks currently need, Gantt's total content height is just `rowHeight ×
  visibleRowCount`, which keeps vertical virtualization math simple.

## 2. Grouping & structure

- Group rows by Collection (respecting the existing nested tree), by Status, Priority,
  or by a custom attribute — reusing `SectionsConfig` from Table/List.
- Collapsible collection swimlanes, collapsible sub-collections (arbitrary depth,
  matching `parentId` nesting), using the same `collapsed`/`toggleCollapse` state
  `HubBody` already maintains for Table/List.
- Collection bar = min(start) → max(due) of its children, auto-rolled-up, shown as a
  lighter "envelope" bar behind/above its children's bars, rendered directly in the
  collection's own row (this works cleanly because the collection *is* a row like
  any task — there's no ambiguity about which bar belongs to which row, unlike the
  timeline view's lanes, which have no single row to draw one envelope bar on).
- Option to show only leaf tasks vs. show collections as bars themselves.
- Swimlane per Priority or per Assignee-equivalent (if collaboration/assignees ever
  ship) as an alternate grouping axis.
- Within a group, row order is exactly the task's `hubOrder`/`dailyOrder` (or
  whatever sort is active) — the same value already used to order Table/List rows.
  There is no packing step to recompute; changing sort just reorders rows the same
  way it does in Table today.
- Sub-collections nest as indented rows within their parent collection's block of
  rows, matching Table/List's existing indentation, not as separate nested lanes.

## 3. Editing & interaction directly on the timeline

- Drag a bar horizontally to shift both start and due date together.
- Drag the left/right edge of a bar independently to resize (change start or due
  date without moving the other).
- Click-drag on empty grid space to create a new task with start/due pre-filled from
  where you dragged.
- Drag a task vertically between collections to reparent it (same interaction model
  as `useCollectionDnD` in Table) — because every row is a specific task, dragging a
  row up/down the list is unambiguous and maps 1:1 onto reordering/reparenting,
  reusing `useRowDnD`/`useCollectionDnD` directly. (Contrast with the timeline view,
  where vertical drag *within* a lane has no meaningful target since sub-row
  position there is packing-assigned, not task-owned.)
- Inline rename on double-click of either the Name column cell or the bar label,
  kept in sync (same underlying field either way).
- Right-click context menu on a bar (same actions as `RowContextMenu`: duplicate,
  delete, change collection, set priority/status, etc.).
- Multi-select bars (shift/cmd-click or marquee-select) to bulk-drag/bulk-edit dates.
- Undo/redo for drag operations (snap-back on invalid drop, toast with "Undo").
- Snapping: bars snap to day/hour gridlines while dragging (configurable snap
  increment based on zoom level).
- Keyboard nudge: with a bar selected, arrow keys shift its dates by one snap
  increment, shift+arrow resizes from the near edge — useful since every row/bar
  pairing is stable and doesn't move around under the user's hands the way a
  packed timeline's sub-rows can.

## 4. Dependencies & relationships

- Task-to-task dependency lines (finish-to-start at minimum: "Task B starts after
  Task A finishes"), drawn as connector arrows between bars. Because every task has
  a fixed row, an arrow's endpoints only ever move horizontally when dates change —
  they never jump to a different row the way they would in the timeline view when a
  repack shifts a task to a different sub-row. This makes Gantt the natural home for
  dependency arrows and critical-path visualization; it's a materially easier and
  more stable feature to build here than in the timeline view.
- Dependency types beyond finish-to-start: start-to-start, finish-to-finish, and
  start-to-finish, plus optional lag/lead days on any of them — common in full PM
  tools and worth having once the base relation exists.
- Auto-shift dependent tasks when a predecessor's dates move (with an optional
  "ask before cascading" confirmation), rippling forward through the dependency
  chain.
- Critical-path highlighting (visually distinguish the chain of dependent tasks that
  determines the overall end date) — easy to scan top-to-bottom here since the
  chain's rows don't move, unlike a packed timeline where a critical chain could
  zig-zag across lanes.
- Dependency-violation warnings: flag a bar with a badge/red outline if it starts
  before its predecessor finishes (e.g., after a manual drag breaks the constraint),
  with a one-click "fix" that snaps it back to the valid date.
- Would require a new `dependsOn`/`blockedBy` relation — not in the current schema,
  flagged as a bigger lift, but given how much more stable dependency rendering is
  in this row model, it's a stronger candidate for Gantt than for the timeline view.

## 5. Recurrence on the timeline

- Render each recurrence of a `repeatInterval` task as its own ghosted/lighter bar
  extending forward on the same row (a recurring task's series still owns exactly
  one row; its future occurrences are extra bars drawn on that row, not new rows).
- Quick-create a recurring series directly from the timeline via drag ("repeat this
  bar every N days for the next M occurrences").
- Toggle to collapse a recurring series down to just its next occurrence, hiding the
  ghosted future bars when the row gets visually busy.

## 6. Visual customization

- Color bars by Collection color (already have a `color` field), by Priority, or by
  Status — user-selectable "color by" toggle, same pattern as Table's field coloring.
- Progress-fill inside each bar (reusing `startPercentage`/`duePercentage` /
  `calculateProgress` from `timeUtils.ts`) so a bar shows partial completion, not just
  scheduled span.
- Bar/row density toggle (compact vs. comfortable row height) — applies uniformly to
  every row, since row height isn't computed from packing the way a timeline lane's
  height is.
- Show/hide XP, notes icon (hover-to-preview notes), estimated-time chip, priority
  flag directly on the bar. Since the task name already lives in the Name column,
  the bar itself is freed up to carry these secondary badges without competing for
  space with the label — a small but real advantage of the column decision in §1.
- Configurable date-axis format (relative "in 3 days" vs. absolute "Jul 4").
- Optional "milestone" bar style (diamond) vs. duration bar style, auto-selected when
  start === due but user-overridable.
- Row striping / alternating background per collection swimlane, to make it easier
  to visually track a row across a wide horizontal scroll.

## 7. Filtering, sorting & views

- Reuse existing `FilterRule`/`SortRule` engines: filter timeline by status, priority,
  collection, date range, overdue-only, etc. Filtering a task out simply removes its
  row entirely — there's no repacking side effect the way filtering can shrink a
  timeline lane's sub-row count.
- Sort rows within a swimlane by start date, priority, or manual order
  (`hubOrder`/`dailyOrder`-style custom ordering, drag to reorder rows vertically).
  Sort maps directly and unambiguously onto row order here — unlike the timeline
  view, where sort only breaks ties inside the packing algorithm rather than fixing
  a task's position.
- Saved timeline "layouts" per collection/workspace (remembered zoom level, grouping,
  filters — same persistence pattern as `useHubViewConfig`).
- Toggle to include/exclude tasks with no dates (list them in an "unscheduled" tray
  alongside the timeline, draggable onto the grid to schedule them).
- Search/highlight: typing a query dims non-matching bars and highlights matches (and
  also dims/greys the corresponding Name-column row, not just the bar).

## 8. Overview & navigation aids

- Minimap/overview strip at the top showing the full project span, with a draggable
  viewport window (like a video editor scrubber) for fast navigation on long timelines.
- "Fit to screen" button that zooms/scrolls to fit all visible tasks' date ranges.
- Keyboard shortcuts: arrow keys to pan, +/- to zoom, `T` to jump to today.
- Breadcrumb of current collection scope when drilled into a nested collection's
  own timeline.
- "Jump to task" search that scrolls the row list vertically to a task and flashes
  its bar — cheap to build here since a task's row position is stable and known in
  advance, rather than dependent on where packing happened to place it.

## 9. Collaboration & feedback (future-facing, matches existing "collaboration" backlog item)

- Avatars/initials on bars if multi-user assignment ships.
- Comment indicator on bars linking to task notes/discussion.
- Live cursor/presence on the timeline grid if realtime collaboration is added
  (there's already a backlog note about Sequin/streaming for this).

## 10. Export & sharing

- Export current timeline view as an image or PDF for status reports.
- Print-friendly layout (flatten zoom/scroll into a single page range).
- Shareable read-only link to a filtered timeline view.

## Suggested phasing (not a commitment, just a sane build order)

1. **MVP**: static horizontal date grid, sticky Name column reused from List view
   (`HubRow`/`NAME_COL_KEY`), task bars from start/due dates, day/week/month zoom,
   grouped by collection via the existing `GroupHeaderRow` + `SectionsConfig`, today
   marker.
2. **Interaction**: drag to move/resize bars, click-drag to create, reparent via
   vertical row drag (`useRowDnD`/`useCollectionDnD`), right-click menu, undo,
   keyboard nudge.
3. **Depth**: dependencies + critical path (a stronger fit here than in the timeline
   view, given stable row positions), recurrence preview, unscheduled tray, saved
   layouts, minimap.
4. **Polish**: color-by toggles, progress fill, row striping, export/print,
   collaboration presence.

## Iterative development steps

The four phases above are the shape of the work; this is the actual build order,
broken into 15 smaller phases sized so one agent can complete an entire phase in a
single turn. Each phase ends with the view in a working (if incomplete) state —
nothing here is "half-wire something and come back later." Phases are ordered;
later phases assume everything in the earlier phases is done.

### Phase 1 — Scaffold the view + row list

1. Add a `gantt` view mode alongside `table`/`list` (mirrors how List was added:
   new entry in `src/data/settings.ts`, a tab in the view switcher, an empty
   placeholder body) — no rendering logic yet, just prove the tab exists and is
   selectable/persisted like the other two.
2. Render the row list only: reuse `HubRow`'s Name-column cell as a single sticky
   left pane (no date grid yet), driven by the exact same `flattened`/`FlatNode`
   data and `collapsed`/`toggleCollapse` state Table/List already use. This
   confirms row order, nesting/indentation, and collapse-expand behave identically
   to List before any bar logic is added.

### Phase 2 — Static date grid + pixel math

3. Add a static date-axis header for a hard-coded range (e.g. the current month at
   day granularity) rendered to the right of the Name pane — column headers only,
   still no bars. Confirms the two panes scroll/align correctly before anything is
   dynamic.
4. Write the date↔pixel math as small pure helper functions (`dateToX`,
   `spanToWidth`, given a day-width constant) with unit tests — this is the one
   genuinely new piece of logic the whole view depends on, so get it right and
   tested in isolation before wiring it into JSX.

### Phase 3 — Static bars

5. Render real, read-only task bars on top of the grid using `startDate`/`dueDate`
   and the helpers from Phase 2, colored by collection `color`. No drag, no
   resize, no creation yet.
6. Render milestone diamonds for tasks that have a `dueDate` but no `startDate`.

### Phase 4 — Grid chrome

7. Add the "today" marker line and a jump-to-today button.
8. Add weekend / non-working-day column shading.

### Phase 5 — Zoom + scroll

9. Replace the hard-coded month range from Phase 2 with real zoom levels
   (day/week/month/quarter/year), recomputing the pixel-math scale and bar/label
   density per level.
10. Replace the fixed date range with virtualized/infinite horizontal scroll.

### Phase 6 — Swimlane grouping

11. Wire up collection swimlane grouping using the existing `GroupHeaderRow` +
    `SectionsConfig`, confirming bars stay aligned to the right row through
    collapse/expand and regrouping.
12. Add the collection envelope bar (min(start)→max(due) roll-up of children),
    rendered in the collection's own row.

### Phase 7 — Filter, sort & persistence

13. Wire the existing `FilterRule`/`SortRule` engines (`FilterMenu`/`SortMenu`)
    into the Gantt row list — filtering removes rows, sorting reorders them, same
    as Table.
14. Persist Gantt-specific view state (zoom level, grouping, filters) through
    `useHubViewConfig`, same pattern as Table/List.

### Phase 8 — Bar editing: move, resize, create

15. Drag a bar horizontally to reschedule it (start + due shift together), with
    snapping to the active zoom level's gridlines.
16. Drag a bar's left/right edge independently to resize (change only start or
    only due).
17. Click-drag on empty grid space to create a new task with start/due pre-filled
    from the drag range.

### Phase 9 — Row editing: reorder, reparent, context menu, rename

18. Wire vertical row drag-to-reorder/reparent using `useRowDnD`/`useCollectionDnD`
    directly (unmodified from Table), confirming a dragged row's bar follows it.
19. Right-click context menu on a bar, reusing `RowContextMenu`'s existing actions.
20. Inline rename on double-click, wired to stay in sync whether triggered from the
    Name column cell or the bar label.

### Phase 10 — Selection, undo, keyboard

21. Multi-select bars (shift/cmd-click, marquee) for bulk drag/date-edit.
22. Undo/redo for drag operations, with snap-back + toast on an invalid drop.
23. Keyboard nudge: arrow keys shift the selected bar's dates by one snap
    increment, shift+arrow resizes from the near edge.

### Phase 11 — Recurrence, unscheduled tray, minimap

24. Recurrence ghost bars: render future `repeatInterval` occurrences as
    lighter/ghosted bars on the same row.
25. Unscheduled tray for dateless tasks, draggable onto the grid to schedule them.
26. Minimap/overview scrubber strip with a draggable viewport window.

### Phase 12 — Dependencies foundation

27. Schema + migration for a `dependsOn`/`blockedBy` relation (the one item in this
    doc that needs new data, not just new UI).
28. Render finish-to-start dependency arrows between bars, plus auto-shift of
    dependents when a predecessor's dates move (behind an "ask before cascading"
    confirmation).

### Phase 13 — Dependencies depth

29. Critical-path highlighting along the dependency chain.
30. Dependency-violation warnings (badge/outline on a bar that now starts before
    its predecessor finishes) with a one-click fix.
31. Additional dependency types (start-to-start, finish-to-finish,
    start-to-finish) plus optional lag/lead days.

### Phase 14 — Visual polish

32. Color-by toggle (collection / priority / status).
33. Progress-fill inside bars, reusing `startPercentage`/`duePercentage`/
    `calculateProgress` from `timeUtils.ts`.
34. Row density toggle (compact/comfortable) and alternating row striping per
    swimlane.
35. Show/hide secondary badges on a bar (XP, notes-preview icon, estimated-time
    chip, priority flag).
36. Configurable date-axis label format (relative "in 3 days" vs. absolute
    "Jul 4").

### Phase 15 — Export, sharing & collaboration

37. Export current view as image/PDF; print-friendly flattened layout.
38. Shareable read-only link to a filtered Gantt view.
39. Collaboration presence (avatars on bars, comment indicators, live cursors) —
    gated on assignee/realtime-collab features shipping elsewhere first.

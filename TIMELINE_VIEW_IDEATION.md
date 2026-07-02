# Timeline View — Feature Ideation

Third view for the Task Planner, alongside Table (done) and List (in progress). This
document is a brainstorm of features, abilities, and customization options for a
*true* timeline — as distinct from the Gantt design in `GANTT_VIEW_IDEATION.md`. The
key structural difference: rows here are **lanes**, not tasks. Multiple tasks with
non-overlapping date ranges share the same lane, packed left-to-right one after
another; a task only drops to a new sub-row within its lane when it would otherwise
overlap something already scheduled there. This is the Notion-style "Timeline" model
(and how a calendar's week view stacks events), not the MS-Project/Asana model where
every task owns a permanent row. Nothing here is committed to — it's a menu to pick
from when we scope the actual build.

## Grounding in what we already have

- Every row (task *or* collection) is one `todos` record with `parentId` self-nesting
  and an `isCollection` flag. Lanes map naturally onto collections (or another
  grouping attribute), but the tasks *inside* a lane no longer map 1:1 onto vertical
  position the way Table/List rows do — that mapping has to be computed.
- Tasks already carry `startDate`/`dueDate` + `startTime`/`dueTime`, so date-only bars
  and intraday (hour-level) bars are both possible without schema changes.
- `repeatInterval` is a simple "every N days" field — recurring bars are a natural
  showcase, but each occurrence is just another bar competing for a sub-row like any
  other task.
- Filter/Sort/Group menus and column-style field config (`FilterMenu`, `SortMenu`,
  `SectionsMenu`, `SectionsConfig`) already exist for Table/List — Timeline should
  reuse the filter/group *state*, but sort order here influences packing tie-breaks
  rather than directly setting vertical position (see §7).
- `useRowDnD`/`useCollectionDnD` (drag-to-reorder/reparent in Table) are only
  partially reusable: horizontal drag-to-reschedule is a new interaction entirely,
  and vertical drag no longer means "move to this exact row" since rows are
  lane-relative and packing-assigned, not task-owned.
- **New engineering this view needs that Table/List/Gantt don't**: a lane-packing
  (interval-scheduling) algorithm that assigns each task to the lowest free sub-row
  within its lane, and recomputes whenever dates, filters, or grouping change. This
  is the one piece of this doc that isn't "reuse existing infra."
- No gantt/calendar library is installed. `date-fns`, `recharts`, `motion`, and
  `@dnd-kit/*` are available; the grid, bars, and packing would be hand-built on top
  of these, same as the Gantt option.

## 1. Core timeline rendering

- Horizontal axis of dates; vertical axis is **lanes** (one per group — collection,
  status, priority, etc.), each lane tall enough to hold however many sub-rows its
  packed tasks currently need.
- Lane-packing algorithm: sort a lane's tasks by start date, assign each to the first
  sub-row whose last-placed task's due date is before this task's start date;
  open a new sub-row only when nothing fits. Recompute per lane, not globally, so
  editing one lane doesn't reflow the whole board.
- Zoom levels: day / week / month / quarter / year — same as Gantt, but zooming out
  changes which tasks *overlap* (and therefore how many sub-rows a lane needs), so
  re-packing on zoom change is required, not just re-scaling bars.
- "Today" marker line, with a jump-to-today button; weekend/non-working-day shading.
- Bars sized by `startDate`→`dueDate`; tasks with only a due date render as a
  milestone diamond and pack like any other bar (a diamond still occupies a sub-row
  slot for its date).
- Hour-level precision option for same-day tasks using `startTime`/`dueTime` — at
  that zoom, packing behaves exactly like a calendar day view stacking overlapping
  meetings.
- Infinite/virtualized horizontal scroll instead of paginating by date range.
- **No per-task sticky name column** (this is the biggest UI departure from Gantt/
  Table/List): since a lane can hold many tasks, there's no single row to label on
  the left. Instead:
  - The sticky left rail shows **lane labels only** (collection/group name), one
    label per lane, vertically centered across however many sub-rows that lane
    currently occupies.
  - Task names render *inside* their own bar (truncated with ellipsis + tooltip on
    hover); if a bar is too narrow for its name, the label spills to the right of
    the bar in muted text, same pattern calendar apps use for short events.

## 2. Grouping & structure

- Group by Collection (respecting the existing nested tree), Status, Priority, or a
  custom attribute — reusing `SectionsConfig` from Table/List, same as Gantt.
- A group value becomes a lane, not a bar: nested sub-collections become nested
  lanes (indented, collapsible), not nested rows.
- Collapsible lanes: collapsing a lane hides its sub-rows and shows a single summary
  strip (e.g., "6 tasks, Jul 3 – Aug 12") instead of an "envelope bar," since there's
  no single parent bar to draw — a lane can have tasks scattered non-contiguously
  across the axis.
- "No grouping" mode: one lane for the whole board, tasks pack purely by date across
  all visible tasks — useful for a pure "what does my week look like" view,
  independent of collection structure. This mode has no Gantt equivalent (Gantt
  always needs a grouping or task-order axis to define row order).
- Toggle: "pack tightly" (default, minimizes sub-rows per lane) vs. "one sub-row per
  status/priority value" (sacrifices density for a more predictable, always-in-the-
  same-place layout — a middle ground for users who want some Gantt-like stability).

## 3. Editing & interaction directly on the timeline

- Drag a bar horizontally to shift both start and due date together; the
  lane's packing recomputes live as the bar moves, previewing which sub-row it'll
  land in before drop (ghost/snap preview).
- Drag the left/right edge of a bar independently to resize (change start or due
  date without moving the other) — same as Gantt, but resizing can also trigger a
  repack if the new span now overlaps a neighbor.
- Click-drag on empty grid space within a lane to create a new task with start/due
  pre-filled from where you dragged.
- Drag a bar **between lanes** (vertically, across a lane boundary) to reparent/
  regroup it — this is the timeline equivalent of Gantt's vertical-drag-to-reparent.
  Dragging *within* a lane's own sub-rows is not a meaningful user action (packing
  owns that), so vertical movement inside a single lane is ignored or snaps back.
- Inline rename on double-click of a bar label.
- Right-click context menu on a bar (same actions as `RowContextMenu`: duplicate,
  delete, change collection, set priority/status, etc.).
- Multi-select bars (shift/cmd-click or marquee-select) to bulk-drag/bulk-edit dates;
  a bulk date shift can cascade into multiple lanes repacking at once.
- Undo/redo for drag operations (snap-back on invalid drop, toast with "Undo").
- Snapping: bars snap to day/hour gridlines while dragging (configurable snap
  increment based on zoom level).

## 4. Dependencies & relationships

- Task-to-task dependency lines (finish-to-start at minimum), drawn as connector
  arrows between bars — but arrow endpoints now move both horizontally *and*
  vertically whenever a repack shifts a dependent task to a different sub-row, so
  arrows need to be redrawn on every repack, not just on date changes. This makes
  dependencies noticeably more fragile visually than in the Gantt model, where a
  task's row is fixed.
- Auto-shift dependent tasks when a predecessor's dates move (optional "ask before
  cascading" confirmation), same as Gantt.
- Critical-path highlighting — harder to scan than in Gantt, since the critical
  chain may zig-zag across lanes and sub-rows rather than reading top-to-bottom.
- Would require a new `dependsOn`/`blockedBy` relation — not in the current schema.
  Given the added rendering complexity here, this is a lower-priority candidate for
  the timeline than it is for the Gantt view.

## 5. Recurrence on the timeline

- Render each recurrence of a `repeatInterval` task as its own ghosted/lighter bar;
  each occurrence is just another interval competing for a sub-row in its lane like
  any real task, so a busy recurring series can itself force a lane to grow extra
  sub-rows (useful signal: "this recurring task overlaps your other work here").
- Quick-create a recurring series directly from the timeline via drag ("repeat this
  bar every N days for the next M occurrences").

## 6. Visual customization

- Color bars by Collection color, Priority, or Status — same "color by" toggle
  pattern as Table's field coloring.
- Progress-fill inside each bar (reusing `startPercentage`/`duePercentage` /
  `calculateProgress` from `timeUtils.ts`).
- Sub-row height / bar density toggle (compact vs. comfortable), independent from
  lane height (lane height is a *consequence* of how many sub-rows it needs, not a
  user-set constant).
- Show/hide XP, notes icon, estimated-time chip, priority flag directly on the bar.
- Configurable date-axis format (relative "in 3 days" vs. absolute "Jul 4").
- Optional "milestone" bar style (diamond) vs. duration bar style, auto-selected when
  start === due but user-overridable.
- Lane summary strip: small inline stat next to each lane label (task count, date
  span, % complete) — cheap to compute and useful precisely because a lane no longer
  has one obvious "envelope bar" to convey that at a glance.

## 7. Filtering, sorting & views

- Reuse existing `FilterRule` engine: filter timeline by status, priority,
  collection, date range, overdue-only, etc. — filtering out a task simply removes
  it from packing consideration, which can shrink a lane back down to fewer
  sub-rows.
- Sort order (`SortRule`, manual `hubOrder`) no longer sets vertical position
  directly (packing does); instead it breaks ties when two tasks with the same
  start date compete for the same sub-row — e.g., "higher priority wins the top
  sub-row." This is a meaningful behavior difference from Gantt/Table/List worth
  calling out in the UI (sort affects *tie-breaking*, not row order).
- Saved timeline "layouts" per collection/workspace (zoom level, grouping, filters,
  pack-tightly vs. fixed-subrow mode) — same persistence pattern as
  `useHubViewConfig`.
- Toggle to include/exclude tasks with no dates (list them in an "unscheduled" tray
  alongside the timeline, draggable onto a lane to schedule them).
- Search/highlight: typing a query dims non-matching bars and highlights matches.

## 8. Overview & navigation aids

- Minimap/overview strip at the top showing the full project span, with a draggable
  viewport window for fast navigation on long timelines.
- "Fit to screen" button that zooms/scrolls to fit all visible tasks' date ranges.
- Keyboard shortcuts: arrow keys to pan, +/- to zoom, `T` to jump to today.
- Breadcrumb of current collection scope when drilled into a nested lane's own
  timeline.
- "Busiest day" indicator (e.g., a small heat strip above the axis) — a natural
  fit for this model since sub-row count per day is already computed by packing,
  and directly answers "when am I overloaded?"

## 9. Collaboration & feedback (future-facing, matches existing "collaboration" backlog item)

- Avatars/initials on bars if multi-user assignment ships.
- Comment indicator on bars linking to task notes/discussion.
- Live cursor/presence on the timeline grid if realtime collaboration is added.

## 10. Export & sharing

- Export current timeline view as an image or PDF for status reports.
- Print-friendly layout (flatten zoom/scroll into a single page range).
- Shareable read-only link to a filtered timeline view.

## Suggested phasing (not a commitment, just a sane build order)

1. **MVP**: static horizontal date grid, lane-packing algorithm (the core new piece
   — greedy interval scheduling per lane), task bars from start/due dates, day/week/
   month zoom, grouped by collection (reusing existing tree + `SectionsConfig`),
   today marker, lane labels + in-bar task names.
2. **Interaction**: drag to move/resize bars (with live repack preview), click-drag
   to create, drag-between-lanes to reparent, right-click menu, undo.
3. **Depth**: unscheduled tray, saved layouts, minimap, "no grouping / pure date
   packing" mode, "pack tightly vs. fixed sub-row" toggle. Dependencies + critical
   path only if still wanted, given the added rendering fragility noted in §4.
4. **Polish**: color-by toggles, progress fill, lane summary strips, busiest-day
   heat strip, export/print, collaboration presence.

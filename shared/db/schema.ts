import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  boolean,
  integer,
  doublePrecision,
  bigint,
  date,
  jsonb,
  index,
  check,
  primaryKey,
  foreignKey,
} from 'drizzle-orm/pg-core';
import type { Theme, TodoStatus, CalendarFilter } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Drizzle schema for the Neon Postgres migration (Phase 1).
//
// Columns map 1:1 to the hand-written interfaces in `src/types.ts` so the
// inferred row types below can eventually replace them with minimal churn:
//   • client-generated string ids stay as `text` PKs (optimistic inserts)
//   • ms-epoch timestamps (`createdAt`, etc.) → `bigint({ mode: 'number' })`
//   • `YYYY-MM-DD` todo dates → `date({ mode: 'string' })`; `HH:MM` times → text
//   • tracker dates are full ISO strings → kept as `text`
// DB-only additions: `user_id` (multi-user scoping), `daily_order` (the ordering
// gap from DATABASE_MIGRATION_NOTES §5.4), and a generated `completed` column.
//
// IDENTITY IS `(user_id, id)`, not `id`. Every read here is scoped to one user,
// so a bare `id` PK made identity global while visibility stayed per-user - and
// the two disagreeing is a bug factory. It made one account's backup unimportable
// into another (the ids collide with rows the importer can't see), it let a todo
// reference a parent or workspace belonging to someone else (the old single-column
// FK only asked whether the id existed *anywhere*, and no route checks ownership),
// and it forced the batch upsert to guard conflicts with a `where user_id = me`
// that silently dropped writes instead of applying them. A client id now only has
// to be unique within its own account, which is the only scope that ever reads it.
// Both FKs are composite for the same reason: `(user_id, parent_id)` can't point
// out of the tenant. They live in the extras callback because Drizzle's
// column-level `.references()` cannot express a composite FK.
// ─────────────────────────────────────────────────────────────────────────────

export const workspaces = pgTable(
  'workspaces',
  {
    id: text('id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }),
  },
  // No `workspaces_user_idx`: the PK's leading column is already `user_id`, so a
  // standalone index on it is dead weight. Same for trackers below.
  (t) => [primaryKey({ columns: [t.userId, t.id] })]
);

export const todos = pgTable(
  'todos',
  {
    id: text('id').notNull(),
    userId: text('user_id').notNull(),
    workspaceId: text('workspace_id'),
    // Self-referential nesting (subtasks + collections). See the composite FKs in
    // the extras callback below for the cascade and the tenant guard.
    parentId: text('parent_id'),
    isCollection: boolean('is_collection').notNull().default(false),
    text: text('text').notNull().default(''),
    // `status` is the single source of truth for completion (nullable/clearable;
    // defaults to 'todo' on insert). See src/utils/todoStatus.ts.
    status: text('status').$type<TodoStatus>().default('todo'),
    // Read-only convenience: derived from status, never written by the client.
    completed: boolean('completed').generatedAlwaysAs(
      sql`status is not distinct from 'completed'`
    ),
    priority: text('priority'),
    urgency: text('urgency'),
    startDate: date('start_date', { mode: 'string' }),
    dueDate: date('due_date', { mode: 'string' }),
    startTime: text('start_time'),
    dueTime: text('due_time'),
    // No start/due percentage columns: the "%" readouts are derived from the two
    // times above (src/features/tasks/model/percent.ts). Storing them was storing
    // the same value twice, and the copies drifted.
    estimatedTime: integer('estimated_time'),
    countCompletion: integer('count_completion'),
    repeatInterval: integer('repeat_interval'),
    autoMoveDate: boolean('auto_move_date'),
    notes: text('notes'),
    xp: integer('xp'),
    color: text('color'),
    showInDatabase: boolean('show_in_database'),
    showInDailyList: boolean('show_in_daily_list'),
    archived: boolean('archived').notNull().default(false),
    hubOrder: doublePrecision('hub_order'),
    dailyOrder: doublePrecision('daily_order'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    completedAt: bigint('completed_at', { mode: 'number' }),
    deletedAt: bigint('deleted_at', { mode: 'number' }),
    trackingStartedAt: bigint('tracking_started_at', { mode: 'number' }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    // Both FKs are MATCH SIMPLE (the Postgres default): a NULL in any column skips
    // the check entirely. `user_id` is NOT NULL, so the nullable half is always the
    // reference itself - a root todo (`parent_id` null) and an uncategorized one
    // (`workspace_id` null) are unconstrained, which is what we want.
    foreignKey({
      columns: [t.userId, t.workspaceId],
      foreignColumns: [workspaces.userId, workspaces.id],
      name: 'todos_user_workspace_fk',
    }).onDelete('cascade'),
    // Self-referential, via `t` rather than `todos` - that's what lets this drop
    // the `AnyPgColumn` thunk the old column-level reference needed to break the
    // circular type.
    foreignKey({
      columns: [t.userId, t.parentId],
      foreignColumns: [t.userId, t.id],
      name: 'todos_user_parent_fk',
    }).onDelete('cascade'),
    // These two are NOT redundant with the PK (their second column differs) and are
    // load-bearing twice over: Postgres does not index FK *source* columns, so a
    // cascade delete from either FK above scans them.
    index('todos_user_workspace_idx').on(t.userId, t.workspaceId),
    index('todos_user_parent_idx').on(t.userId, t.parentId),
    index('todos_user_due_idx').on(t.userId, t.dueDate),
    check(
      'todos_status_check',
      sql`${t.status} is null or ${t.status} in ('todo','in_progress','completed')`
    ),
  ]
);

export const trackers = pgTable(
  'trackers',
  {
    id: text('id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    startDate: text('start_date'), // ISO date-time string (custom trackers)
    endDate: text('end_date'),
    color: text('color').notNull(),
    precision: integer('precision').notNull(),
    displayMode: text('display_mode'),
    secondaryDisplayMode: text('secondary_display_mode'),
    // The user's manual order for the widget list (Time Widgets → Order menu).
    // Nullable like todos.hub_order: a row that predates the backfill sorts last
    // (NULLs last on ASC), by age.
    sortOrder: doublePrecision('sort_order'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })]
);

// One row per user. Core prefs as columns; the hub's UI/layout state is kept as
// jsonb blobs (mirrors the `dun-hub-*` localStorage keys) so the schema stays
// stable as the layout shape evolves. All of these now sync to the DB.
export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey(),
  theme: jsonb('theme').$type<Theme>(),
  themeId: text('theme_id'), // selected color theme id (src/theme/themes.ts; default 'classic')
  mode: text('mode').$type<'dark' | 'light' | 'system'>(), // dark/light/system (default 'dark')
  weekStartsOn: integer('week_starts_on'),
  countdownMode: text('countdown_mode'),
  xpEnabled: boolean('xp_enabled'), // show the XP bar + streaks (default true)
  showXpChips: boolean('show_xp_chips'), // show per-task XP chips (null ⇒ true)
  // Default XP for new daily-list tasks. Null ⇒ 1 (never configured); 0 ⇒ None
  // (no XP); 1–5 ⇒ that value. Only seeds the daily quick-add.
  defaultDailyXp: integer('default_daily_xp'),
  // Cross-surface default for new tasks: whether a task created in the Task
  // Planner also shows on the daily list, and whether a task created in the daily
  // list also shows in the Task Planner. Null ⇒ true (both surfaces, the legacy
  // default). Only apply at creation time.
  plannerTasksInDailyList: boolean('planner_tasks_in_daily_list'),
  dailyTasksInPlanner: boolean('daily_tasks_in_planner'),
  // Default auto-move-date flag for new DAILY-LIST tasks (null ⇒ false). Planner
  // tasks default off regardless. Only applied at creation time.
  defaultAutoMoveDate: boolean('default_auto_move_date'),
  activeWorkspaceId: text('active_workspace_id'),
  hubViews: jsonb('hub_views'), // dun-hub-views: per-view field order/visibility/filters/sorts/sections
  hubColWidths: jsonb('hub_col_widths'), // dun-hub-col-widths
  hubCollapsed: jsonb('hub_collapsed'), // dun-hub-collapsed
  hubLayout: jsonb('hub_layout'), // last hub view + sidebar width/hidden/collapsed
  calendarFilter: jsonb('calendar_filter').$type<CalendarFilter>(), // calendar sidebar surface + collection filter
  updatedAt: bigint('updated_at', { mode: 'number' }),
});

// Inferred row types - usable across backend (and later, type-only, the frontend).
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type NewWorkspaceRow = typeof workspaces.$inferInsert;
export type TodoRow = typeof todos.$inferSelect;
export type NewTodoRow = typeof todos.$inferInsert;
export type TrackerRow = typeof trackers.$inferSelect;
export type NewTrackerRow = typeof trackers.$inferInsert;
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type NewUserSettingsRow = typeof userSettings.$inferInsert;

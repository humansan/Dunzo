import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  boolean,
  integer,
  real,
  doublePrecision,
  bigint,
  date,
  jsonb,
  index,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type { Theme, TodoStatus } from '../types';

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
// ─────────────────────────────────────────────────────────────────────────────

export const workspaces = pgTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }),
  },
  (t) => [index('workspaces_user_idx').on(t.userId)]
);

export const todos = pgTable(
  'todos',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    // Self-referential nesting (subtasks + collections). Cascade covers hard
    // delete of a collection/parent and all its descendants.
    parentId: text('parent_id').references((): AnyPgColumn => todos.id, {
      onDelete: 'cascade',
    }),
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
    startPercentage: real('start_percentage'),
    duePercentage: real('due_percentage'),
    estimatedTime: integer('estimated_time'),
    countCompletion: integer('count_completion'),
    repeatInterval: integer('repeat_interval'),
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
    index('todos_user_workspace_idx').on(t.userId, t.workspaceId),
    index('todos_user_due_idx').on(t.userId, t.dueDate),
    index('todos_user_parent_idx').on(t.userId, t.parentId),
    check(
      'todos_status_check',
      sql`${t.status} is null or ${t.status} in ('todo','in_progress','completed')`
    ),
  ]
);

export const trackers = pgTable(
  'trackers',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    startDate: text('start_date'), // ISO date-time string (custom trackers)
    endDate: text('end_date'),
    color: text('color').notNull(),
    precision: integer('precision').notNull(),
    displayMode: text('display_mode'),
    secondaryDisplayMode: text('secondary_display_mode'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('trackers_user_idx').on(t.userId)]
);

// One row per user. Core prefs as columns; the hub's UI/layout state is kept as
// jsonb blobs (mirrors the `dun-hub-*` localStorage keys) so the schema stays
// stable as the layout shape evolves. All of these now sync to the DB.
export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey(),
  theme: jsonb('theme').$type<Theme>(),
  weekStartsOn: integer('week_starts_on'),
  countdownMode: text('countdown_mode'),
  xpEnabled: boolean('xp_enabled'),
  activeWorkspaceId: text('active_workspace_id'),
  hubViews: jsonb('hub_views'), // dun-hub-views: per-view field order/visibility/filters/sorts/sections
  hubColWidths: jsonb('hub_col_widths'), // dun-hub-col-widths
  hubCollapsed: jsonb('hub_collapsed'), // dun-hub-collapsed
  hubLayout: jsonb('hub_layout'), // last hub view + sidebar width/hidden/collapsed
  updatedAt: bigint('updated_at', { mode: 'number' }),
});

// Inferred row types — usable across backend (and later, type-only, the frontend).
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type NewWorkspaceRow = typeof workspaces.$inferInsert;
export type TodoRow = typeof todos.$inferSelect;
export type NewTodoRow = typeof todos.$inferInsert;
export type TrackerRow = typeof trackers.$inferSelect;
export type NewTrackerRow = typeof trackers.$inferInsert;
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type NewUserSettingsRow = typeof userSettings.$inferInsert;

import type { NextFunction, Request, Response } from 'express';
import type { Todo } from '../src/types';
import { normalizeVisibility } from '../src/utils/todoFilters';

// Wrap an async route handler so thrown/rejected errors reach the error
// middleware instead of crashing the process or hanging the request.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// Final error middleware (mounted last). Keeps secrets out of the response.
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('[api] error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
}

// Column allow-list filter. Keeps only known, client-settable keys and drops
// undefined — so `user_id`, the generated `completed` column, and unknown keys
// can never be written from request bodies.
export function pick<T extends object>(
  body: unknown,
  allowed: readonly string[]
): Partial<T> {
  const out: Record<string, unknown> = {};
  if (body && typeof body === 'object') {
    for (const key of allowed) {
      const v = (body as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = v;
    }
  }
  return out as Partial<T>;
}

// ── Allow-lists (camelCase = Drizzle schema property names) ──────────────────

export const TODO_FIELDS = [
  'id',
  'workspaceId',
  'parentId',
  'isCollection',
  'text',
  'status',
  'priority',
  'urgency',
  'startDate',
  'dueDate',
  'startTime',
  'dueTime',
  'startPercentage',
  'duePercentage',
  'estimatedTime',
  'countCompletion',
  'repeatInterval',
  'notes',
  'xp',
  'color',
  'showInDatabase',
  'showInDailyList',
  'archived',
  'hubOrder',
  'dailyOrder',
  'createdAt',
  'completedAt',
  'deletedAt',
  'trackingStartedAt',
] as const;

// Fields settable on an UPDATE (id is from the URL; createdAt is immutable).
export const TODO_UPDATE_FIELDS = TODO_FIELDS.filter(
  (f) => f !== 'id' && f !== 'createdAt'
);

export const WORKSPACE_FIELDS = ['id', 'name', 'createdAt'] as const;
export const WORKSPACE_UPDATE_FIELDS = ['name'] as const;

export const TRACKER_FIELDS = [
  'id',
  'name',
  'type',
  'startDate',
  'endDate',
  'color',
  'precision',
  'displayMode',
  'secondaryDisplayMode',
  'createdAt',
] as const;
export const TRACKER_UPDATE_FIELDS = TRACKER_FIELDS.filter(
  (f) => f !== 'id' && f !== 'createdAt'
);

export const SETTINGS_FIELDS = [
  'theme',
  'weekStartsOn',
  'countdownMode',
  'xpEnabled',
  'activeWorkspaceId',
  'hubViews',
  'hubColWidths',
  'hubCollapsed',
  'hubLayout',
] as const;

// Fields whose value can change which surface a todo renders on (or remove it
// from all of them). A patch touching none of these can't break the invariant.
const VISIBILITY_KEYS = [
  'showInDatabase',
  'showInDailyList',
  'dueDate',
  'isCollection',
  'archived',
] as const;

export function touchesVisibility(patch: object): boolean {
  return VISIBILITY_KEYS.some((k) => k in patch);
}

// Server-side backstop mirroring the client's normalizeVisibility: given a todo's
// fully-merged intended state, force showInDatabase on when it would otherwise be
// reachable on no surface, so a malformed payload can never persist an orphan.
// Mutates `row` (only sets showInDatabase when a correction is needed) and returns it.
export function enforceVisibility<T extends Record<string, unknown>>(row: T): T {
  const current = (row as { showInDatabase?: boolean | null }).showInDatabase;
  const fixed = normalizeVisibility(row as unknown as Todo);
  if (fixed.showInDatabase !== current) {
    (row as { showInDatabase?: boolean }).showInDatabase = fixed.showInDatabase;
  }
  return row;
}

// The server owns completion stamping so it can't drift: completed_at is set
// when status becomes 'completed' and cleared otherwise. `completed` itself is a
// generated column and is never written. Mutates and returns the patch.
export function stampCompletion(
  patch: { status?: string | null; completedAt?: number | null },
  existingCompletedAt?: number | null
): typeof patch {
  if (!('status' in patch)) return patch;
  if (patch.status === 'completed') {
    patch.completedAt = patch.completedAt ?? existingCompletedAt ?? Date.now();
  } else {
    patch.completedAt = null;
  }
  return patch;
}

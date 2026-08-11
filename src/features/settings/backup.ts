import type { Todo, Tracker, Workspace } from '@shared/types';
import type { UserSettings } from '@/lib/query/settings';
import { apiFetch } from '@/lib/query/apiClient';
import type { TodoBatch } from '@/features/tasks/api';

// ─────────────────────────────────────────────────────────────────────────────
// Manual backup export / import (the Account panel's Export/Import buttons).
//
// Export snapshots the user's current DB state. Import MERGES by id into the DB -
// ids absent in the DB are inserted, ids that already exist are overwritten with
// the imported values, and existing rows not present in the backup are left
// untouched (no deletes). Ids are preserved so the merge can match on them.
//
// Merging by id works ACROSS accounts because a row's identity is `(user_id, id)`
// (see shared/db/schema.ts). Every existence check below asks "do I have this id?",
// and that is now the same question the database asks. While `id` alone was the PK
// the two questions differed, and importing another account's backup broke three
// ways: the workspace and tracker POSTs 500'd on a duplicate key for rows the
// importer couldn't see, and the todo upsert silently wrote nothing. Preserving ids
// also means the id-bearing settings blobs (activeWorkspaceId, the
// `${workspaceId}:${viewId}` keys in hubViews, hubCollapsed, calendarFilter's
// uncheckedCollections) still resolve after an import - remapping ids would have
// had to rewrite all of them.
// ─────────────────────────────────────────────────────────────────────────────

// Bumped only when the file layout changes in a way older readers can't handle.
// `parseBackup` refuses anything higher: a newer Dunzo may write fields this build
// would silently drop, and dropping half a restore is worse than declining it.
const CURRENT_BACKUP_VERSION = 2;

/**
 * A backup file we won't even attempt to import: not JSON, not a backup, or from a
 * newer version. Distinct from an ApiError so the UI can tell "this file is wrong"
 * (the user picked the wrong thing) from "the server rejected it" (something else is
 * broken, and the message matters). `message` is written to be shown as-is.
 */
export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

// Legacy localStorage keys - only used to read the old localStorage-dump backup
// format that the pre-DB Export button produced, so those files still import.
const LS = {
  todos: 'dun-todos',
  trackers: 'dun-trackers',
  workspaces: 'dun-workspaces',
  theme: 'dun-theme',
  weekStartsOn: 'dun-week-starts-on',
  countdownMode: 'dun-countdown-mode',
  xpEnabled: 'dun-xp-enabled',
  hubViews: 'dun-hub-views',
  hubColWidths: 'dun-hub-col-widths',
  hubCollapsed: 'dun-hub-collapsed',
} as const;

export interface BackupData {
  version: number;
  exportedAt?: string;
  todos: Todo[];
  trackers: Tracker[];
  workspaces: Workspace[];
  settings?: Partial<UserSettings>;
}

// Order todos so every parent precedes its children (the FK on parent_id is
// checked per-statement, so a child can't be inserted before its parent).
function topoSort(todos: Todo[]): Todo[] {
  const byId = new Map(todos.map((t) => [t.id, t]));
  const out: Todo[] = [];
  const seen = new Set<string>();
  const visit = (t: Todo) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    const parent = t.parentId ? byId.get(t.parentId) : undefined;
    if (parent) visit(parent);
    out.push(t);
  };
  for (const t of todos) visit(t);
  return out;
}

// The rows come straight from the DB, so they carry the exporting account's
// `user_id`. Drop it: every write path stamps `userId` from the caller's token and
// ignores whatever the payload claims, so it can't be restored and can't be
// honoured - it would only sit in a file people hand to each other.
function stripUserId<T extends object>(row: T): T {
  const { userId: _dropped, ...rest } = row as T & { userId?: string };
  return rest as T;
}

// Snapshot the account's current DB state for download.
export async function buildBackup(): Promise<BackupData> {
  const [todos, trackers, workspaces, settings] = await Promise.all([
    apiFetch<Todo[]>('/todos'),
    apiFetch<Tracker[]>('/trackers'),
    apiFetch<Workspace[]>('/workspaces'),
    apiFetch<Partial<UserSettings>>('/settings'),
  ]);
  return {
    version: CURRENT_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    todos: todos.map(stripUserId),
    trackers: trackers.map(stripUserId),
    workspaces: workspaces.map(stripUserId),
    settings: settings && stripUserId(settings),
  };
}

// Normalize an imported todo: status is the source of truth, the legacy `completed`
// flag is folded in and dropped (it's a generated column server-side). Ids are
// preserved (the merge matches on them).
function normalizeTodoForImport(t: any): Todo {
  // `userId` is dropped here too, not just on export - files written before
  // buildBackup started stripping it still carry the exporting account's id. The
  // server would ignore it regardless (it stamps userId from the token), but there
  // is no reason to send another account's identity back to it.
  const { completed: _legacy, userId: _foreign, ...rest } = t ?? {};
  const done = t?.status === 'completed' || t?.completed === true;
  return {
    ...rest,
    status: done ? 'completed' : t?.status ?? 'todo',
    createdAt: t?.createdAt ?? Date.now(),
  } as Todo;
}

// Parse a backup file. Accepts the current format (top-level todos/trackers/
// workspaces arrays) and the legacy localStorage-dump format (`dun-*` keys whose
// values are JSON strings) produced by the old Export button.
//
// Throws BackupFormatError for anything it can't read. It used to accept any JSON
// object at all: a file matching neither format fell through to the legacy branch,
// where every key was missing, and returned empty arrays - so picking the wrong file
// "imported successfully" and did nothing.
export function parseBackup(raw: string): BackupData {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new BackupFormatError("This file isn't valid JSON, so it can't be a backup.");
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new BackupFormatError("This doesn't look like a Dunzo backup file.");
  }
  const obj = json as Record<string, unknown>;

  const hasCurrentShape =
    Array.isArray(obj.todos) || Array.isArray(obj.trackers) || Array.isArray(obj.workspaces);
  // Legacy files carry no `version`, so only gate the current shape on it.
  if (hasCurrentShape) {
    const version = typeof obj.version === 'number' ? obj.version : CURRENT_BACKUP_VERSION;
    if (version > CURRENT_BACKUP_VERSION) {
      throw new BackupFormatError(
        `This backup was written by a newer version of Dunzo (format ${version}, this build reads ${CURRENT_BACKUP_VERSION}). Update and try again.`
      );
    }
    return {
      version,
      todos: Array.isArray(obj.todos) ? (obj.todos as Todo[]) : [],
      trackers: Array.isArray(obj.trackers) ? (obj.trackers as Tracker[]) : [],
      workspaces: Array.isArray(obj.workspaces) ? (obj.workspaces as Workspace[]) : [],
      settings: obj.settings as Partial<UserSettings> | undefined,
    };
  }

  // Neither shape: refuse rather than "succeed" at importing nothing.
  if (!Object.values(LS).some((k) => k in obj)) {
    throw new BackupFormatError(
      "This doesn't look like a Dunzo backup file - it has no tasks, trackers or workspaces in it."
    );
  }

  // Legacy dump: { "dun-todos": "<json string>", ... }.
  const val = (k: string, fb: any) => {
    const v = obj[k];
    if (typeof v !== 'string') return fb;
    try {
      return JSON.parse(v);
    } catch {
      return fb;
    }
  };
  const weekRaw = obj[LS.weekStartsOn];
  const xpRaw = obj[LS.xpEnabled];
  const settings: Partial<UserSettings> = {};
  const theme = val(LS.theme, undefined);
  if (theme) settings.theme = theme;
  if (typeof weekRaw === 'string' && weekRaw !== '') settings.weekStartsOn = parseInt(weekRaw, 10);
  // Checked against the real values rather than cast: this used to read through an
  // `any`, so a legacy file with anything at all in this key wrote it straight into
  // settings and the countdown silently stopped rendering.
  const countdownRaw = obj[LS.countdownMode];
  if (countdownRaw === 'off' || countdownRaw === 'time' || countdownRaw === 'percent') {
    settings.countdownMode = countdownRaw;
  }
  if (typeof xpRaw === 'string') settings.xpEnabled = xpRaw !== 'false';
  const hubViews = val(LS.hubViews, undefined);
  if (hubViews) settings.hubViews = hubViews;
  const hubColWidths = val(LS.hubColWidths, undefined);
  if (hubColWidths) settings.hubColWidths = hubColWidths;
  const hubCollapsed = val(LS.hubCollapsed, undefined);
  if (hubCollapsed) settings.hubCollapsed = hubCollapsed;

  return {
    version: 1,
    todos: val(LS.todos, []),
    trackers: val(LS.trackers, []),
    workspaces: val(LS.workspaces, []),
    settings: Object.keys(settings).length ? settings : undefined,
  };
}

// Merge a backup into the DB by id (add new, overwrite conflicts, leave the rest).
// The existence checks below read the CALLER's rows, which is exactly the scope the
// `(user_id, id)` key enforces - so an id from another account is genuinely new here
// and inserts, rather than colliding with a row this account can't see.
export async function mergeImportToDb(backup: BackupData): Promise<void> {
  // Workspaces first so imported todos' FKs resolve. Add new / rename existing.
  if (backup.workspaces?.length) {
    const existing = await apiFetch<Workspace[]>('/workspaces');
    const existingIds = new Set(existing.map((w) => w.id));
    for (const ws of backup.workspaces) {
      if (!ws?.id) continue;
      if (existingIds.has(ws.id)) {
        await apiFetch(`/workspaces/${ws.id}`, { method: 'PATCH', body: JSON.stringify({ name: ws.name ?? '' }) });
      } else {
        await apiFetch('/workspaces', { method: 'POST', body: JSON.stringify(ws) });
      }
    }
  }

  // Todos: one transactional batch upsert (insert new / overwrite conflicts;
  // rows not in the backup are left untouched). Null out parentIds that point at
  // a todo present in neither the DB nor the backup so the FK can't fail - `known`
  // is built from this account's rows plus the backup's, which is precisely what
  // `(user_id, parent_id) REFERENCES todos(user_id, id)` will accept.
  if (backup.todos?.length) {
    const existing = await apiFetch<Todo[]>('/todos');
    const known = new Set<string>([...existing.map((t) => t.id), ...backup.todos.map((t) => t.id)]);
    // A legacy (pre-hubOrder) backup carries todos with no Planner order. The
    // Planner sorts siblings by `hubOrder ?? createdAt` - scales that don't mix -
    // so an order-less todo sinks below every ordered one and newly created tasks
    // then land above it. Give the gaps orders past everything already in use,
    // keeping the backup's own sequence.
    let hubOrder = [...existing, ...backup.todos].reduce((m, t) => Math.max(m, t?.hubOrder ?? 0), 0) + 1;
    const normalized = backup.todos.map((t) => {
      const n = normalizeTodoForImport(t);
      if (n.parentId && !known.has(n.parentId)) n.parentId = null;
      if (n.hubOrder === undefined || n.hubOrder === null) n.hubOrder = hubOrder++;
      return n;
    });
    const batch: TodoBatch = { upserts: topoSort(normalized) };
    await apiFetch('/todos/batch', { method: 'POST', body: JSON.stringify(batch) });
  }

  // Trackers: add new / overwrite existing.
  if (backup.trackers?.length) {
    const existing = await apiFetch<Tracker[]>('/trackers');
    const existingIds = new Set(existing.map((t) => t.id));
    for (const tr of backup.trackers) {
      if (!tr?.id) continue;
      if (existingIds.has(tr.id)) {
        await apiFetch(`/trackers/${tr.id}`, { method: 'PATCH', body: JSON.stringify(tr) });
      } else {
        await apiFetch('/trackers', { method: 'POST', body: JSON.stringify(tr) });
      }
    }
  }

  // Settings: restore the prefs / hub-layout blobs (server merges per-field).
  if (backup.settings && Object.keys(backup.settings).length) {
    await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(backup.settings) });
  }
}

import type { Todo, Tracker, Workspace } from '../types';
import type { UserSettings } from './settings';
import { apiFetch } from './apiClient';
import type { TodoBatch } from './todos';

// ─────────────────────────────────────────────────────────────────────────────
// Manual backup export / import (the Account panel's Export/Import buttons).
//
// Export snapshots the user's current DB state. Import MERGES by id into the DB —
// ids absent in the DB are inserted, ids that already exist are overwritten with
// the imported values, and existing rows not present in the backup are left
// untouched (no deletes). Ids are preserved so the merge can match on them.
// ─────────────────────────────────────────────────────────────────────────────

// Legacy localStorage keys — only used to read the old localStorage-dump backup
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

// Snapshot the account's current DB state for download.
export async function buildBackup(): Promise<BackupData> {
  const [todos, trackers, workspaces, settings] = await Promise.all([
    apiFetch<Todo[]>('/todos'),
    apiFetch<Tracker[]>('/trackers'),
    apiFetch<Workspace[]>('/workspaces'),
    apiFetch<Partial<UserSettings>>('/settings'),
  ]);
  return { version: 2, exportedAt: new Date().toISOString(), todos, trackers, workspaces, settings };
}

// Normalize an imported todo: status is the source of truth, the legacy `completed`
// flag is folded in and dropped (it's a generated column server-side). Ids are
// preserved (the merge matches on them).
function normalizeTodoForImport(t: any): Todo {
  const { completed: _legacy, ...rest } = t ?? {};
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
export function parseBackup(raw: string): BackupData {
  const json = JSON.parse(raw);

  if (json && (Array.isArray(json.todos) || Array.isArray(json.trackers) || Array.isArray(json.workspaces))) {
    return {
      version: json.version ?? 2,
      todos: Array.isArray(json.todos) ? json.todos : [],
      trackers: Array.isArray(json.trackers) ? json.trackers : [],
      workspaces: Array.isArray(json.workspaces) ? json.workspaces : [],
      settings: json.settings,
    };
  }

  // Legacy dump: { "dun-todos": "<json string>", ... }.
  const val = (k: string, fb: any) => {
    const v = json?.[k];
    if (typeof v !== 'string') return fb;
    try {
      return JSON.parse(v);
    } catch {
      return fb;
    }
  };
  const weekRaw = json?.[LS.weekStartsOn];
  const xpRaw = json?.[LS.xpEnabled];
  const settings: Partial<UserSettings> = {};
  const theme = val(LS.theme, undefined);
  if (theme) settings.theme = theme;
  if (typeof weekRaw === 'string' && weekRaw !== '') settings.weekStartsOn = parseInt(weekRaw, 10);
  if (typeof json?.[LS.countdownMode] === 'string') settings.countdownMode = json[LS.countdownMode];
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
  // a todo present in neither the DB nor the backup so the FK can't fail.
  if (backup.todos?.length) {
    const existing = await apiFetch<Todo[]>('/todos');
    const known = new Set<string>([...existing.map((t) => t.id), ...backup.todos.map((t) => t.id)]);
    const normalized = backup.todos.map((t) => {
      const n = normalizeTodoForImport(t);
      if (n.parentId && !known.has(n.parentId)) n.parentId = null;
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

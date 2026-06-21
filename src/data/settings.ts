import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Theme } from '../types';
import { apiFetch } from './apiClient';
import { queryKeys } from './keys';

// ─────────────────────────────────────────────────────────────────────────────
// Per-user settings, synced to the DB (Phase 6). The `user_settings` row holds
// the core prefs (theme/week-start/countdown/XP/activeWorkspace) and the hub's
// view-config blobs (mirroring the old `dun-hub-*` localStorage keys). Writes are
// optimistic-and-debounced: the cache updates synchronously (instant UI) while the
// PUT is coalesced so drags (column/sidebar resize) don't spam the network. The
// server `PUT /settings` merges per-field, so partial patches are safe.
// ─────────────────────────────────────────────────────────────────────────────

// Combined per-device-ish hub layout blob (single jsonb column). Sets are stored
// as arrays (jsonb has no Set); the synced hooks adapt Set↔array.
export interface HubLayout {
  selectedView?: string;
  sidebarWidth?: number;
  sidebarHidden?: boolean;
  sidebarCollapsed?: string[]; // sidebar collection-tree collapse state
}

export interface UserSettings {
  theme?: Theme;
  weekStartsOn?: number;
  countdownMode?: 'off' | 'time' | 'percent';
  xpEnabled?: boolean;
  activeWorkspaceId?: string;
  hubViews?: Record<string, any>; // per `workspace:view` field config
  hubColWidths?: Record<string, number>;
  hubCollapsed?: string[]; // table-row collapse state (todo ids)
  hubLayout?: HubLayout;
  updatedAt?: number;
}

const DEBOUNCE_MS = 500;

// Resolve a React-style state action (value or updater) against the previous value.
export function resolveAction<T>(action: SetStateAction<T>, prev: T): T {
  return typeof action === 'function' ? (action as (p: T) => T)(prev) : action;
}

// The settings query. `enabled` drives the actual fetch (App passes the auth
// flag); internal hooks pass `false` and ride along as pure cache observers.
export function useSettings(enabled: boolean = false) {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => apiFetch<UserSettings>('/settings'),
    enabled,
  });
}

// Returns a debounced, optimistic `update(partial)` that merges into the cache now
// and PUTs the coalesced patch after a short idle. Pending writes flush on unmount.
export function useUpdateSettings() {
  const qc = useQueryClient();
  const pending = useRef<Partial<UserSettings>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    apiFetch('/settings', { method: 'PUT', body: JSON.stringify(patch) }).catch(() => {
      // On failure, drop the optimistic state and refetch the server's truth.
      qc.invalidateQueries({ queryKey: queryKeys.settings });
    });
  }, [qc]);

  const update = useCallback(
    (patch: Partial<UserSettings>) => {
      qc.setQueryData<UserSettings>(queryKeys.settings, (old) => ({ ...(old ?? {}), ...patch }));
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [qc, flush]
  );

  // Flush any pending patch when the owner unmounts (e.g. leaving the hub view).
  useEffect(() => () => flush(), [flush]);

  return update;
}

// A single settings field as `[value, setValue]` with full SetStateAction support.
// The updater reads the *current* cache value (not a render-captured one) so rapid
// successive updates compose correctly.
export function useSyncedSetting<K extends keyof UserSettings>(
  field: K,
  fallback: NonNullable<UserSettings[K]>
): [NonNullable<UserSettings[K]>, Dispatch<SetStateAction<NonNullable<UserSettings[K]>>>] {
  const qc = useQueryClient();
  const { data } = useSettings(false);
  const update = useUpdateSettings();
  const value = (data?.[field] ?? fallback) as NonNullable<UserSettings[K]>;

  const set = useCallback<Dispatch<SetStateAction<NonNullable<UserSettings[K]>>>>(
    (action) => {
      const current = (qc.getQueryData<UserSettings>(queryKeys.settings)?.[field] ??
        fallback) as NonNullable<UserSettings[K]>;
      update({ [field]: resolveAction(action, current) } as Partial<UserSettings>);
    },
    [qc, field, fallback, update]
  );

  return [value, set];
}

// A `Set<string>` field backed by a string[] settings column (e.g. hubCollapsed).
export function useSyncedSet(
  field: 'hubCollapsed'
): [Set<string>, Dispatch<SetStateAction<Set<string>>>] {
  const [arr, setArr] = useSyncedSetting(field, [] as string[]);
  // Stable identity while the underlying array is unchanged (react-query keeps the
  // same data reference), so downstream useMemos don't recompute every render.
  const value = useMemo(() => new Set(arr), [arr]);
  const set = useCallback<Dispatch<SetStateAction<Set<string>>>>(
    (action) => {
      setArr((prevArr) => [...resolveAction(action, new Set(prevArr))]);
    },
    [setArr]
  );
  return [value, set];
}

// The combined hub layout blob as `[layout, patch]`, where `patch` merges a partial
// computed from the *current* layout (read fresh from cache).
export function useSyncedLayout(): [HubLayout, (fn: (prev: HubLayout) => Partial<HubLayout>) => void] {
  const qc = useQueryClient();
  const { data } = useSettings(false);
  const update = useUpdateSettings();
  const layout = (data?.hubLayout ?? {}) as HubLayout;

  const patch = useCallback(
    (fn: (prev: HubLayout) => Partial<HubLayout>) => {
      const current = (qc.getQueryData<UserSettings>(queryKeys.settings)?.hubLayout ?? {}) as HubLayout;
      update({ hubLayout: { ...current, ...fn(current) } });
    },
    [qc, update]
  );

  return [layout, patch];
}

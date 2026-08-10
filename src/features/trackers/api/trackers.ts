import { queryOptions, useQuery } from '@tanstack/react-query';
import type { Tracker } from '@shared/types';
import { apiFetch } from '@/lib/query/apiClient';
import { queryKeys } from '@/lib/query/keys';
import { useOptimisticListMutation } from '@/lib/query/optimistic';
import { stripNullsList } from '@/lib/query/normalize';

export const trackersQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.trackers,
    queryFn: async () => stripNullsList(await apiFetch<Tracker[]>('/trackers')),
  });

export function useTrackers(enabled: boolean) {
  return useQuery({ ...trackersQueryOptions(), enabled });
}

export const useCreateTracker = () =>
  useOptimisticListMutation<Tracker, Tracker>(
    queryKeys.trackers,
    (tracker) => apiFetch('/trackers', { method: 'POST', body: JSON.stringify(tracker) }),
    (list, tracker) => [...list, tracker]
  );

export const useUpdateTracker = () =>
  useOptimisticListMutation<Tracker, Tracker>(
    queryKeys.trackers,
    (tracker) => apiFetch(`/trackers/${tracker.id}`, { method: 'PATCH', body: JSON.stringify(tracker) }),
    (list, tracker) => list.map((t) => (t.id === tracker.id ? { ...t, ...tracker } : t))
  );

// Reorder the whole list: `ids` in their new order. The optimistic pass rewrites
// sortOrder to match, so every surface that calls sortTrackers agrees with the
// dragged result before the request lands.
export const useReorderTrackers = () =>
  useOptimisticListMutation<Tracker, string[]>(
    queryKeys.trackers,
    (ids) => apiFetch('/trackers/reorder', { method: 'POST', body: JSON.stringify({ ids }) }),
    (list, ids) =>
      list.map((t) => {
        const at = ids.indexOf(t.id);
        // Not in the dragged list (created in another tab mid-drag) → left as is,
        // which sorts it after the renumbered rows.
        return at === -1 ? t : { ...t, sortOrder: at };
      })
  );

export const useDeleteTracker = () =>
  useOptimisticListMutation<Tracker, string>(
    queryKeys.trackers,
    (id) => apiFetch(`/trackers/${id}`, { method: 'DELETE' }),
    (list, id) => list.filter((t) => t.id !== id)
  );

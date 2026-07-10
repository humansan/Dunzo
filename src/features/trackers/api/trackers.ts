import { queryOptions, useQuery } from '@tanstack/react-query';
import type { Tracker } from '@shared/types';
import { apiFetch } from '@/data/apiClient';
import { queryKeys } from '@/data/keys';
import { useOptimisticListMutation } from '@/data/optimistic';
import { stripNullsList } from '@/data/normalize';

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

export const useDeleteTracker = () =>
  useOptimisticListMutation<Tracker, string>(
    queryKeys.trackers,
    (id) => apiFetch(`/trackers/${id}`, { method: 'DELETE' }),
    (list, id) => list.filter((t) => t.id !== id)
  );

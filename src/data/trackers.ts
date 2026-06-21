import { useQuery } from '@tanstack/react-query';
import type { Tracker } from '../types';
import { apiFetch } from './apiClient';
import { queryKeys } from './keys';
import { useOptimisticListMutation } from './optimistic';

export function useTrackers(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.trackers,
    queryFn: () => apiFetch<Tracker[]>('/trackers'),
    enabled,
  });
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

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

// Shared optimistic-update pattern for a list-shaped query cache: snapshot →
// apply locally → call API → roll back on error → invalidate on settle
// (DATABASE_MIGRATION_NOTES §5.3). `optimistic` produces the next cached list.
export function useOptimisticListMutation<T, V>(
  key: QueryKey,
  mutationFn: (v: V) => Promise<unknown>,
  optimistic: (list: T[], v: V) => T[]
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: (v: V) => {
      // Apply the optimistic update SYNCHRONOUSLY (no await before setQueryData)
      // so consumers that react in the same commit — notably dnd-kit, which
      // clears its drag transforms on drop — see the new order immediately.
      // Awaiting cancelQueries first defers the cache write a microtask, which
      // makes reordered items snap to the old position then animate ("bounce").
      // cancelQueries still runs (fire-and-forget) to stop an in-flight refetch
      // from clobbering the optimistic state.
      qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<T[]>(key);
      qc.setQueryData<T[]>(key, (old = []) => optimistic(old, v));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: T[] } | undefined;
      if (c?.prev) qc.setQueryData(key, c.prev);
    },
    // Mark stale but DON'T refetch now: an immediate refetch re-renders the list
    // a beat after the optimistic update, which disrupts dnd-kit's drop settle
    // (random "bounce"). The optimistic cache is authoritative; reconciliation
    // happens on the next natural refetch (window focus / remount).
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key, refetchType: 'none' });
    },
  });
}

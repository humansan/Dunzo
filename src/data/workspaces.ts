import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Todo, Workspace } from '../types';
import { apiFetch } from './apiClient';
import { queryKeys } from './keys';
import { useOptimisticListMutation } from './optimistic';
import { stripNullsList } from './normalize';

export function useWorkspaces(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: async () => stripNullsList(await apiFetch<Workspace[]>('/workspaces')),
    enabled,
  });
}

export const useCreateWorkspace = () =>
  useOptimisticListMutation<Workspace, Workspace>(
    queryKeys.workspaces,
    (ws) => apiFetch('/workspaces', { method: 'POST', body: JSON.stringify(ws) }),
    (list, ws) => [...list, ws]
  );

export const useRenameWorkspace = () =>
  useOptimisticListMutation<Workspace, { id: string; name: string }>(
    queryKeys.workspaces,
    ({ id, name }) => apiFetch(`/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    (list, { id, name }) => list.map((w) => (w.id === id ? { ...w, name } : w))
  );

// Bespoke: deleting a workspace cascades its todos server-side, so optimistically
// drop both and invalidate both caches.
export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/workspaces/${id}`, { method: 'DELETE' }),
    onMutate: (id: string) => {
      // Synchronous optimistic update (see optimistic.ts for why we don't await).
      qc.cancelQueries({ queryKey: queryKeys.workspaces });
      qc.cancelQueries({ queryKey: queryKeys.todos });
      const prevWs = qc.getQueryData<Workspace[]>(queryKeys.workspaces);
      const prevTodos = qc.getQueryData<Todo[]>(queryKeys.todos);
      qc.setQueryData<Workspace[]>(queryKeys.workspaces, (o = []) => o.filter((w) => w.id !== id));
      qc.setQueryData<Todo[]>(queryKeys.todos, (o = []) => o.filter((t) => t.workspaceId !== id));
      return { prevWs, prevTodos };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prevWs?: Workspace[]; prevTodos?: Todo[] } | undefined;
      if (c?.prevWs) qc.setQueryData(queryKeys.workspaces, c.prevWs);
      if (c?.prevTodos) qc.setQueryData(queryKeys.todos, c.prevTodos);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workspaces, refetchType: 'none' });
      qc.invalidateQueries({ queryKey: queryKeys.todos, refetchType: 'none' });
    },
  });
}

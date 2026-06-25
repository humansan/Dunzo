import { useQuery } from '@tanstack/react-query';
import type { Todo } from '../types';
import { apiFetch } from './apiClient';
import { queryKeys } from './keys';
import { useOptimisticListMutation } from './optimistic';
import { stripNullsList, nullifyUndefined } from './normalize';
import { collectWithDescendants } from '../utils/todoFilters';

export type TodoBatch = {
  upserts?: Todo[];
  patches?: (Partial<Todo> & { id: string })[];
  deletes?: string[];
};

// Apply a batch to a cached list, mirroring the server order (upserts → patches
// → deletes) so the optimistic preview matches what the API will persist.
export function applyTodoBatch(list: Todo[], b: TodoBatch): Todo[] {
  let next = list.slice();
  if (b.upserts?.length) {
    const byId = new Map(next.map((t) => [t.id, t]));
    for (const u of b.upserts) byId.set(u.id, { ...(byId.get(u.id) ?? ({} as Todo)), ...u });
    next = [...byId.values()];
  }
  if (b.patches?.length) {
    const pmap = new Map(b.patches.map((p) => [p.id, p]));
    next = next.map((t) => (pmap.has(t.id) ? { ...t, ...pmap.get(t.id)! } : t));
  }
  if (b.deletes?.length) {
    const del = new Set(b.deletes);
    next = next.filter((t) => !del.has(t.id));
  }
  return next;
}

export function useTodos(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.todos,
    queryFn: async () => stripNullsList(await apiFetch<Todo[]>('/todos')),
    enabled,
  });
}

export const useCreateTodo = () =>
  useOptimisticListMutation<Todo, Todo>(
    queryKeys.todos,
    (todo) => apiFetch('/todos', { method: 'POST', body: JSON.stringify(todo) }),
    (list, todo) => [...list, todo]
  );

export const useUpdateTodo = () =>
  useOptimisticListMutation<Todo, { id: string; patch: Partial<Todo> }>(
    queryKeys.todos,
    // nullifyUndefined on the body only: cleared fields go as `null` (explicit
    // SET col = NULL) while the optimistic merge below keeps `undefined` so the
    // cell renders empty, not "null". See nullifyUndefined for the full rationale.
    ({ id, patch }) => apiFetch(`/todos/${id}`, { method: 'PATCH', body: JSON.stringify(nullifyUndefined(patch)) }),
    (list, { id, patch }) => list.map((t) => (t.id === id ? { ...t, ...patch } : t))
  );

export const useDeleteTodo = () =>
  useOptimisticListMutation<Todo, string>(
    queryKeys.todos,
    (id) => apiFetch(`/todos/${id}`, { method: 'DELETE' }),
    (list, id) => {
      const remove = collectWithDescendants(list, id);
      return list.filter((t) => !remove.has(t.id));
    }
  );

export const useBatchTodos = () =>
  useOptimisticListMutation<Todo, TodoBatch>(
    queryKeys.todos,
    // Same null/undefined split as useUpdateTodo: send cleared fields as `null`
    // (upserts carry the client's full intended state, so nulling their empty
    // fields is correct) while applyTodoBatch keeps `undefined` for the cache.
    (batch) =>
      apiFetch('/todos/batch', {
        method: 'POST',
        body: JSON.stringify({
          ...batch,
          ...(batch.upserts ? { upserts: batch.upserts.map(nullifyUndefined) } : {}),
          ...(batch.patches ? { patches: batch.patches.map(nullifyUndefined) } : {}),
        }),
      }),
    (list, batch) => applyTodoBatch(list, batch)
  );

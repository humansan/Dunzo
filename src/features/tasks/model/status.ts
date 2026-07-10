import { Todo, TodoStatus } from '@shared/types';

// Single completion predicate — replaces every `todo.completed` read. Completion is
// derived from status: only 'completed' counts as done (empty / todo / in_progress
// all read as not done).
export const isDone = (t: Pick<Todo, 'status'>): boolean => t.status === 'completed';

// Normalize completedAt to match status. Applied in the save handlers so call sites
// only ever set `status` and never touch completedAt. Idempotent.
export function normalizeCompletion(todo: Todo): Todo {
  const completedAt = todo.status === 'completed' ? (todo.completedAt ?? Date.now()) : undefined;
  return todo.completedAt === completedAt ? todo : { ...todo, completedAt };
}

// Checkbox toggle: checked => completed, unchecked => todo.
export const toggledStatus = (t: Pick<Todo, 'status'>): TodoStatus =>
  isDone(t) ? 'todo' : 'completed';

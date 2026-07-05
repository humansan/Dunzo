import { useEffect } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { TodoFullView } from '../../components/TodoFullView';
import { ViewErrorFallback } from '../../components/ViewErrorFallback';
import { useAppData } from '../../data/AppDataContext';

// The full task view as its own route. Consolidates the three former overlays
// (daily list, planner, ⌘K search) so a task is deep-linkable and back/forward
// closable. TodoFullView is a full-screen overlay, so it covers the shell while open.
export const Route = createFileRoute('/_authed/task/$taskId')({
  component: TaskRoute,
  errorComponent: ViewErrorFallback,
});

function TaskRoute() {
  const d = useAppData();
  const router = useRouter();
  const { taskId } = Route.useParams();
  const todo = d.todoById.get(taskId) ?? null;

  // Close: return to where we came from, or a default for a direct deep-link
  // (fresh tab) that has no in-app history to go back to.
  const close = () => {
    if (window.history.length > 1) router.history.back();
    else router.history.push('/today');
  };

  // Stale / deleted id (e.g. removed on another device) — leave the overlay.
  useEffect(() => {
    if (!todo) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo]);

  if (!todo) return null;

  return (
    <TodoFullView
      todo={todo}
      date={todo.dueDate || ''}
      collectionOptions={d.hubCollectionOptions}
      onCreateCollection={d.createCollection}
      byId={d.todoById}
      onClose={close}
      onSave={(updated, newDate) => d.handleHubSaveTodo({ ...updated, dueDate: newDate || undefined })}
      onToggle={d.handleToggleTodo}
      onDelete={(id) => { d.handleDeleteTodoById(id); close(); }}
    />
  );
}

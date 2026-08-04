import React, { useEffect, useRef, useCallback } from 'react';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { TodoFullView } from '@/features/tasks/TodoFullView';
import { useAppData } from '@/lib/app-data';
import { useOverlayNav } from '@/common/hooks/useOverlayNav';

// Task full-view modal wired to app data. Rendered both by AppShell (when the
// `task` search param is set - the in-app masked open) and by the /task/$taskId
// route (a cold deep-link). One source of truth for both entries.
export const TaskOverlay: React.FC<{ taskId: string; onClose: () => void }> = ({ taskId, onClose }) => {
  const d = useAppData();
  const router = useRouter();
  const { openTask } = useOverlayNav();
  const todo = d.todoById.get(taskId) ?? null;

  // Closing runs `onClose` = history.back(); several paths can request a close for the
  // same open (the Delete button closes, and deleting also empties the todo which trips
  // the stale-todo effect below), so guard it to fire at most once per open. Without
  // this, a delete pops multiple history entries and lands the user on the wrong page.
  // `back` shares the guard for the same reason: deleting a subtask steps back to the
  // parent AND empties the todo, so the stale-todo close must not fire on top of it.
  const closed = useRef(false);
  useEffect(() => { closed.current = false; }, [taskId]);
  const once = useCallback((fn: () => void) => () => {
    if (closed.current) return;
    closed.current = true;
    fn();
  }, []);
  const closeOnce = useCallback(() => once(onClose)(), [once, onClose]);

  // This view was opened from another task's full view (useOverlayNav.openTask
  // records the opener on the pushed entry), so it can offer a step back to that
  // task - one history entry, unlike close, which rewinds the whole chain. The
  // opener can have been deleted meanwhile; then there's simply no back.
  const fromTaskId = useRouterState({ select: (s) => s.location.state.fromTaskId });
  const fromTodo = fromTaskId ? d.todoById.get(fromTaskId) : undefined;
  const backOnce = useCallback(() => once(() => router.history.back())(), [once, router]);
  const backTo = fromTodo
    ? { label: fromTodo.text.trim() || 'Untitled', onBack: backOnce }
    : undefined;

  // Stale / deleted id (e.g. removed here or on another device) - leave the overlay.
  // Only once the todos have actually loaded: on a cold /task/$taskId deep-link the map
  // is briefly empty, and closing then would run history.back() straight out of the app
  // (a fresh tab has nowhere to go back to).
  useEffect(() => {
    if (d.isDataReady && !todo) closeOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo, d.isDataReady]);

  if (!todo) return null;

  return (
    <TodoFullView
      todo={todo}
      date={todo.dueDate || ''}
      collectionOptions={d.hubCollectionOptions}
      onCreateCollection={d.createCollection}
      byId={d.todoById}
      onClose={closeOnce}
      backTo={backTo}
      onSave={(updated, newDate) => d.handleHubSaveTodo({ ...updated, dueDate: newDate || undefined })}
      onToggle={d.handleToggleTodo}
      // Just delete here; TodoFullView calls onClose (closeOnce) right after, and the
      // stale-todo effect would otherwise fire a second close once the todo disappears.
      onDelete={(id) => d.handleDeleteTodoById(id)}
      onArchive={d.handleArchiveTodo}
      onUnarchive={d.handleUnarchiveTodo}
      // Subtasks section: its rows are other tasks, so they write through the
      // shared handlers rather than this view's draft. Clicking one swaps the
      // overlay to it (the same masked navigation the planner uses).
      onSaveTodo={d.handleHubSaveTodo}
      onOpenTask={openTask}
      onAddSubtask={d.handleAddSubtask}
      onReorder={d.handleReorderHubTodos}
      showXpChips={d.showXpChips}
    />
  );
};

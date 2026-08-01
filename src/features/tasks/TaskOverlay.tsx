import React, { useEffect, useRef, useCallback } from 'react';
import { TodoFullView } from '@/features/tasks/TodoFullView';
import { useAppData } from '@/lib/app-data';
import { useOverlayNav } from '@/common/hooks/useOverlayNav';

// Task full-view modal wired to app data. Rendered both by AppShell (when the
// `task` search param is set - the in-app masked open) and by the /task/$taskId
// route (a cold deep-link). One source of truth for both entries.
export const TaskOverlay: React.FC<{ taskId: string; onClose: () => void }> = ({ taskId, onClose }) => {
  const d = useAppData();
  const { openTask } = useOverlayNav();
  const todo = d.todoById.get(taskId) ?? null;

  // Closing runs `onClose` = history.back(); several paths can request a close for the
  // same open (the Delete button closes, and deleting also empties the todo which trips
  // the stale-todo effect below), so guard it to fire at most once per open. Without
  // this, a delete pops multiple history entries and lands the user on the wrong page.
  const closed = useRef(false);
  useEffect(() => { closed.current = false; }, [taskId]);
  const closeOnce = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  }, [onClose]);

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

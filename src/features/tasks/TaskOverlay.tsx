import React, { useEffect } from 'react';
import { TodoFullView } from '@/features/tasks/TodoFullView';
import { useAppData } from '@/lib/app-data';

// Task full-view modal wired to app data. Rendered both by AppShell (when the
// `task` search param is set - the in-app masked open) and by the /task/$taskId
// route (a cold deep-link). One source of truth for both entries.
export const TaskOverlay: React.FC<{ taskId: string; onClose: () => void }> = ({ taskId, onClose }) => {
  const d = useAppData();
  const todo = d.todoById.get(taskId) ?? null;

  // Stale / deleted id (e.g. removed on another device) - leave the overlay. Only
  // once the todos have actually loaded: on a cold /task/$taskId deep-link the map
  // is briefly empty, and closing then would run onClose's history.back() straight
  // out of the app (a fresh tab has nowhere to go back to).
  useEffect(() => {
    if (d.isDataReady && !todo) onClose();
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
      onClose={onClose}
      onSave={(updated, newDate) => d.handleHubSaveTodo({ ...updated, dueDate: newDate || undefined })}
      onToggle={d.handleToggleTodo}
      onDelete={(id) => { d.handleDeleteTodoById(id); onClose(); }}
      showXpChips={d.showXpChips}
    />
  );
};

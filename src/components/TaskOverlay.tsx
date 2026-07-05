import React, { useEffect } from 'react';
import { TodoFullView } from './TodoFullView';
import { useAppData } from '../data/AppDataContext';

// Task full-view modal wired to app data. Rendered both by AppShell (when the
// `task` search param is set — the in-app masked open) and by the /task/$taskId
// route (a cold deep-link). One source of truth for both entries.
export const TaskOverlay: React.FC<{ taskId: string; onClose: () => void }> = ({ taskId, onClose }) => {
  const d = useAppData();
  const todo = d.todoById.get(taskId) ?? null;

  // Stale / deleted id (e.g. removed on another device) — leave the overlay.
  useEffect(() => {
    if (!todo) onClose();
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
      onClose={onClose}
      onSave={(updated, newDate) => d.handleHubSaveTodo({ ...updated, dueDate: newDate || undefined })}
      onToggle={d.handleToggleTodo}
      onDelete={(id) => { d.handleDeleteTodoById(id); onClose(); }}
    />
  );
};

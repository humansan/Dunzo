import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Todo } from '@shared/types';
import { ConfirmModal } from '@/common/ui';
import { collectWithDescendants } from '@/features/tasks/model';

// Deleting is the one destructive operation here with no undo and no archive to
// fall back on - the row is gone from the database - so it asks first, the way
// archiving already does next door (useArchiveConfirm).
//
// Two questions, remembered SEPARATELY, because they are not the same question:
//
//   task      "delete this one row" - the ordinary case, and the one a user is
//             most likely to want to stop being asked about.
//   subtree   "delete this row AND the N rows nested inside it" - the surprising
//             one, since the subtasks are never named by the button that was
//             clicked and the server FK-cascades them away with the parent.
//
// Silencing the first therefore leaves the second asking, and vice versa: a user
// who is comfortable deleting single tasks has said nothing about being
// comfortable deleting a subtree they may not have realised was there.
//
// Wired once, at the provider (see app-data), so every Delete in the app - the
// planner row menu, the daily list row + its menu, the full view's button - goes
// through the same prompt and the same counts.
//
// TASKS ONLY. Collections are answered elsewhere and don't reach a prompt here:
// a non-empty one raises PlannerView's cascade-vs-promote dialog, which asks the
// better question (what happens to the CHILDREN - they can be kept), and an empty
// one is a container with nothing in it, where a confirmation is pure friction.
//
// Device-local (not DB-synced): "stop nagging me on this machine" isn't worth
// syncing, and it's cheap to re-learn.
const KEYS = {
  task: 'dun-confirm-delete-task',
  subtree: 'dun-confirm-delete-subtree',
} as const;

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage unavailable (private mode) - always ask
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

interface Pending {
  name: string;
  /** Subtasks nested inside that go with it. 0 selects the single-task variant. */
  inside: number;
  run: () => void;
}

export function useDeleteConfirm(params: {
  todos: Todo[];
  onDelete: (id: string) => void;
}): {
  requestDeleteTodo: (id: string, onDeleted?: () => void) => void;
  deleteConfirmModal: ReactNode;
} {
  const { todos, onDelete } = params;
  const [pending, setPending] = useState<Pending | null>(null);
  // ConfirmModal reports the checkbox just before running the chosen action, so a
  // ref (not state) is what the action can actually read in the same tick.
  const dontAsk = useRef(false);

  // `onDeleted` runs only once the delete actually happens, so a caller can send
  // the user somewhere afterwards (the full view closes itself) without having to
  // know whether a prompt appeared - and without navigating away on a cancel.
  const request = useCallback(
    (id: string, onDeleted?: () => void) => {
      const run = () => {
        onDelete(id);
        onDeleted?.();
      };
      const todo = todos.find((t) => t && t.id === id);
      // A missing row has nothing to describe, and a collection is answered by the
      // dialog that owns collections - neither blocks the delete on a prompt here.
      if (!todo || todo.isCollection === true) {
        run();
        return;
      }

      // Everything the delete takes with it. Archived descendants are counted in:
      // the database cascade doesn't care that they're hidden, and a count that
      // left them out would understate what is about to be destroyed.
      const inside = collectWithDescendants(todos, id).size - 1;
      if (read(inside > 0 ? KEYS.subtree : KEYS.task) === '1') {
        run();
        return;
      }

      dontAsk.current = false;
      setPending({ name: todo.text || 'Untitled', inside, run });
    },
    [todos, onDelete]
  );

  let deleteConfirmModal: ReactNode = null;
  if (pending) {
    const { inside } = pending;
    const cascading = inside > 0;
    deleteConfirmModal = (
      <ConfirmModal
        title={
          cascading
            ? `Delete “${pending.name}” and everything inside it?`
            : `Delete “${pending.name}”?`
        }
        description={
          cascading
            ? `This will permanently delete ${count(inside, 'subtask')}. You will lose all associated XP.`
            : `This task will be permanently deleted. You will lose all associated XP.`
        }
        onClose={() => setPending(null)}
        onDontShowAgainChange={(v) => { dontAsk.current = v; }}
        // Named per variant so the checkbox says which of the two it silences.
        dontShowAgainLabel={
          cascading
            ? "Don't ask again when deleting nested tasks"
            : "Don't ask again when deleting a single task"
        }
        actions={[
          {
            label: cascading ? `Delete ${inside + 1} tasks` : 'Delete',
            icon: <Trash2 size={18} />,
            tone: 'danger',
            onSelect: () => {
              if (dontAsk.current) write(cascading ? KEYS.subtree : KEYS.task, '1');
              pending.run();
              setPending(null);
            },
          },
        ]}
      />
    );
  }

  return { requestDeleteTodo: request, deleteConfirmModal };
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

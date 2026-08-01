import React, { useCallback, useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import { Todo } from '@shared/types';
import { ConfirmModal } from '@/common/ui';
import { descendantsToArchive, ancestorsToUnarchive } from '@/features/tasks/model';

// Archiving is a subtree operation in both directions (shared/domain/todoArchive):
// archiving a parent takes its descendants with it, and unarchiving a child brings
// its archived ancestors back, because a live todo may not sit under an archived
// one. Neither is obvious from a menu item labelled "Archive", so both prompt -
// but only when they actually reach beyond the row that was clicked.
//
// One hook, used by every entry point (planner row menu, sidebar collection menu,
// task full view), so the counts and the wording can't drift between them. The
// rows counted here are exactly the rows the write will touch: both come from the
// same pure helpers.

// The opt-outs are per DIRECTION and deliberately independent: dismissing the
// archive warning says nothing about whether the user understands that
// unarchiving lifts parents. Device-local (not a DB-synced setting) - it's a
// "stop nagging me here" preference, not something worth syncing.
const OPT_OUT_KEYS = {
  archive: 'dun-confirm-archive-subtree',
  unarchive: 'dun-confirm-unarchive-ancestors',
} as const;

type Direction = keyof typeof OPT_OUT_KEYS;

const isSuppressed = (dir: Direction): boolean => {
  try {
    return localStorage.getItem(OPT_OUT_KEYS[dir]) === '1';
  } catch {
    return false; // storage unavailable (private mode) - always ask
  }
};

const suppress = (dir: Direction) => {
  try {
    localStorage.setItem(OPT_OUT_KEYS[dir], '1');
  } catch {
    /* ignore */
  }
};

type Pending = {
  direction: Direction;
  /** The rows the write will touch, including the one that was clicked. */
  ids: string[];
  name: string;
  isCollection: boolean;
  run: () => void;
};

export function useArchiveConfirm(params: {
  todos: Todo[];
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
}) {
  const { todos, onArchive, onUnarchive } = params;
  const [pending, setPending] = useState<Pending | null>(null);

  // Archive or unarchive `id`, prompting first when the operation reaches rows the
  // user didn't click on and they haven't opted out of that direction's warning.
  const request = useCallback(
    (id: string) => {
      const todo = todos.find((t) => t && t.id === id);
      if (!todo) return;
      const direction: Direction = todo.archived ? 'unarchive' : 'archive';
      const ids =
        direction === 'archive'
          ? descendantsToArchive(todos, id)
          : ancestorsToUnarchive(todos, id);
      const run = () => (direction === 'archive' ? onArchive(id) : onUnarchive(id));

      // `ids` always contains the clicked row, so >1 means it reaches further.
      if (ids.length <= 1 || isSuppressed(direction)) {
        run();
        return;
      }
      setPending({
        direction,
        ids,
        name: todo.text || (todo.isCollection ? 'Untitled collection' : 'Untitled'),
        isCollection: todo.isCollection === true,
        run,
      });
    },
    [todos, onArchive, onUnarchive]
  );

  const modal = pending ? (
    <ConfirmModal
      title={
        pending.direction === 'archive'
          ? `Archive “${pending.name}” and everything inside it?`
          : `Unarchive “${pending.name}” and its parents?`
      }
      description={
        pending.direction === 'archive'
          ? `${pending.isCollection ? 'This collection' : 'This task'} has ${count(
              pending.ids.length - 1,
              pending.isCollection ? 'item' : 'subtask'
            )} nested inside. Archiving hides the whole subtree together.`
          : `${count(pending.ids.length - 1, 'parent')} above this task ${
              pending.ids.length - 1 === 1 ? 'is' : 'are'
            } archived. A task can't be active inside an archived one, so ${
              pending.ids.length - 1 === 1 ? 'it comes' : 'they come'
            } back too.`
      }
      onClose={() => setPending(null)}
      onDontShowAgainChange={(v) => v && suppress(pending.direction)}
      actions={[
        {
          label:
            pending.direction === 'archive'
              ? `Archive all ${pending.ids.length}`
              : `Unarchive all ${pending.ids.length}`,
          icon:
            pending.direction === 'archive' ? <Archive size={18} /> : <ArchiveRestore size={18} />,
          onSelect: () => {
            pending.run();
            setPending(null);
          },
        },
      ]}
    />
  ) : null;

  return { requestArchiveToggle: request, archiveConfirmModal: modal };
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Archive, ArchiveRestore, CornerDownRight } from 'lucide-react';
import { Todo } from '@shared/types';
import { ConfirmModal } from '@/common/ui';
import {
  descendantsToArchive,
  ancestorsToUnarchive,
  descendantsToUnarchive,
} from '@/features/tasks/model';

// Archiving reaches past the row that was clicked, in ways a menu item labelled
// "Archive" doesn't advertise, so it asks first. There are three distinct
// questions, and they are deliberately remembered separately - understanding one
// says nothing about the others:
//
//   archive          a subtree goes down together (mandatory: the invariant in
//                    shared/domain/todoArchive forbids a live todo under an
//                    archived one). One button; the checkbox just stops asking.
//   unarchive-up     archived PARENTS come back with it (also mandatory, same
//                    rule read the other way). One button.
//   unarchive-down   archived children may come back too, or stay archived -
//                    a genuine choice, since an archived child under a live
//                    parent is an ordinary state. Two buttons, and the checkbox
//                    remembers WHICH ONE rather than just suppressing.
//
// One hook for every entry point (planner row menu, sidebar collection menu, task
// full view) so the counts and wording can't drift. The rows counted here are
// exactly the rows the write will touch - both come from the same pure helpers.
//
// Device-local (not DB-synced): "stop nagging me on this machine" isn't worth
// syncing, and it's cheap to re-learn.
const KEYS = {
  archive: 'dun-confirm-archive-subtree',
  unarchiveUp: 'dun-confirm-unarchive-ancestors',
  unarchiveMode: 'dun-confirm-unarchive-mode',
} as const;

export type UnarchiveMode = 'self' | 'subtree';

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

type Pending =
  | { kind: 'archive'; name: string; isCollection: boolean; others: number; run: () => void }
  | { kind: 'unarchive-up'; name: string; others: number; run: () => void }
  | {
      kind: 'unarchive-down';
      name: string;
      isCollection: boolean;
      inside: number;
      parents: number;
      run: (mode: UnarchiveMode) => void;
    };

export function useArchiveConfirm(params: {
  todos: Todo[];
  onArchive: (id: string) => void;
  onUnarchive: (id: string, mode: UnarchiveMode) => void;
}) {
  const { todos, onArchive, onUnarchive } = params;
  const [pending, setPending] = useState<Pending | null>(null);
  // ConfirmModal reports the checkbox just before running the chosen action, so a
  // ref (not state) is what the action can actually read in the same tick.
  const dontAsk = useRef(false);

  const request = useCallback(
    (id: string) => {
      const todo = todos.find((t) => t && t.id === id);
      if (!todo) return;
      dontAsk.current = false;
      const name = todo.text || (todo.isCollection ? 'Untitled collection' : 'Untitled');
      const isCollection = todo.isCollection === true;

      if (!todo.archived) {
        // ── Archiving: everything inside comes along, no choice about it.
        const ids = descendantsToArchive(todos, id);
        const others = ids.length - 1;
        if (others <= 0 || read(KEYS.archive) === '1') {
          onArchive(id);
          return;
        }
        setPending({ kind: 'archive', name, isCollection, others, run: () => onArchive(id) });
        return;
      }

      // ── Unarchiving: parents are forced, children are a choice.
      const parents = ancestorsToUnarchive(todos, id).length - 1;
      const inside = descendantsToUnarchive(todos, id).length - 1;

      if (inside > 0) {
        const remembered = read(KEYS.unarchiveMode);
        if (remembered === 'self' || remembered === 'subtree') {
          onUnarchive(id, remembered);
          return;
        }
        setPending({
          kind: 'unarchive-down',
          name,
          isCollection,
          inside,
          parents,
          run: (mode) => onUnarchive(id, mode),
        });
        return;
      }

      if (parents <= 0 || read(KEYS.unarchiveUp) === '1') {
        onUnarchive(id, 'self');
        return;
      }
      setPending({
        kind: 'unarchive-up',
        name,
        others: parents,
        run: () => onUnarchive(id, 'self'),
      });
    },
    [todos, onArchive, onUnarchive]
  );

  const close = () => setPending(null);
  const finish = (fn: () => void, remember?: () => void) => {
    if (dontAsk.current && remember) remember();
    fn();
    setPending(null);
  };

  let modal: ReactNode = null;
  if (pending?.kind === 'archive') {
    const noun = pending.isCollection ? 'item' : 'subtask';
    modal = (
      <ConfirmModal
        title={`Archive “${pending.name}” and everything inside it?`}
        description={`${pending.isCollection ? 'This collection' : 'This task'} has ${count(
          pending.others,
          noun
        )} nested inside. Archiving hides the whole subtree together.`}
        onClose={close}
        onDontShowAgainChange={(v) => { dontAsk.current = v; }}
        actions={[
          {
            label: `Archive all ${pending.others + 1}`,
            icon: <Archive size={18} />,
            onSelect: () => finish(pending.run, () => write(KEYS.archive, '1')),
          },
        ]}
      />
    );
  } else if (pending?.kind === 'unarchive-up') {
    modal = (
      <ConfirmModal
        title={`Unarchive “${pending.name}” and its parents?`}
        description={`${count(pending.others, 'parent')} above this task ${
          pending.others === 1 ? 'is' : 'are'
        } archived. A task can't be active inside an archived one, so ${
          pending.others === 1 ? 'it comes' : 'they come'
        } back too.`}
        onClose={close}
        onDontShowAgainChange={(v) => { dontAsk.current = v; }}
        actions={[
          {
            label: `Unarchive all ${pending.others + 1}`,
            icon: <ArchiveRestore size={18} />,
            onSelect: () => finish(pending.run, () => write(KEYS.unarchiveUp, '1')),
          },
        ]}
      />
    );
  } else if (pending?.kind === 'unarchive-down') {
    const self = pending.isCollection ? 'collection' : 'task';
    const noun = pending.isCollection ? 'item' : 'subtask';
    modal = (
      <ConfirmModal
        title={`Unarchive “${pending.name}”`}
        description={
          <>
            {`This ${self} has ${count(pending.inside, noun)} archived inside it.`}
            {pending.parents > 0 &&
              ` ${count(pending.parents, 'archived parent')} above it ${
                pending.parents === 1 ? 'comes' : 'come'
              } back either way - nothing can be active inside an archived todo.`}
          </>
        }
        onClose={close}
        onDontShowAgainChange={(v) => { dontAsk.current = v; }}
        dontShowAgainLabel="Remember my choice and stop asking"
        actions={[
          // The wider action goes first, matching the status/priority cascade dialog.
          {
            label: `This ${self} and everything inside`,
            description: `Also restore the ${count(pending.inside, noun)} nested inside it.`,
            icon: <CornerDownRight size={18} />,
            onSelect: () =>
              finish(() => pending.run('subtree'), () => write(KEYS.unarchiveMode, 'subtree')),
          },
          {
            label: `Just this ${self}`,
            description: `Leave the ${count(pending.inside, noun)} inside archived.`,
            icon: <ArchiveRestore size={18} />,
            onSelect: () =>
              finish(() => pending.run('self'), () => write(KEYS.unarchiveMode, 'self')),
          },
        ]}
      />
    );
  }

  return { requestArchiveToggle: request, archiveConfirmModal: modal };
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

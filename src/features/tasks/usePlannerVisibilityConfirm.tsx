import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Database, EyeOff, CornerDownRight, Eye } from 'lucide-react';
import { Todo } from '@shared/types';
import { ConfirmModal } from '@/common/ui';
import {
  descendantsToHide,
  descendantsToShow,
  ancestorsToShow,
} from '@/features/tasks/model';

// Toggling a task's Task Planner visibility reaches past the row that was
// clicked, in ways a switch labelled "Task Planner" doesn't advertise, so it asks
// first. Same three questions as the archive confirmation next door, for the same
// reason - the constraint has the same shape (see shared/domain/todoPlannerVisibility):
//
//   hide          a subtree goes down together (mandatory: a visible todo may not
//                 sit under a hidden one, or it renders orphaned at the root of
//                 the Planner). One button; the checkbox just stops asking.
//   show-up       hidden PARENTS come back with it (also mandatory, same rule read
//                 the other way). One button.
//   show-down     hidden children may come back too, or stay hidden - a genuine
//                 choice, since a hidden subtask under a visible parent is an
//                 ordinary state. Two buttons, and the checkbox remembers WHICH
//                 ONE rather than just suppressing. It exists because after a
//                 cascade-hide, a subtask hidden deliberately and one hidden as
//                 collateral are indistinguishable - so we ask instead of guessing.
//
// Each dialog is skipped outright when its count is zero, so the ordinary case (a
// task with no subtasks, or with visible parents) stays a plain toggle.
//
// Deliberately a sibling of useArchiveConfirm rather than a generalization of it:
// the two share a shape, not a meaning, and the wording carries most of the value.
// If a third subtree-flag ever appears, factor them together then.
//
// Device-local (not DB-synced): "stop nagging me on this machine" isn't worth
// syncing, and it's cheap to re-learn.
const KEYS = {
  hide: 'dun-confirm-hide-planner-subtree',
  showUp: 'dun-confirm-show-planner-ancestors',
  showMode: 'dun-confirm-show-planner-mode',
} as const;

export type ShowMode = 'self' | 'subtree';

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
  | { kind: 'hide'; name: string; others: number; run: () => void }
  | { kind: 'show-up'; name: string; others: number; run: () => void }
  | {
      kind: 'show-down';
      name: string;
      inside: number;
      parents: number;
      run: (mode: ShowMode) => void;
    };

export function usePlannerVisibilityConfirm(params: {
  todos: Todo[];
  onHide: (id: string) => void;
  onShow: (id: string, mode: ShowMode) => void;
}) {
  const { todos, onHide, onShow } = params;
  const [pending, setPending] = useState<Pending | null>(null);
  // ConfirmModal reports the checkbox just before running the chosen action, so a
  // ref (not state) is what the action can actually read in the same tick.
  const dontAsk = useRef(false);

  // `next` is the value the switch was moved TO, so the caller doesn't have to
  // re-derive it from the row it just rendered.
  const request = useCallback(
    (id: string, next: boolean) => {
      const todo = todos.find((t) => t && t.id === id);
      if (!todo) return;
      dontAsk.current = false;
      const name = todo.text || 'Untitled';

      if (!next) {
        // ── Hiding: everything inside comes along, no choice about it.
        const ids = descendantsToHide(todos, id);
        const others = ids.length - 1;
        if (others <= 0 || read(KEYS.hide) === '1') {
          onHide(id);
          return;
        }
        setPending({ kind: 'hide', name, others, run: () => onHide(id) });
        return;
      }

      // ── Showing: parents are forced, children are a choice.
      const parents = ancestorsToShow(todos, id).length - 1;
      const inside = descendantsToShow(todos, id).length - 1;

      if (inside > 0) {
        const remembered = read(KEYS.showMode);
        if (remembered === 'self' || remembered === 'subtree') {
          onShow(id, remembered);
          return;
        }
        setPending({
          kind: 'show-down',
          name,
          inside,
          parents,
          run: (mode) => onShow(id, mode),
        });
        return;
      }

      if (parents <= 0 || read(KEYS.showUp) === '1') {
        onShow(id, 'self');
        return;
      }
      setPending({
        kind: 'show-up',
        name,
        others: parents,
        run: () => onShow(id, 'self'),
      });
    },
    [todos, onHide, onShow]
  );

  const close = () => setPending(null);
  const finish = (fn: () => void, remember?: () => void) => {
    if (dontAsk.current && remember) remember();
    fn();
    setPending(null);
  };

  let modal: ReactNode = null;
  if (pending?.kind === 'hide') {
    modal = (
      <ConfirmModal
        title={`Hide “${pending.name}” and everything inside it from the Task Planner?`}
        description={`This task has ${count(
          pending.others,
          'subtask'
        )} nested inside. A subtask can't appear in the Planner without its parent, so the whole subtree is hidden together - they stay reachable inside this task.`}
        onClose={close}
        onDontShowAgainChange={(v) => { dontAsk.current = v; }}
        actions={[
          {
            label: `Hide all ${pending.others + 1}`,
            icon: <EyeOff size={18} />,
            onSelect: () => finish(pending.run, () => write(KEYS.hide, '1')),
          },
        ]}
      />
    );
  } else if (pending?.kind === 'show-up') {
    modal = (
      <ConfirmModal
        title={`Show “${pending.name}” in the Task Planner?`}
        description={`${count(pending.others, 'parent task')} above it ${
          pending.others === 1 ? 'is' : 'are'
        } hidden from the Planner. A task can't appear there without its parents, so ${
          pending.others === 1 ? 'it comes' : 'they come'
        } back too.`}
        onClose={close}
        onDontShowAgainChange={(v) => { dontAsk.current = v; }}
        actions={[
          {
            label: `Show all ${pending.others + 1}`,
            icon: <Database size={18} />,
            onSelect: () => finish(pending.run, () => write(KEYS.showUp, '1')),
          },
        ]}
      />
    );
  } else if (pending?.kind === 'show-down') {
    modal = (
      <ConfirmModal
        title={`Show “${pending.name}” in the Task Planner`}
        description={
          <>
            {`This task has ${count(pending.inside, 'subtask')} hidden from the Planner.`}
            {pending.parents > 0 &&
              ` ${count(pending.parents, 'hidden parent task')} above it ${
                pending.parents === 1 ? 'comes' : 'come'
              } back either way - nothing can appear in the Planner without its parents.`}
          </>
        }
        onClose={close}
        onDontShowAgainChange={(v) => { dontAsk.current = v; }}
        dontShowAgainLabel="Remember my choice and stop asking"
        actions={[
          // The wider action goes first, matching the archive dialog.
          {
            label: 'This task and everything inside',
            description: `Also show the ${count(pending.inside, 'subtask')} hidden inside it.`,
            icon: <CornerDownRight size={18} />,
            onSelect: () =>
              finish(() => pending.run('subtree'), () => write(KEYS.showMode, 'subtree')),
          },
          {
            label: 'Just this task',
            description: `Leave the ${count(pending.inside, 'subtask')} inside hidden.`,
            icon: <Eye size={18} />,
            onSelect: () =>
              finish(() => pending.run('self'), () => write(KEYS.showMode, 'self')),
          },
        ]}
      />
    );
  }

  return { requestPlannerVisibility: request, plannerVisibilityConfirmModal: modal };
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

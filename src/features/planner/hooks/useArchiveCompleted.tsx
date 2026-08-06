import { type ReactNode, useMemo, useState } from 'react';
import { Archive } from 'lucide-react';
import { Todo } from '@shared/types';
import { ConfirmModal } from '@/common/ui';
import { OrganizerEntry, descendantsToArchive, isDone } from '@/features/tasks/model';

// "Archive completed tasks in view" - the Sections menu's one action, for clearing
// a backlog of finished tasks in a single write.
//
// Scope is deliberately WYSIWYG: it acts on exactly the task rows the table is
// rendering (`renderedTaskEntries` - view membership, filter rules, hideCompleted,
// hideEmptyCollections and hideSubcollections all already applied), so the user can
// see beforehand what the button will take. The one thing NOT honoured is collapse
// state: a folded row is still in the view, it just isn't drawn this second.
//
// The consequence is that on a default view the count is 0 and the button is
// disabled, because `hideCompleted` is on unless a view turns it off (see
// resolveViewFilters). That is the honest reading of the scope rule rather than a
// gap: filters are how the user says WHICH completed tasks they mean (only Low
// priority, only this collection, …), and a view that hides completed tasks is not
// showing any to archive. `disabledReason` says so on the button, and the Completed
// tab - which opts out of the inherited setting - is always available.
export function useArchiveCompleted(params: {
  // The view's rendered task rows (see useHubData.renderedTaskEntries).
  renderedTaskEntries: OrganizerEntry[];
  // Every todo, archived included - what the subtree walk needs.
  todos: Todo[];
  // The view's display name, for the prompt.
  viewLabel: string;
  // Whether this view hides completed tasks, which is the usual reason there are
  // none to archive and is worth saying out loud rather than leaving a dead button.
  hideCompleted: boolean;
  onArchiveTodos: (ids: string[]) => void;
}) {
  const { renderedTaskEntries, todos, viewLabel, hideCompleted, onArchiveTodos } = params;
  const [pending, setPending] = useState<{ ids: string[]; extra: number } | null>(null);

  // `archived` matters despite the live views drawing from the organizer set: the
  // Archived tab renders archived rows, most of which are completed. Without this
  // the button would offer to archive what is already archived - a count that looks
  // real, a prompt that appears, and a write that patches nothing.
  const completedIds = useMemo(
    () =>
      renderedTaskEntries
        .filter((e) => isDone(e.todo) && e.todo.archived !== true)
        .map((e) => e.todo.id),
    [renderedTaskEntries]
  );

  const completedCount = completedIds.length;
  const disabledReason = completedCount
    ? undefined
    : hideCompleted
      ? 'This view hides completed tasks. Turn off “Hide completed tasks” in the Filter menu, or use the Completed tab.'
      : 'No completed tasks in this view.';

  const requestArchiveCompleted = () => {
    if (!completedCount) return;
    // The rows the write will actually touch: archiving a completed parent takes
    // its live subtask with it (the invariant in shared/domain/todoArchive), and
    // that row is NOT one of the completed ones the user counted on screen. Same
    // helper the write uses, so the number in the prompt is the number of patches.
    const union = new Set<string>();
    for (const id of completedIds) for (const tid of descendantsToArchive(todos, id)) union.add(tid);
    setPending({ ids: completedIds, extra: Math.max(0, union.size - completedCount) });
  };

  // Always asks. Unlike the per-row prompt in useArchiveConfirm there is no
  // "don't show again": this is a bulk write whose blast radius is different every
  // time, so the count IS the information.
  let archiveCompletedModal: ReactNode = null;
  if (pending) {
    const n = pending.ids.length;
    archiveCompletedModal = (
      <ConfirmModal
        title={`Archive ${n} completed ${n === 1 ? 'task' : 'tasks'} in “${viewLabel}”?`}
        description={
          <>
            {`These are the completed tasks currently shown in this view.`}
            {pending.extra > 0 &&
              ` ${pending.extra} unfinished ${
                pending.extra === 1 ? 'item' : 'items'
              } nested inside them ${
                pending.extra === 1 ? 'comes' : 'come'
              } along - nothing can stay active inside an archived task.`}
          </>
        }
        onClose={() => setPending(null)}
        actions={[
          {
            label: `Archive ${n === 1 ? 'it' : `all ${n}`}`,
            description: 'They move to the Archived tab, where they can be restored.',
            icon: <Archive size={18} />,
            onSelect: () => {
              onArchiveTodos(pending.ids);
              setPending(null);
            },
          },
        ]}
      />
    );
  }

  return { completedCount, disabledReason, requestArchiveCompleted, archiveCompletedModal };
}

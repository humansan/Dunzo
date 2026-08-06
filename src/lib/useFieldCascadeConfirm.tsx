import { type ReactNode, useCallback, useRef, useState } from 'react';
import { ListChecks, CornerDownRight } from 'lucide-react';
import { ConfirmModal } from '@/common/ui';

// Changing a parent task's status or priority is ambiguous: does it describe just
// that task, or the work underneath it too? Both readings are reasonable, so ask -
// and remember the answer PER FIELD, since "completing a parent completes its
// subtasks" and "re-prioritising a parent re-prioritises its subtasks" are separate
// habits and a user may well want them to differ.
//
// Presentational + memory only. The caller supplies the affected ids and both
// writes, so this needs nothing from the todo domain and can sit in lib/ next to
// the provider that drives it (every status/priority edit in the app funnels
// through app-data's two save handlers, so that's the only place this is used).
//
// Device-local, like the archive opt-outs: "stop asking me here" isn't worth syncing.
const KEY: Record<CascadeField, string> = {
  status: 'dun-cascade-status',
  priority: 'dun-cascade-priority',
};

export type CascadeField = 'status' | 'priority';
type Mode = 'self' | 'subtree';

const read = (field: CascadeField): Mode | null => {
  try {
    const v = localStorage.getItem(KEY[field]);
    return v === 'self' || v === 'subtree' ? v : null;
  } catch {
    return null; // storage unavailable (private mode) - always ask
  }
};
const write = (field: CascadeField, mode: Mode) => {
  try {
    localStorage.setItem(KEY[field], mode);
  } catch {
    /* ignore */
  }
};

export interface CascadeRequest {
  field: CascadeField;
  /** Name of the task being edited, for the prompt. */
  name: string;
  /** Task descendants the change COULD apply to (never includes the edited task). */
  descendantIds: string[];
  /** Write the change to the edited task only. Always runs. */
  applySelf: () => void;
  /** Additionally write it to these descendants. */
  applyToDescendants: (ids: string[]) => void;
}

export function useFieldCascadeConfirm(): {
  askFieldCascade: (req: CascadeRequest) => void;
  fieldCascadeModal: ReactNode;
} {
  const [pending, setPending] = useState<CascadeRequest | null>(null);
  // ConfirmModal reports the checkbox immediately before running the chosen
  // action, so a ref is what that action can read in the same tick.
  const remember = useRef(false);

  const askFieldCascade = useCallback((req: CascadeRequest) => {
    const apply = (mode: Mode) => {
      req.applySelf();
      if (mode === 'subtree') req.applyToDescendants(req.descendantIds);
    };
    if (req.descendantIds.length === 0) {
      apply('self'); // nothing to ask about
      return;
    }
    const remembered = read(req.field);
    if (remembered) {
      apply(remembered);
      return;
    }
    remember.current = false;
    setPending(req);
  }, []);

  let fieldCascadeModal: ReactNode = null;
  if (pending) {
    const n = pending.descendantIds.length;
    const subtasks = `${n} subtask${n === 1 ? '' : 's'}`;
    const choose = (mode: Mode) => {
      if (remember.current) write(pending.field, mode);
      pending.applySelf();
      if (mode === 'subtree') pending.applyToDescendants(pending.descendantIds);
      setPending(null);
    };
    fieldCascadeModal = (
      <ConfirmModal
        title={`Change ${pending.field} of “${pending.name}”`}
        description={`This task has ${subtasks}. Apply the new ${pending.field} to them as well?`}
        onClose={() => setPending(null)}
        onDontShowAgainChange={(v) => { remember.current = v; }}
        dontShowAgainLabel={`Remember my choice for ${pending.field} changes`}
        actions={[
          // Cascade first: it's the wider action, and listing it on top keeps this
          // dialog consistent with the unarchive one.
          {
            label: `This task and its ${subtasks}`,
            description: `Apply the same ${pending.field} all the way down.`,
            icon: <CornerDownRight size={18} />,
            onSelect: () => choose('subtree'),
          },
          {
            label: 'Just this task',
            description: `Leave the ${subtasks} unchanged.`,
            icon: <ListChecks size={18} />,
            onSelect: () => choose('self'),
          },
        ]}
      />
    );
  }

  return { askFieldCascade, fieldCascadeModal };
}

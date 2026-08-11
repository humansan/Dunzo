import { type ReactNode, useCallback, useRef, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { CalendarX2, CalendarMinus } from 'lucide-react';
import { ConfirmModal } from '@/common/ui';

// Clearing a task's DUE date is the one schedule clear that can strand the other
// side. Due is the anchor (shared/domain/todoSchedule): drop it and a task that
// still has a start reads as scheduled while nothing downstream - daily list,
// calendar span, countdown - can place it. Both readings of the click are
// reasonable ("I only meant the deadline" / "unschedule the whole thing"), so ask
// once and remember the answer.
//
// Only DUE asks. Clearing a START strands nothing, and clearing a TIME leaves its
// date behind, so both just apply. Clearing a date always takes its time with it -
// a time can't exist without its date - which is why there is no third option.
//
// Presentational + memory only: the caller owns the write and is handed a single
// boolean, which is what lets ONE instance (rendered by AppDataProvider) serve
// every surface that can clear a due date - the CalendarInput panels in the
// planner cell editor, both row context menus and the date chips, plus the full
// view's Due row. Hosting it there also outlives the surface: a row menu or cell
// popover unmounts the moment the dialog above it takes the next click, and a
// modal rendered by that surface would go with it.
//
// Device-local, like the archive and cascade opt-outs: "stop asking me on this
// machine" isn't worth syncing, and it's cheap to re-learn.
const KEY = 'dun-confirm-clear-due-start';

type Mode = 'due' | 'both';

const read = (): Mode | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'due' || v === 'both' ? v : null;
  } catch {
    return null; // storage unavailable (private mode) - always ask
  }
};
const write = (mode: Mode) => {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
};

export interface ClearDueRequest {
  /** The task losing its due date. Only its name and start side are read. */
  todo: { text?: string; startDate?: string; startTime?: string };
  /**
   * Perform the clear. Always runs (immediately when there's nothing to ask
   * about); `alsoClearStart` is true only for "Clear start and end".
   */
  apply: (alsoClearStart: boolean) => void;
}

export function useClearDueConfirm(): {
  requestClearDue: (req: ClearDueRequest) => void;
  clearDueConfirmModal: ReactNode;
} {
  const [pending, setPending] = useState<ClearDueRequest | null>(null);
  // ConfirmModal reports the checkbox immediately before running the chosen
  // action, so a ref is what that action can read in the same tick.
  const remember = useRef(false);

  const requestClearDue = useCallback((req: ClearDueRequest) => {
    // A time requires a date on its own side, so the start date alone decides
    // whether there is a start to strand. `startTime` is checked anyway: a row
    // that somehow holds an orphan one still has start data to lose.
    if (!req.todo.startDate && !req.todo.startTime) {
      req.apply(false);
      return;
    }
    const remembered = read();
    if (remembered) {
      req.apply(remembered === 'both');
      return;
    }
    remember.current = false;
    setPending(req);
  }, []);

  let clearDueConfirmModal: ReactNode = null;
  if (pending) {
    const choose = (mode: Mode) => {
      if (remember.current) write(mode);
      pending.apply(mode === 'both');
      setPending(null);
    };
    const startedOn = formatDay(pending.todo.startDate);
    clearDueConfirmModal = (
      <ConfirmModal
        title="Clear start as well?"
        description={`“${pending.todo.text || 'Untitled'}”${
          startedOn ? ` starts on ${startedOn}` : ' has a start time'
        }. Clearing the due date leaves it with a start and no end.`}
        onClose={() => setPending(null)}
        onDontShowAgainChange={(v) => { remember.current = v; }}
        dontShowAgainLabel="Remember my choice and stop asking"
        actions={[
          // The wider action first, matching the archive and cascade dialogs.
          {
            label: 'Clear start and end',
            description: 'Unschedule the task completely - both dates and their times.',
            icon: <CalendarX2 size={18} />,
            onSelect: () => choose('both'),
          },
          {
            label: 'Clear just end',
            description: `Keep the start${pending.todo.startTime ? ' date and time' : ' date'}.`,
            icon: <CalendarMinus size={18} />,
            onSelect: () => choose('due'),
          },
        ]}
      />
    );
  }

  return { requestClearDue, clearDueConfirmModal };
}

const formatDay = (iso?: string): string | null => {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'MMM d') : null;
};

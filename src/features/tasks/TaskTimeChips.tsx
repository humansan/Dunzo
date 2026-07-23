import React from 'react';
import { Clock } from 'lucide-react';
import { Todo } from '@shared/types';
import { formatTime12h } from '@/common/lib/time';

export type CountdownMode = 'off' | 'time' | 'percent';

/**
 * Time remaining until a todo's due time on `date`, formatted per `mode`.
 * Returns null when there's nothing to show (no due time / no date / mode off).
 */
export function formatCountdown(
  todo: Todo,
  date: string | undefined,
  now: Date,
  mode: CountdownMode,
): string | null {
  if (mode === 'off' || !todo.dueTime || !date) return null;

  const [hours, minutes] = todo.dueTime.split(':').map(Number);
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(year, month - 1, day, hours, minutes, 0, 0);

  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return mode === 'percent' ? '0%' : '00:00';

  if (mode === 'percent') {
    const pct = Math.max(0, Math.round((diff / (24 * 60 * 60 * 1000)) * 100));
    return `${pct}%`;
  }
  const totalSeconds = Math.floor(diff / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * The time-remaining pill. Split out from TaskTimeChips because the daily list
 * renders it alongside the interactive TimeChip (which opens a time picker)
 * rather than the read-only due-time chip below.
 */
export const CountdownChip: React.FC<{ countdown: string; inverted?: boolean }> = ({
  countdown,
  inverted = false,
}) => (
  <div
    className={`flex items-center gap-2 px-2.75 h-[27px] rounded-lg ${
      inverted ? 'bg-danger text-white' : 'bg-fill-subtle text-danger'
    }`}
  >
    <div className="text-[13px] leading-none font-mono font-medium">
      <span className="relative top-px">{countdown}</span>
    </div>
  </div>
);

interface TaskTimeChipsProps {
  todo: Todo;
  /** Pre-formatted countdown text (see formatCountdown); null/undefined hides the chip. */
  countdown?: string | null;
  /** 'inverted' = solid accent fill with inverted text - used by the active tracker. */
  variant?: 'default' | 'inverted';
  done?: boolean;
}

/**
 * The read-only due-time (+ due-percentage) chip and the countdown chip. Used by
 * the active-task tracker; the daily list builds the same readout from the
 * editable TimeChip plus CountdownChip.
 */
export const TaskTimeChips: React.FC<TaskTimeChipsProps> = ({
  todo,
  countdown,
  variant = 'default',
  done = false,
}) => {
  const inverted = variant === 'inverted';
  const textCls = done ? 'text-fg-ghost' : inverted ? 'text-canvas' : 'text-(--accent1)';

  return (
    <>
      {(todo.dueTime || todo.duePercentage !== undefined) && (
        <div
          className={`flex items-center justify-center gap-2 px-2.75 py-[5.5px] rounded-lg transition ${
            done
              ? 'bg-fill-subtle shadow-none'
              : inverted
                ? 'bg-(--accent1) shadow-lg shadow-(--accent1)/10'
                : 'bg-(--accent1)/6 shadow-none hover:bg-(--accent1)/15'
          }`}
        >
          {todo.dueTime && (
            <div className={`flex items-center justify-center gap-1.5 text-[13px] leading-none font-mono font-medium ${textCls}`}>
              <Clock size={16} />
              <span className="relative top-px">{formatTime12h(todo.dueTime)}</span>
            </div>
          )}
          {todo.dueTime && todo.duePercentage !== undefined && (
            <div className={`w-px h-4 ${done ? 'bg-fill' : inverted ? 'bg-black/20' : 'bg-(--accent1)/20'}`} />
          )}
          {todo.duePercentage !== undefined && (
            <div className={`text-[13px] leading-none font-mono font-medium ${textCls}`}>
              <span className="relative top-px">
                {Number.isInteger(todo.duePercentage) ? todo.duePercentage : Math.round(todo.duePercentage)}%
              </span>
            </div>
          )}
        </div>
      )}

      {countdown && !done && <CountdownChip countdown={countdown} inverted={inverted} />}
    </>
  );
};

import { useEffect, useMemo, useReducer, useRef } from 'react';
import { OrganizerEntry, isDone } from '@/features/tasks/model';
import { COMPLETE_ANIM_MS } from '@/features/tasks/fields';

// Ids of tasks that became completed within the last COMPLETE_ANIM_MS, so the Hide
// completed filter can let them finish leaving.
//
// Checking a task off under that filter drops its row in the same frame as the
// click, so the check never animates and the row just blinks out - the one moment
// in the app where feedback matters most has none. The wait belongs here rather
// than in the checkbox (which used to paint a local checked state and delay the
// commit): the row is only disappearing BECAUSE of a filter, so the filter is what
// should wait. Everything the completion touches - the pop, the strikethrough, the
// subtask-cascade prompt - then runs off the committed status, with no second
// source of truth to fall out of step with, and a completion no filter would hide
// costs nothing.
//
// Derived DURING render, not in an effect: an effect runs after the commit, by
// which time the filter has already dropped the row, and the id would only bring
// it back for a flash. So the diff is a ref compared against the entries being
// rendered - idempotent, so a repeat pass over an unchanged list is a no-op.
//
// Diffing the workspace-wide entry list (not the current view's) is deliberate:
// switching tabs changes which rows are on screen, and a task that arrives already
// done must not read as freshly completed. Un-completing inside the window needs no
// cleanup either - the id sits in the map until it expires, but an unfinished task
// passes the filter on its own.
const EMPTY: ReadonlySet<string> = new Set<string>();

export function useCompletionGrace(entries: OrganizerEntry[]): ReadonlySet<string> {
  // null until the first pass, which only seeds: without that, everything already
  // completed on mount reads as newly done and shows up under Hide completed.
  const prevDone = useRef<Set<string> | null>(null);
  const expiry = useRef(new Map<string, number>()); // id → when its exemption ends
  const [tick, expire] = useReducer((n: number) => n + 1, 0);

  const graceIds = useMemo(() => {
    const done = new Set<string>();
    for (const e of entries) if (!e.todo.isCollection && isDone(e.todo)) done.add(e.todo.id);
    const before = prevDone.current;
    prevDone.current = done;

    const now = Date.now();
    for (const [id, at] of expiry.current) if (at <= now) expiry.current.delete(id);
    // Re-completing inside the window just extends it, which is what a second pop
    // wants anyway.
    if (before) for (const id of done) if (!before.has(id)) expiry.current.set(id, now + COMPLETE_ANIM_MS);

    return expiry.current.size ? new Set(expiry.current.keys()) : EMPTY;
    // `tick` is a dependency so an expiry can re-run the prune above; nothing here
    // reads it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, tick]);

  // Nothing else is guaranteed to re-render when an exemption runs out - the todo
  // hasn't changed, only the clock - so wake the pass above at the earliest one.
  useEffect(() => {
    if (!graceIds.size) return;
    const due = Math.min(...expiry.current.values()) - Date.now();
    const timer = setTimeout(expire, Math.max(0, due));
    return () => clearTimeout(timer);
  }, [graceIds]);

  return graceIds;
}

import { Tracker } from '@shared/types';

// ── Widget order ─────────────────────────────────────────────────────────────
// The list's order is the user's, set by dragging in the Order menu and stored as
// `sortOrder` (0, 1, 2 … assigned across the whole list on every reorder).
//
// The server already returns rows in this order, but every surface sorts again on
// read: a reorder updates the cache optimistically without refetching (see
// useOptimisticListMutation), and a freshly created widget is appended locally, so
// the client is the one that has to keep the order true between refetches.
//
// A tracker with no sortOrder - restored from a pre-ordering backup - goes last
// rather than first: the scales don't mix (0,1,2 … vs. epoch ms), so falling back
// to createdAt inline would scatter old widgets through the ordered ones instead of
// leaving them in a predictable block at the end.
export const sortTrackers = (list: Tracker[]): Tracker[] =>
  [...list].sort((a, b) => {
    const ao = a.sortOrder ?? Infinity;
    const bo = b.sortOrder ?? Infinity;
    return ao !== bo ? ao - bo : a.createdAt - b.createdAt;
  });

// Where a newly created widget goes: the end of the list.
export const nextTrackerSortOrder = (list: Tracker[]): number =>
  list.reduce((max, t) => Math.max(max, t.sortOrder ?? -1), -1) + 1;

// Apply a drag to an id list: `dragId` lands immediately before/after `targetId`.
// Pure, so the menu stays presentational and the caller owns the write.
export const moveTrackerId = (
  ids: string[],
  dragId: string,
  targetId: string,
  pos: 'before' | 'after'
): string[] => {
  if (dragId === targetId) return ids;
  const without = ids.filter((id) => id !== dragId);
  const at = without.indexOf(targetId);
  if (at === -1) return ids;
  without.splice(pos === 'before' ? at : at + 1, 0, dragId);
  return without;
};

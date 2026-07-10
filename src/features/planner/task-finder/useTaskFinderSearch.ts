import { useMemo } from 'react';
import { Todo } from '@shared/types';
import { OrganizerEntry } from '@/features/tasks/model';
import { fuzzyMatch } from '@/utils/fuzzyMatch';
import { COLUMNS } from '@/features/planner/types';
import { getFieldDisplayValue } from '@/features/planner/model/viewUtils';

// The Task Finder's search core. A task is a hit when the query fuzzy-matches its
// name (VSCode-style, §fuzzyMatch) OR when every query token appears in its all-fields
// haystack — the joined *display* values of the other columns (status/priority labels,
// formatted dates, notes, the collection breadcrumb, …) via getFieldDisplayValue, so
// searching e.g. a collection name or "high" surfaces the right tasks. Collections are
// never hits. Returns the matching tasks in natural (input) order, capped; score-based
// ranking is deferred to the polished flat list (plan Phase 5).
export function useTaskFinderSearch(
  entries: OrganizerEntry[],
  todoById: Map<string, Todo>,
  query: string,
  limit = 50
): OrganizerEntry[] {
  const q = query.trim();
  return useMemo(() => {
    if (!q) return [];
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits: OrganizerEntry[] = [];
    for (const e of entries) {
      if (e.todo.isCollection) continue;
      const name = e.todo.text ?? '';
      let matched = fuzzyMatch(q, name) !== null;
      if (!matched) {
        const haystack = COLUMNS
          .filter((c) => c.key !== 'title')
          .map((c) => getFieldDisplayValue(e, c.key, todoById))
          .join('  ')
          .toLowerCase();
        matched = tokens.every((tok) => haystack.includes(tok));
      }
      if (matched) {
        hits.push(e);
        if (hits.length >= limit) break;
      }
    }
    return hits;
  }, [entries, todoById, q, limit]);
}

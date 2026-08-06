import { isValid, parseISO } from 'date-fns';

// The `?date=` param shared by /today and /calendar. Both tabs keep their own
// date (they're independent surfaces), but they agree on what a valid one is:
// `yyyy-MM-dd` naming a day that actually exists. Shape alone isn't enough -
// `2026-02-31` passes a regex and then parses to an Invalid Date, which is what
// reaches the views and breaks them.

export const isDayParam = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value));

/** Route `validateSearch`: keep a real day, drop anything else. */
export const validateDateSearch = (search: Record<string, unknown>): { date?: string } =>
  isDayParam(search.date) ? { date: search.date } : {};

/**
 * True when the URL carries a `date` the route can't use. `validateSearch` alone
 * would silently ignore it and leave the junk sitting in the address bar; routes
 * pair this with a redirect to their bare path so a bad link lands somewhere
 * honest (see /today, /calendar).
 */
export const hasInvalidDateParam = (searchStr: string): boolean => {
  const raw = new URLSearchParams(searchStr).get('date');
  return raw !== null && !isDayParam(raw);
};

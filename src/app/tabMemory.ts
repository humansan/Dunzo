// Per-tab "where I was" memory for the sidebar.
//
// Clicking Planner after a detour through Today should land back on the
// collection that was open, not on /planner. What gets remembered is deliberately
// NOT the last URL: these routes carry transient state in the same location -
// planner's `editCollection` (a modal) and _authed's `task` / `settings` (the
// overlays) - and replaying an href would reopen dialogs the user had closed.
// Instead each tab remembers one typed selector, so nothing else can ride along.
//
// The store is a pure projection of the location, written from a single effect in
// AppShell (see recordLocation). Views and routes know nothing about it.

export type TabId = 'today' | 'planner' | 'calendar' | 'trackers' | 'stats';

// The restorable state of each tab, and nothing else: the planner's selected
// collection, and the day the date-driven tabs were looking at. Today and
// Calendar keep separate dates on purpose - they're independent surfaces.
type TabMemory = {
  planner?: { collectionId?: string };
  today?: { date?: string };
  calendar?: { date?: string };
};

// sessionStorage, not the synced settings: this is per-browser-tab scratch state.
// It survives a reload but a new tab starts clean, so a stale date can't follow
// the user to another device or into next week.
const KEY = 'dunzo.tabMemory';

let memory: TabMemory | null = null;

const read = (): TabMemory => {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as TabMemory) : {};
  } catch {
    memory = {};
  }
  return memory;
};

const write = (next: TabMemory) => {
  memory = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private-mode / quota - the in-memory copy still works for this session.
  }
};

/**
 * Project the current location onto the tab it belongs to. Called on every
 * navigation; anything not named here is forgotten by construction.
 */
export const recordLocation = (pathname: string, search: Record<string, unknown>) => {
  const date = typeof search.date === 'string' ? search.date : undefined;

  if (pathname.startsWith('/planner')) {
    // '/planner' → the all-tasks view; '/planner/<id>' → that collection.
    const collectionId = pathname.split('/')[2] || undefined;
    write({ ...read(), planner: { collectionId } });
  } else if (pathname.startsWith('/today')) {
    write({ ...read(), today: { date } });
  } else if (pathname.startsWith('/calendar')) {
    write({ ...read(), calendar: { date } });
  }
};

/** What a sidebar tab should link to, given what's remembered for it. */
export type TabTarget =
  | { to: '/planner/$collectionId'; params: { collectionId: string } }
  | { to: `/${TabId}`; search?: { date: string } };

/**
 * @param isCollection guards a remembered id that has since been deleted, so the
 * link can never point at a collection that no longer exists.
 */
export const tabTarget = (tab: TabId, isCollection: (id: string) => boolean): TabTarget => {
  const mem = read();
  if (tab === 'planner') {
    const id = mem.planner?.collectionId;
    return id && isCollection(id)
      ? { to: '/planner/$collectionId', params: { collectionId: id } }
      : { to: '/planner' };
  }
  if (tab === 'today' || tab === 'calendar') {
    const date = mem[tab]?.date;
    return date ? { to: `/${tab}`, search: { date } } : { to: `/${tab}` };
  }
  return { to: `/${tab}` };
};

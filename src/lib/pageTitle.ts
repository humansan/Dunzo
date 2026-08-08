// The tab title, one page at a time.
//
// Each route declares its own page name through `head` (the router's head
// option), and <HeadContent /> in __root renders whatever the deepest matched
// route asked for - so the title follows navigation for free, with no effect
// watching the location. The format lives here rather than in ten route files so
// renaming the app, or changing the separator, is one edit.
//
// This is the APP's title only. The marketing site keeps its own copy in
// website2/src/seo.ts: the two are separate builds with separate concerns (that
// one is written for search results, these are written for a row of tabs), and
// a shared module between them would couple a deploy of one to the other.
export const APP_NAME = 'Dunzo';

/** "Task Planner - Dunzo", or bare "Dunzo" for a page with no name of its own. */
export const pageTitle = (page?: string): string =>
  page ? `${page} - ${APP_NAME}` : APP_NAME;

/**
 * A route's `head`, as the one thing these routes set:
 *
 *   head: () => pageHead('Task Planner'),
 *
 * Titles are the page a user thinks they're on, not the route path - so both
 * planner routes (bare and per-collection) say "Task Planner", since selecting a
 * collection doesn't take you anywhere new.
 */
export const pageHead = (page?: string) => ({ meta: [{ title: pageTitle(page) }] });

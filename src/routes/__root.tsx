import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createRootRouteWithContext, Outlet, useRouterState, type ErrorComponentProps } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { pageHead } from '@/lib/pageTitle';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // The bare app name, as the floor every page's own title overrides. It shows on
  // its own only where no page is really being rendered - the '/' and catch-all
  // routes, which exist to redirect - so those never flash a stale title from
  // wherever the user came from.
  head: () => pageHead(),
  component: RootComponent,
  errorComponent: RootErrorComponent,
});

// Apply the matched route's page title (its `head` → `meta` → title, see
// lib/pageTitle) to the tab. The deepest match wins, so a child route's name
// overrides the root's bare app name - the same precedence the router's own
// <HeadContent> uses, and the reason each page declares only its own title.
//
// Assigning `document.title` rather than rendering <HeadContent/> is deliberate.
// That component renders a plain <title> element and leans on React 19 hoisting
// to move it into <head> - where it would land AFTER the static
// <title>Dunzo</title> in index.html, and a document with two titles shows the
// first one. Removing the static title would fix that but costs the pre-hydration
// title (a tab labelled with the URL until React mounts). Writing the property
// keeps both: index.html titles the first paint, this titles every route after.
function useDocumentTitle() {
  const title = useRouterState({
    select: (state) => {
      for (let i = state.matches.length - 1; i >= 0; i--) {
        const found = state.matches[i]!.meta?.find((m) => m && 'title' in m && m.title);
        if (found?.title) return found.title;
      }
      return undefined;
    },
  });

  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}

function RootComponent() {
  useDocumentTitle();
  return (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  );
}

// App-level last-resort boundary: catches anything not handled by a closer
// errorComponent (the per-view fallbacks / the _authed data screen). Replaces the
// old "one throw blanks the whole app" behavior - there were no error boundaries.
function RootErrorComponent({ error }: ErrorComponentProps) {
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-canvas text-fg-subtle text-sm text-center px-6">
      <p className="text-fg-muted font-semibold">Something went wrong.</p>
      {error?.message && (
        <p className="text-fg-faint max-w-md break-words">{error.message}</p>
      )}
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 rounded-xl bg-fill-subtle hover:bg-fill text-fg font-semibold"
      >
        Reload
      </button>
    </div>
  );
}

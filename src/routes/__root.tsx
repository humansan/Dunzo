import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, type ErrorComponentProps } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  errorComponent: RootErrorComponent,
});

function RootComponent() {
  return (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  );
}

// App-level last-resort boundary: catches anything not handled by a closer
// errorComponent (the per-view fallbacks / the _authed data screen). Replaces the
// old "one throw blanks the whole app" behavior — there were no error boundaries.
function RootErrorComponent({ error }: ErrorComponentProps) {
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-neutral-950 text-white/60 text-sm text-center px-6">
      <p className="text-white/80 font-semibold">Something went wrong.</p>
      {error?.message && (
        <p className="text-white/40 max-w-md break-words">{error.message}</p>
      )}
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold"
      >
        Reload
      </button>
    </div>
  );
}

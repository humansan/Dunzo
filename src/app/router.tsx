import { createRouter } from '@tanstack/react-router';
import { queryClient } from '@/lib/query/queryClient';
import { basePath } from '@/lib/basePath';
import { routeTree } from '@/routeTree.gen';

export const router = createRouter({
  routeTree,
  // Served under /app (derived from Vite's base). Router-driven navigation
  // (navigate/Link/redirect) prepends this automatically; raw history.push does
  // not - see @/lib/basePath.
  basepath: basePath || '/',
  context: { queryClient },
  defaultPreload: 'intent',
  // The _authed/login beforeLoad guards await authClient.getSession(); a small
  // pending threshold means a fast (client-cached) resolve never flashes a
  // pending component during navigation.
  defaultPendingMs: 200,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
  // Per-history-entry state. `taskDepth` is how many task full-view opens are
  // stacked on the entry (1 for the first open, 2 for a subtask opened from it,
  // ...), so closing the overlay can rewind the whole chain in one go instead of
  // popping a single entry. See useOverlayNav.openTask / AppShell.closeOverlay.
  //
  // `fromTaskId` names the task this open came FROM - set only when a full view
  // was already open, so its presence is exactly "this task was opened from
  // another task's full view". That's what the Back button and the delete exit in
  // TodoFullView key off: they step back ONE entry (to the parent) instead of
  // rewinding the whole chain the way close does.
  interface HistoryState {
    taskDepth?: number;
    fromTaskId?: string;
  }
}

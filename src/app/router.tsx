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
}

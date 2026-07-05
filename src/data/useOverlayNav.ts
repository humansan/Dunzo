import { useRouter } from '@tanstack/react-router';

// Opens the settings / task-full-view overlays as *search-param state on the
// current page* (masked to their pretty /settings and /task/$id URLs) instead of
// navigating to a sibling route. Because the page route under AppShell's <Outlet/>
// never changes, the page stays mounted behind the overlay — no unmount/remount
// flash when the overlay closes. The real /settings and /task/$taskId routes still
// exist to resolve a cold deep-link (a masked URL reloaded from the address bar).
export function useOverlayNav() {
  const router = useRouter();

  const openTask = (id: string) =>
    router.navigate({
      to: '.',
      search: (prev) => ({ ...prev, task: id }),
      mask: { to: '/task/$taskId', params: { taskId: id } },
    });

  const openSettings = () =>
    router.navigate({
      to: '.',
      search: (prev) => ({ ...prev, settings: true }),
      mask: { to: '/settings' },
    });

  return { openTask, openSettings };
}

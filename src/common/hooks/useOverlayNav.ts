import { useRouter } from '@tanstack/react-router';

// Opens the settings / task-full-view overlays as *search-param state on the
// current page* (masked to their pretty /settings and /task/$id URLs) instead of
// navigating to a sibling route. Because the page route under AppShell's <Outlet/>
// never changes, the page stays mounted behind the overlay - no unmount/remount
// flash when the overlay closes. The real /settings and /task/$taskId routes still
// exist to resolve a cold deep-link (a masked URL reloaded from the address bar).
export function useOverlayNav() {
  const router = useRouter();

  // Each open pushes an entry, so the browser back button walks back through the
  // task chain (task -> subtask -> ...). The close actions must *not* do that, so
  // the pushed entry records how deep the chain is; AppShell.closeOverlay rewinds
  // by exactly that many entries. Depth is derived from whether an overlay is
  // currently open rather than by blindly incrementing the previous value, so it
  // resets to 1 for a fresh open.
  const openTask = (id: string) => {
    const { search, state, pathname } = router.state.location;
    const taskDepth = (search.task ? (state.taskDepth ?? 1) : 0) + 1;
    // The task this open comes from, if any - recorded so the opened view can
    // offer a one-entry step back to it (see HistoryState.fromTaskId). A full view
    // is normally the `task` search param, but on a cold deep-link it's the
    // standalone /task/$taskId route instead, where the id is in the path; back
    // from there returns to that route, so it counts as an opener just the same.
    // (`taskDepth` deliberately still resets to 1 there - that route's close
    // pushes /today rather than rewinding.)
    const fromTaskId = search.task ?? pathname.match(/^\/task\/(.+)$/)?.[1];
    return router.navigate({
      to: '.',
      search: (prev) => ({ ...prev, task: id }),
      state: (prev) => ({ ...prev, taskDepth, fromTaskId }),
      mask: { to: '/task/$taskId', params: { taskId: id } },
    });
  };

  const openSettings = () =>
    router.navigate({
      to: '.',
      search: (prev) => ({ ...prev, settings: true }),
      mask: { to: '/settings' },
    });

  return { openTask, openSettings };
}

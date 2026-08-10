import { createFileRoute, redirect } from '@tanstack/react-router';

// Landing route ('/'): the URL is the source of truth for the view now, so '/'
// just redirects to the default view. (Later: last-visited via settings.)
export const Route = createFileRoute('/_authed/')({
  beforeLoad: () => {
    throw redirect({ to: '/planner' });
  },
});

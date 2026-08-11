import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { AuthModal } from '@/features/auth';
import { fetchSession } from '@/lib/auth';
import { withBase } from '@/lib/basePath';
import { pageHead } from '@/lib/pageTitle';

// Public route (sibling of _authed, not guarded): the sign-in / sign-up /
// password-reset screen. Rendering AuthModal as its own durable route is what
// fixes the focus-flash + form-wipe bug - nothing here subscribes to
// useSession(), and the auth decision is made in beforeLoad (on navigation),
// not in a render gate that reacts to window-focus revalidation.
export const Route = createFileRoute('/login')({
  head: () => pageHead('Sign in'),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: async () => {
    // Already signed in? Don't show the login screen. Same resilience as the
    // _authed guard, and the same reasoning inverted: an auth service that didn't
    // answer must not bounce a signed-in user to /today, but it must not blank
    // the login screen either - so an unavailable check just shows the form,
    // which is the one thing that is useful either way.
    const { data } = await fetchSession();
    if (data) throw redirect({ to: '/today' });
  },
  component: LoginRoute,
});

function LoginRoute() {
  const router = useRouter();
  const { redirect: redirectTo } = Route.useSearch();
  // On success, return the user to wherever the guard bounced them from (a
  // relative href captured in the `redirect` search param), else the default
  // view. history.push handles an arbitrary internal href (path + search).
  return (
    <AuthModal
      isOpen
      onAuthenticated={() => router.history.push(withBase(redirectTo ?? '/today'))}
    />
  );
}

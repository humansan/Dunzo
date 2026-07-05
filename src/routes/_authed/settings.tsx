import { createFileRoute, useRouter } from '@tanstack/react-router';
import { AccountModal } from '../../components/AccountModal';
import { ViewErrorFallback } from '../../components/ViewErrorFallback';
import { useAppData } from '../../data/AppDataContext';

// Account settings as its own route (was an AppShell overlay). Back-button /
// deep-link closable — same pattern as /task/$taskId. The modal's profile/settings/
// data sub-tabs stay internal state (no ?tab= param).
export const Route = createFileRoute('/_authed/settings')({
  component: SettingsRoute,
  errorComponent: ViewErrorFallback,
});

function SettingsRoute() {
  const d = useAppData();
  const router = useRouter();
  const close = () => {
    if (window.history.length > 1) router.history.back();
    else router.history.push('/today');
  };
  return (
    <AccountModal
      isOpen
      onClose={close}
      email={d.authSession.data?.user?.email}
      name={d.authSession.data?.user?.name}
      onLogout={d.logout}
      weekStartsOn={d.weekStartsOn}
      onUpdateWeekStartsOn={d.setWeekStartsOn}
      countdownMode={d.countdownMode}
      onUpdateCountdownMode={d.setCountdownMode}
      xpEnabled={d.xpEnabled}
      onUpdateXpEnabled={d.setXpEnabled}
      theme={d.theme}
      onUpdateTheme={d.setTheme}
    />
  );
}

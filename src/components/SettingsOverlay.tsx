import React from 'react';
import { AccountModal } from './AccountModal';
import { useAppData } from '../data/AppDataContext';

// Settings modal wired to app data. Rendered both by AppShell (when the `settings`
// search param is set — the in-app masked open) and by the /settings route (a cold
// deep-link). Keeping the wiring here means one source of truth for both entries.
export const SettingsOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const d = useAppData();
  return (
    <AccountModal
      isOpen
      onClose={onClose}
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
};

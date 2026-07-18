import React from 'react';
import { AccountModal } from '@/features/settings/AccountModal';
import { useAppData } from '@/lib/app-data';

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
      showXpChips={d.showXpChips}
      onUpdateShowXpChips={d.setShowXpChips}
      defaultDailyXp={d.defaultDailyXp}
      onUpdateDefaultDailyXp={d.setDefaultDailyXp}
      plannerTasksInDailyList={d.plannerTasksInDailyList}
      onUpdatePlannerTasksInDailyList={d.setPlannerTasksInDailyList}
      dailyTasksInPlanner={d.dailyTasksInPlanner}
      onUpdateDailyTasksInPlanner={d.setDailyTasksInPlanner}
      defaultAutoMoveDate={d.defaultAutoMoveDate}
      onUpdateDefaultAutoMoveDate={d.setDefaultAutoMoveDate}
      mode={d.mode}
      onUpdateMode={d.setMode}
    />
  );
};

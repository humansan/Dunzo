import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { X, User, SlidersHorizontal, Database, Upload, Download, LogOut } from 'lucide-react';
import { type ThemeMode } from '@/theme/applyTheme';
import { authClient } from '@/lib/auth';
import { buildBackup, parseBackup, mergeImportToDb } from '@/features/settings/backup';
import backgroundUrl from '@/assets/background.jpg';
import logoSvg from '@/assets/icon.svg';
import { ListSelect, textInputCls } from '@/common/ui';
import { Switch } from '@/common/ui';
import { modalPop, overlayBackdrop } from '@/common/ui/modalMotion';
import { validatePassword, PASSWORD_HINT } from '@/common/lib/password';
import { btnGhost, btnNeutral } from '@/theme/buttons';

type CountdownMode = 'off' | 'time' | 'percent';
type Section = 'profile' | 'settings' | 'data';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  email?: string;
  name?: string;
  onLogout: () => void;
  weekStartsOn: number;
  onUpdateWeekStartsOn: (val: number) => void;
  countdownMode: CountdownMode;
  onUpdateCountdownMode: (val: CountdownMode) => void;
  xpEnabled: boolean;
  onUpdateXpEnabled: (val: boolean) => void;
  showXpChips: boolean;
  onUpdateShowXpChips: (val: boolean) => void;
  defaultDailyXp: number;
  onUpdateDefaultDailyXp: (val: number) => void;
  plannerTasksInDailyList: boolean;
  onUpdatePlannerTasksInDailyList: (val: boolean) => void;
  dailyTasksInPlanner: boolean;
  onUpdateDailyTasksInPlanner: (val: boolean) => void;
  defaultAutoMoveDate: boolean;
  onUpdateDefaultAutoMoveDate: (val: boolean) => void;
  mode: ThemeMode;
  onUpdateMode: (mode: ThemeMode) => void;
}

// ── Shared controls (mirror the Task Planner's Sections menu styling) ─────────

const Segment = <T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <div className="flex gap-0.5 rounded-lg bg-fill-subtle p-0.5">
    {options.map((o) => (
      <button
        key={String(o.value)}
        type="button"
        onClick={() => onChange(o.value)}
        className={`flex-1 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
          value === o.value ? 'bg-fill-strong text-fg' : 'text-fg-faint hover:text-fg-muted'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// ── Shared layout atoms ───────────────────────────────────────────────────────

const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-[10px] font-bold uppercase tracking-wider text-fg-ghost mb-3">{children}</h3>
);

const labelCls = 'text-[13px] text-fg-muted';
const rowCls = 'flex items-center justify-between gap-4';

const fieldInput = `${textInputCls} w-full`;
const fieldLabel = 'block text-[11px] font-medium text-fg-subtle mb-1';
const formButton =
  'w-full rounded-xl bg-fill py-2.5 text-sm font-semibold text-fg transition-all hover:bg-fill-strong disabled:cursor-not-allowed disabled:opacity-40';

type FormMsg = { kind: 'ok' | 'err'; text: string } | null;

const StatusLine: React.FC<{ msg: FormMsg }> = ({ msg }) =>
  msg ? (
    <p className={`text-[11px] mt-1 ${msg.kind === 'ok' ? 'text-green-400/80' : 'text-red-400/80'}`}>
      {msg.text}
    </p>
  ) : null;

// ── Sections ──────────────────────────────────────────────────────────────────

const ProfilePane: React.FC<{
  email?: string;
  name?: string;
  onLogout: () => void;
}> = ({ email, name, onLogout }) => {
  const [newEmail, setNewEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState<FormMsg>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<FormMsg>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMsg(null);
    setEmailBusy(true);
    try {
      const { error } = await authClient.changeEmail({ newEmail });
      if (error) throw new Error(error.message || 'Could not update email');
      // better-auth sends a confirmation link when the current email is verified.
      setEmailMsg({ kind: 'ok', text: 'Check your inbox to confirm the new email.' });
      setNewEmail('');
    } catch (err) {
      setEmailMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setEmailBusy(false);
    }
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    const pwError = validatePassword(newPassword);
    if (pwError) {
      setPwMsg({ kind: 'err', text: pwError });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ kind: 'err', text: 'New passwords do not match.' });
      return;
    }
    setPwBusy(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) throw new Error(error.message || 'Could not update password');
      setPwMsg({ kind: 'ok', text: 'Password updated.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="space-y-7">
      {/* Identity */}
      <div>
        <SectionHeader>Profile</SectionHeader>
        <div className="rounded-2xl border border-line bg-fill-subtle px-4 py-3.5">
          {name && <p className="text-sm font-semibold text-fg">{name}</p>}
          <p className="text-[13px] text-fg-subtle">{email ?? 'Signed in'}</p>
        </div>
      </div>

      {/* Change email */}
      <div>
        <SectionHeader>Email</SectionHeader>
        <form onSubmit={handleEmail} className="space-y-2">
          <div>
            <label className={fieldLabel}>New email</label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={fieldInput}
              placeholder={email ?? 'you@example.com'}
            />
          </div>
          <button type="submit" disabled={emailBusy || !newEmail || newEmail === email} className={formButton}>
            {emailBusy ? 'Updating…' : 'Update Email'}
          </button>
          <StatusLine msg={emailMsg} />
        </form>
      </div>

      {/* Change password */}
      <div>
        <SectionHeader>Password</SectionHeader>
        <form onSubmit={handlePassword} className="space-y-2">
          <div>
            <label className={fieldLabel}>Current password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={fieldInput}
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className={fieldLabel}>New password</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={fieldInput}
              placeholder="••••••••"
            />
            <p className="text-[11px] text-fg-faint mt-1">{PASSWORD_HINT}</p>
          </div>
          <div>
            <label className={fieldLabel}>Confirm new password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={fieldInput}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={pwBusy || !currentPassword || !newPassword || !confirmPassword}
            className={formButton}
          >
            {pwBusy ? 'Updating…' : 'Update Password'}
          </button>
          <StatusLine msg={pwMsg} />
        </form>
      </div>

      {/* Session */}
      <div>
        <SectionHeader>Session</SectionHeader>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 font-semibold py-2.5 rounded-xl text-sm transition-all"
        >
          <LogOut size={15} />
          Log Out
        </button>
      </div>
    </div>
  );
};

const SettingsPane: React.FC<{
  weekStartsOn: number;
  onUpdateWeekStartsOn: (val: number) => void;
  countdownMode: CountdownMode;
  onUpdateCountdownMode: (val: CountdownMode) => void;
  xpEnabled: boolean;
  onUpdateXpEnabled: (val: boolean) => void;
  showXpChips: boolean;
  onUpdateShowXpChips: (val: boolean) => void;
  defaultDailyXp: number;
  onUpdateDefaultDailyXp: (val: number) => void;
  plannerTasksInDailyList: boolean;
  onUpdatePlannerTasksInDailyList: (val: boolean) => void;
  dailyTasksInPlanner: boolean;
  onUpdateDailyTasksInPlanner: (val: boolean) => void;
  defaultAutoMoveDate: boolean;
  onUpdateDefaultAutoMoveDate: (val: boolean) => void;
  mode: ThemeMode;
  onUpdateMode: (mode: ThemeMode) => void;
}> = ({
  weekStartsOn,
  onUpdateWeekStartsOn,
  countdownMode,
  onUpdateCountdownMode,
  xpEnabled,
  onUpdateXpEnabled,
  showXpChips,
  onUpdateShowXpChips,
  defaultDailyXp,
  onUpdateDefaultDailyXp,
  plannerTasksInDailyList,
  onUpdatePlannerTasksInDailyList,
  dailyTasksInPlanner,
  onUpdateDailyTasksInPlanner,
  defaultAutoMoveDate,
  onUpdateDefaultAutoMoveDate,
  mode,
  onUpdateMode,
}) => {
  return (
    <div className="space-y-7">
      {/* Tasks */}
      <div className="space-y-4">
        <SectionHeader>Tasks</SectionHeader>

        <div className="space-y-1.5">
          <span className={labelCls}>First day of week</span>
          <Segment
            options={[
              { value: 0, label: 'Sunday' },
              { value: 1, label: 'Monday' },
            ]}
            value={weekStartsOn}
            onChange={onUpdateWeekStartsOn}
          />
        </div>

        <div className="space-y-1.5">
          <span className={labelCls}>Deadline countdown</span>
          <ListSelect
            ariaLabel="Deadline countdown"
            className="w-full"
            value={countdownMode}
            onChange={(v) => onUpdateCountdownMode(v as CountdownMode)}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'time', label: 'Time Left' },
              { value: 'percent', label: 'Percent Left' },
            ]}
          />
        </div>

        <div className={rowCls}>
          <div>
            <p className={labelCls}>Show XP bar and streaks</p>
            <p className="text-[11px] text-fg-ghost mt-0.5">Show the XP progress bar and streak stars</p>
          </div>
          <Switch checked={xpEnabled} onChange={onUpdateXpEnabled} />
        </div>

        <div className={rowCls}>
          <div>
            <p className={labelCls}>Show XP chips</p>
            <p className="text-[11px] text-fg-ghost mt-0.5">Show per-task XP on the daily list, quick edit and full view</p>
          </div>
          <Switch checked={showXpChips} onChange={onUpdateShowXpChips} />
        </div>

        <div className="space-y-1.5">
          <span className={labelCls}>Default XP on new daily tasks</span>
          <Segment
            options={[
              { value: 0, label: 'None' },
              { value: 1, label: '1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
              { value: 4, label: '4' },
              { value: 5, label: '5' },
              { value: 6, label: '6' },
              { value: 7, label: '7' },
              { value: 8, label: '8' },
              { value: 9, label: '9' },
              { value: 10, label: '10' },
            ]}
            value={defaultDailyXp}
            onChange={onUpdateDefaultDailyXp}
          />
        </div>
      </div>

      {/* Default visibility for new tasks - the cross-surface default per source */}
      <div className="space-y-4 border-t border-line-subtle pt-6">
        <SectionHeader>Default Visibility for New Tasks</SectionHeader>

        <div className={rowCls}>
          <div>
            <p className={labelCls}>Tasks created in Task Planner</p>
            <p className="text-[11px] text-fg-ghost mt-0.5">Also show new planner tasks on the daily list</p>
          </div>
          <Switch checked={plannerTasksInDailyList} onChange={onUpdatePlannerTasksInDailyList} />
        </div>

        <div className={rowCls}>
          <div>
            <p className={labelCls}>Tasks created in Daily List</p>
            <p className="text-[11px] text-fg-ghost mt-0.5">Also show new daily tasks in the Task Planner</p>
          </div>
          <Switch checked={dailyTasksInPlanner} onChange={onUpdateDailyTasksInPlanner} />
        </div>

        <div className={rowCls}>
          <div>
            <p className={labelCls}>Auto-move overdue daily tasks</p>
            <p className="text-[11px] text-fg-ghost mt-0.5">New daily tasks roll forward to the next day until completed</p>
          </div>
          <Switch checked={defaultAutoMoveDate} onChange={onUpdateDefaultAutoMoveDate} />
        </div>
      </div>

      {/* Appearance */}
      <div className="space-y-4 border-t border-line-subtle pt-6">
        <SectionHeader>Appearance</SectionHeader>

        <div className="space-y-1.5">
          <span className={labelCls}>Mode</span>
          <Segment
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
            value={mode}
            onChange={onUpdateMode}
          />
        </div>
      </div>
    </div>
  );
};

const DataPane: React.FC = () => {
  const importRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<null | 'export' | 'import'>(null);
  const [dataMsg, setDataMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Export the account's current DB state (todos/trackers/workspaces/settings).
  const handleExport = async () => {
    setDataMsg(null);
    setBusy('export');
    try {
      const backup = await buildBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dunzo-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[export] failed', err);
      setDataMsg({ kind: 'err', text: 'Export failed. Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  // Import = merge into the DB by id (add new, overwrite conflicts, leave the rest).
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    setDataMsg(null);
    setBusy('import');
    try {
      const backup = parseBackup(await file.text());
      await mergeImportToDb(backup);
      await qc.invalidateQueries(); // refetch everything from the DB
      setDataMsg({ kind: 'ok', text: 'Import complete - your data has been merged.' });
    } catch (err) {
      console.error('[import] failed', err);
      setDataMsg({ kind: 'err', text: 'Import failed - check that the file is a valid backup.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader>Backup &amp; Restore</SectionHeader>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={busy !== null}
          className={"flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold disabled:cursor-not-allowed " + btnNeutral}
        >
          <Download size={15} />
          {busy === 'export' ? 'Exporting…' : 'Export'}
        </button>
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          disabled={busy !== null}
          className={"flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold disabled:cursor-not-allowed " + btnNeutral}
        >
          <Upload size={15} />
          {busy === 'import' ? 'Importing…' : 'Import'}
        </button>
        <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      </div>
      {dataMsg && (
        <p className={`text-[11px] ${dataMsg.kind === 'ok' ? 'text-green-400/80' : 'text-red-400/80'}`}>
          {dataMsg.text}
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-fg-ghost">
        Export downloads your tasks, trackers, workspaces, and settings. Import merges them back in by
        id - new items are added, matching items are overwritten, and anything not in the file is left
        untouched.
      </p>
    </div>
  );
};

// ── Modal shell ───────────────────────────────────────────────────────────────

const NAV: { key: Section; label: string; icon: React.ElementType }[] = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'settings', label: 'Settings', icon: SlidersHorizontal },
  { key: 'data', label: 'Data', icon: Database },
];

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  email,
  name,
  onLogout,
  weekStartsOn,
  onUpdateWeekStartsOn,
  countdownMode,
  onUpdateCountdownMode,
  xpEnabled,
  onUpdateXpEnabled,
  showXpChips,
  onUpdateShowXpChips,
  defaultDailyXp,
  onUpdateDefaultDailyXp,
  plannerTasksInDailyList,
  onUpdatePlannerTasksInDailyList,
  dailyTasksInPlanner,
  onUpdateDailyTasksInPlanner,
  defaultAutoMoveDate,
  onUpdateDefaultAutoMoveDate,
  mode,
  onUpdateMode,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<Section>('profile');

  // Reset to Profile only when the modal transitions open - keyed on `isOpen`
  // alone so a parent re-render (e.g. updating a setting) doesn't snap it back.
  useEffect(() => {
    if (isOpen) setSection('profile');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
          className={`fixed inset-0 z-[70] flex items-center justify-center p-4 ${overlayBackdrop}`}
        >
          <motion.div
            {...modalPop}
            className="relative flex h-[560px] max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
          >
            {/* Nav rail - vibrant sign-in background image with dark text on top. */}
            <div className="relative hidden sm:flex w-52 shrink-0 flex-col overflow-hidden border-r border-line-subtle">
              <img
                src={backgroundUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover blur-sm scale-115 brightness-110"
              />

              {/* Nav */}
              <nav className="relative space-y-1 p-3">
                {NAV.map(({ key, label, icon: Icon }) => {
                  const active = section === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSection(key)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all cursor-pointer ${
                        active
                          ? 'bg-black/10 text-black font-bold'
                          : 'text-black/90 hover:bg-black/10 hover:text-black font-semibold'
                      }`}
                    >
                      <Icon size={15} className={active ? 'text-black' : 'text-black/90'} />
                      {label}
                    </button>
                  );
                })}
              </nav>

              {/* Brand - pinned to the bottom over the brightest part of the image */}
              <div className="relative mt-auto flex flex-col items-start gap-1.5 p-6">
                <img src={logoSvg} alt="Dunzo" className="h-14 w-14 drop-shadow-sm" />
                <span className="text-2xl font-bold tracking-tight text-[#0a0a0a]">Dunzo</span>
              </div>
            </div>

            {/* Right pane: fixed header row (close) + scrollable content below. */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 justify-end px-2 py-2">
                <button
                  onClick={onClose}
                  className={`rounded-lg p-1.5 transition-all ${btnGhost()}`}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-7 pb-7">
                {/* Mobile section switcher */}
              <div className="mb-5 flex gap-1 sm:hidden">
                {NAV.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSection(key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      section === key ? 'bg-fill text-fg' : 'text-fg-faint'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {section === 'profile' && <ProfilePane email={email} name={name} onLogout={onLogout} />}
              {section === 'settings' && (
                <SettingsPane
                  weekStartsOn={weekStartsOn}
                  onUpdateWeekStartsOn={onUpdateWeekStartsOn}
                  countdownMode={countdownMode}
                  onUpdateCountdownMode={onUpdateCountdownMode}
                  xpEnabled={xpEnabled}
                  onUpdateXpEnabled={onUpdateXpEnabled}
                  showXpChips={showXpChips}
                  onUpdateShowXpChips={onUpdateShowXpChips}
                  defaultDailyXp={defaultDailyXp}
                  onUpdateDefaultDailyXp={onUpdateDefaultDailyXp}
                  plannerTasksInDailyList={plannerTasksInDailyList}
                  onUpdatePlannerTasksInDailyList={onUpdatePlannerTasksInDailyList}
                  dailyTasksInPlanner={dailyTasksInPlanner}
                  onUpdateDailyTasksInPlanner={onUpdateDailyTasksInPlanner}
                  defaultAutoMoveDate={defaultAutoMoveDate}
                  onUpdateDefaultAutoMoveDate={onUpdateDefaultAutoMoveDate}
                  mode={mode}
                  onUpdateMode={onUpdateMode}
                />
              )}
              {section === 'data' && <DataPane />}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

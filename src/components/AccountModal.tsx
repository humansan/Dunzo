import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { X, User, SlidersHorizontal, Database, Upload, Download, LogOut, RotateCcw } from 'lucide-react';
import { Theme } from '../types';
import { authClient } from '../auth';
import { buildBackup, parseBackup, mergeImportToDb } from '../data/import';
import backgroundUrl from '../assets/background.jpg';
import logoSvg from '../assets/icon.svg';

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
  theme: Theme;
  onUpdateTheme: (theme: Theme) => void;
}

const DEFAULT_THEME: Theme = { accent1: '#e1e354', accent2: '#c6dabe' };

// ── Shared controls (mirror the Task Planner's Sections menu styling) ─────────

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={value}
    onClick={() => onChange(!value)}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
      value ? 'bg-(--accent2)' : 'bg-white/15'
    }`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
        value ? 'translate-x-[18px]' : 'translate-x-[3px]'
      }`}
    />
  </button>
);

const Segment = <T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <div className="flex gap-0.5 rounded-lg bg-white/[0.06] p-0.5">
    {options.map((o) => (
      <button
        key={String(o.value)}
        type="button"
        onClick={() => onChange(o.value)}
        className={`flex-1 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
          value === o.value ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// ── Shared layout atoms ───────────────────────────────────────────────────────

const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-3">{children}</h3>
);

const labelCls = 'text-[13px] text-white/65';
const rowCls = 'flex items-center justify-between gap-4';

const fieldInput =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 h-9 text-sm text-white placeholder-white/30 focus:border-[var(--accent1)] focus:outline-none transition-colors';
const fieldLabel = 'block text-[11px] font-medium text-white/45 mb-1';
const formButton =
  'w-full rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40';

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
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
          {name && <p className="text-sm font-semibold text-white">{name}</p>}
          <p className="text-[13px] text-white/50">{email ?? 'Signed in'}</p>
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
  theme: Theme;
  onUpdateTheme: (theme: Theme) => void;
}> = ({
  weekStartsOn,
  onUpdateWeekStartsOn,
  countdownMode,
  onUpdateCountdownMode,
  xpEnabled,
  onUpdateXpEnabled,
  theme,
  onUpdateTheme,
}) => {
  const colorRow = (key: 'accent1' | 'accent2', label: string) => (
    <div className="space-y-1.5">
      <span className={labelCls}>{label}</span>
      <div className="flex gap-2">
        <input
          type="color"
          value={theme[key]}
          onChange={(e) => onUpdateTheme({ ...theme, [key]: e.target.value })}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-white/10 bg-transparent"
        />
        <input
          type="text"
          value={theme[key]}
          onChange={(e) => onUpdateTheme({ ...theme, [key]: e.target.value })}
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-mono text-white focus:border-[var(--accent1)] focus:outline-none transition-colors"
        />
      </div>
    </div>
  );

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
          <Segment
            options={[
              { value: 'off' as CountdownMode, label: 'Off' },
              { value: 'time' as CountdownMode, label: 'Time Left' },
              { value: 'percent' as CountdownMode, label: 'Percent Left' },
            ]}
            value={countdownMode}
            onChange={onUpdateCountdownMode}
          />
        </div>

        <div className={rowCls}>
          <div>
            <p className={labelCls}>XP &amp; streaks</p>
            <p className="text-[11px] text-white/30 mt-0.5">Show XP, progress bar and streak stars</p>
          </div>
          <Toggle value={xpEnabled} onChange={onUpdateXpEnabled} />
        </div>
      </div>

      {/* Appearance */}
      <div className="space-y-4 border-t border-white/8 pt-6">
        <SectionHeader>Appearance</SectionHeader>
        {colorRow('accent1', 'Accent color 1')}
        {colorRow('accent2', 'Accent color 2')}
        <button
          type="button"
          onClick={() => onUpdateTheme(DEFAULT_THEME)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 py-2.5 text-xs font-bold text-white/50 transition-all hover:bg-white/10 hover:text-white"
        >
          <RotateCcw size={13} />
          Reset to Defaults
        </button>
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
      setDataMsg({ kind: 'ok', text: 'Import complete — your data has been merged.' });
    } catch (err) {
      console.error('[import] failed', err);
      setDataMsg({ kind: 'err', text: 'Import failed — check that the file is a valid backup.' });
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
          className="flex items-center justify-center gap-2 rounded-xl bg-white/5 py-2.5 text-sm font-bold text-white/50 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={15} />
          {busy === 'export' ? 'Exporting…' : 'Export'}
        </button>
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 rounded-xl bg-white/5 py-2.5 text-sm font-bold text-white/50 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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
      <p className="text-[11px] leading-relaxed text-white/25">
        Export downloads your tasks, trackers, workspaces, and settings. Import merges them back in by
        id — new items are added, matching items are overwritten, and anything not in the file is left
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
  theme,
  onUpdateTheme,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<Section>('profile');

  // Reset to Profile only when the modal transitions open — keyed on `isOpen`
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative flex h-[560px] max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#1A1A1A] shadow-2xl"
          >
            {/* Nav rail — vibrant sign-in background image with dark text on top. */}
            <div className="relative hidden sm:flex w-52 shrink-0 flex-col overflow-hidden border-r border-white/5">
              <img
                src={backgroundUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover blur-[3px] scale-110"
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
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all ${
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

              {/* Brand — pinned to the bottom over the brightest part of the image */}
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
                  className="rounded-lg p-1.5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
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
                      section === key ? 'bg-white/[0.08] text-white' : 'text-white/40'
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
                  theme={theme}
                  onUpdateTheme={onUpdateTheme}
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

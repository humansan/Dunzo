import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Clock, Upload, Download, LogOut } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  onAuthenticated: () => void;
  onLogout: () => void;
}

type AuthMode = 'login' | 'signup';

const inputClass =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[var(--accent1)] transition-colors';
const labelClass =
  'block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5';

// ─── Signed-out view ─────────────────────────────────────────────────────────

const SignedOutPane: React.FC<{
  onClose: () => void;
  onAuthenticated: () => void;
}> = ({ onClose, onAuthenticated }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO(neon-auth): replace with real Neon Auth call.
    //   login:  signInWithCredentials({ username, password })
    //   signup: signUp({ email, username, password })
    console.log('[auth stub]', mode, { email, username, password });
    onAuthenticated();
  };

  return (
    <div className="flex-1 flex flex-col max-h-[90vh]">
      {/* Header */}
      <div className="flex items-start justify-between px-8 pt-7 pb-4 shrink-0">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h3>
          <p className="text-xs text-white/40">
            {mode === 'login' ? 'Log in to sync your progress.' : 'Sign up to start tracking.'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto px-8 pb-7 space-y-4">
        {/* Toggle */}
        <div className="grid grid-cols-2 gap-2 bg-black/20 p-1 rounded-2xl border border-white/5">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`py-2 rounded-xl text-xs font-bold transition-all ${
                mode === m
                  ? 'bg-[var(--accent2)] text-black shadow-lg shadow-[var(--accent2)]/10'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              {m === 'login' ? 'Log In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
              />
            </div>
          )}
          <div>
            <label className={labelClass}>Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              placeholder="your_handle"
            />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[var(--accent1)] hover:opacity-90 text-black font-bold py-2.5 rounded-xl transition-all active:scale-[0.98]"
          >
            {mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Signed-in view ──────────────────────────────────────────────────────────

const SignedInPane: React.FC<{
  onClose: () => void;
  onLogout: () => void;
}> = ({ onClose, onLogout }) => {
  const [email, setEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const handleEmailSave = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO(neon-auth): update email via Neon Auth
    console.log('[auth stub] update email', { email });
  };

  const handlePasswordSave = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO(neon-auth): update password via Neon Auth
    console.log('[auth stub] update password', { oldPassword, newPassword, confirmPassword });
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleExport = () => {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('dun-')) data[key] = localStorage.getItem(key) ?? '';
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dunzo-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        Object.entries(data).forEach(([key, value]) => {
          if (key.startsWith('dun-')) localStorage.setItem(key, value as string);
        });
        window.location.reload();
      } catch {
        console.error('[import] Invalid backup file');
      }
    };
    reader.readAsText(file);
  };

  const sectionLabel = (text: string) => (
    <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-3">{text}</p>
  );

  return (
    <div className="flex-1 flex flex-col max-h-[90vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-7 pb-4 shrink-0">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">Your Account</h3>
          <p className="text-xs text-white/40">Manage your profile and data.</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto px-8 pb-7 space-y-6">

        {/* Change email */}
        <div>
          {sectionLabel('Email')}
          <form onSubmit={handleEmailSave} className="space-y-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="new@email.com"
            />
            <button
              type="submit"
              className="w-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white font-bold py-2.5 rounded-xl text-sm transition-all"
            >
              Update Email
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="border-t border-white/5 pt-5">
          {sectionLabel('Change Password')}
          <form onSubmit={handlePasswordSave} className="space-y-2">
            <div>
              <label className={labelClass}>Current Password</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className={labelClass}>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className={labelClass}>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white font-bold py-2.5 rounded-xl text-sm transition-all mt-1"
            >
              Update Password
            </button>
          </form>
        </div>

        {/* Import / Export */}
        <div className="border-t border-white/5 pt-5">
          {sectionLabel('Data')}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white font-bold py-2.5 rounded-xl text-sm transition-all"
            >
              <Download size={15} />
              Export
            </button>
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white font-bold py-2.5 rounded-xl text-sm transition-all"
            >
              <Upload size={15} />
              Import
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </div>
          <p className="text-[10px] text-white/25 mt-2">
            Import replaces all existing data and reloads the app.
          </p>
        </div>

        {/* Log out */}
        <div className="border-t border-white/5 pt-5">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 font-bold py-2.5 rounded-xl text-sm transition-all"
          >
            <LogOut size={15} />
            Log Out
          </button>
        </div>

      </div>
    </div>
  );
};

// ─── Modal shell ─────────────────────────────────────────────────────────────

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  isAuthenticated,
  onAuthenticated,
  onLogout,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-2xl bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex max-h-[90vh]"
          >
            {/* Splash pane */}
            <div
              className="hidden md:flex w-52 shrink-0 flex-col items-center justify-center p-8 text-black"
              style={{ background: 'linear-gradient(135deg, var(--accent1) 0%, var(--accent2) 100%)' }}
            >
              <div className="w-16 h-16 rounded-2xl bg-black/10 flex items-center justify-center mb-5">
                <Clock size={44} strokeWidth={2.5} />
              </div>
              <h2 className="text-2xl font-bold tracking-tight mb-1">Dunzo</h2>
              <p className="text-[10px] font-bold opacity-60 text-center">Where stuff gets done.</p>
            </div>

            {/* Dynamic right pane */}
            {isAuthenticated ? (
              <SignedInPane onClose={onClose} onLogout={onLogout} />
            ) : (
              <SignedOutPane onClose={onClose} onAuthenticated={onAuthenticated} />
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

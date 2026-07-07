import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Eye, EyeOff } from 'lucide-react';
import { authClient } from '../auth';
import { applyTheme } from '../theme/applyTheme';
import { DEFAULT_THEME_ID } from '../theme/themes';
import backgroundUrl from '../assets/background.jpg';
import logoUrl from '../assets/icon.svg';

interface AuthModalProps {
  isOpen: boolean;
  onAuthenticated: () => void;
}

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

function getResetToken(): string | null {
  return new URLSearchParams(window.location.search).get('token');
}

// A light draft (email + mode) persisted so a remount / hard refresh doesn't wipe
// typed input on the login screen. Passwords are deliberately never persisted.
const AUTH_DRAFT_KEY = 'dun-auth-draft';
function readAuthDraft(): { email?: string; mode?: AuthMode } {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_DRAFT_KEY) || '{}');
  } catch {
    return {};
  }
}

// ─── Signed-out view (full-screen login gate) ────────────────────────────────

const LoginScreen: React.FC<{
  onAuthenticated: () => void;
}> = ({ onAuthenticated }) => {
  // Pre-auth, AppDataProvider (and the user's saved theme) isn't mounted. Follow the
  // OS light/dark preference on the login screen so it isn't locked to one mode.
  useEffect(() => {
    applyTheme(DEFAULT_THEME_ID, 'system');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(DEFAULT_THEME_ID, 'system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resetToken = getResetToken();
  const [draft] = useState(readAuthDraft);
  // Restore only a benign mode (never a stale forgot/reset flow) unless the URL
  // carries a reset token.
  const [mode, setMode] = useState<AuthMode>(
    resetToken ? 'reset' : draft.mode === 'signup' ? 'signup' : 'login'
  );
  const [email, setEmail] = useState(draft.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // Keep the draft in sync (email + mode only; never passwords).
  useEffect(() => {
    sessionStorage.setItem(AUTH_DRAFT_KEY, JSON.stringify({ email, mode }));
  }, [email, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error } =
        mode === 'login'
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({
              email,
              password,
              // Neon Auth requires a name; derive it from the email local-part
              // since we no longer collect a username.
              name: email.split('@')[0],
            });
      if (error) throw new Error(error.message || 'Authentication failed');
      sessionStorage.removeItem(AUTH_DRAFT_KEY);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error } = await (authClient as any).requestPasswordReset({
        email,
        // Land the reset link on the public /login route so the ?token= isn't
        // swallowed by the _authed guard (which would nest it in ?redirect=).
        redirectTo: window.location.origin + '/login',
      });
      if (error) throw new Error(error.message || 'Could not send reset email');
      setForgotSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = getResetToken();
      const { error } = await (authClient as any).resetPassword({
        newPassword: password,
        token: token ?? undefined,
      });
      if (error) throw new Error(error.message || 'Could not reset password');
      // Clear the token from URL without a page reload
      window.history.replaceState({}, '', window.location.pathname);
      setResetDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (m: AuthMode) => {
    setMode(m);
    setError(null);
    setForgotSent(false);
    setResetDone(false);
  };

  // Login-specific field styling (kept local so the account modal is unaffected).
  const fieldClass =
    'w-full bg-fg/5 border border-fg/10 rounded-lg px-4 h-9 text-fg text-sm focus:outline-none focus:border-[var(--accent1)] transition-colors';
  const fieldLabel =
    'block text-sm font-medium text-fg/80';

  const renderForm = () => {
    // ── Forgot password ──────────────────────────────────────────────────────
    if (mode === 'forgot') {
      if (forgotSent) {
        return (
          <>
            <h2 className="text-2xl md:text-[28px] font-bold text-fg mb-3">Check your email</h2>
            <p className="text-sm text-fg/60 mb-6">
              We sent a password reset link to <span className="text-fg/90">{email}</span>.
              Check your inbox and follow the link to set a new password.
            </p>
            <p className="text-sm text-fg/80">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-bold text-[var(--accent2)] hover:text-[var(--accent1)] transition-colors cursor-pointer"
              >
                Back to log in
              </button>
            </p>
          </>
        );
      }
      return (
        <>
          <h2 className="text-2xl md:text-[28px] font-bold text-fg mb-2">Reset your password</h2>
          <p className="text-sm text-fg/60 mb-5">
            Enter your email and we'll send you a link to reset your password.
          </p>
          <form onSubmit={handleForgotSubmit} className="space-y-3.5">
            <div>
              <label className={`${fieldLabel} mb-1.5`}>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
                placeholder="you@example.com"
                autoFocus
              />
            </div>
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[var(--accent1)] hover:opacity-90 text-black font-bold h-9 rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
          <p className="text-sm text-fg/80 mt-5">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="font-bold text-[var(--accent2)] hover:text-[var(--accent1)] transition-colors cursor-pointer"
            >
              Back to log in
            </button>
          </p>
        </>
      );
    }

    // ── Reset password (from email link) ─────────────────────────────────────
    if (mode === 'reset') {
      if (resetDone) {
        return (
          <>
            <h2 className="text-2xl md:text-[28px] font-bold text-fg mb-3">Password updated</h2>
            <p className="text-sm text-fg/60 mb-6">
              Your password has been changed. You can now log in with your new password.
            </p>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full bg-[var(--accent1)] hover:opacity-90 text-black font-bold h-9 rounded-lg transition-all active:scale-[0.98] cursor-pointer"
            >
              Log In
            </button>
          </>
        );
      }
      return (
        <>
          <h2 className="text-2xl md:text-[28px] font-bold text-fg mb-6">Set new password</h2>
          <form onSubmit={handleResetSubmit} className="space-y-3.5">
            <div>
              <label className={`${fieldLabel} mb-1.5`}>New password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${fieldClass} pr-11`}
                  placeholder="••••••••"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg/30 hover:text-fg/70 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className={`${fieldLabel} mb-1.5`}>Confirm password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${fieldClass} pr-11`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg/30 hover:text-fg/70 transition-colors"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[var(--accent1)] hover:opacity-90 text-black font-bold h-9 rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? 'Saving…' : 'Set Password'}
            </button>
          </form>
        </>
      );
    }

    // ── Login / Signup ───────────────────────────────────────────────────────
    return (
      <>
        <h2 className="text-2xl md:text-[28px] font-bold text-fg mb-6">
          {mode === 'login' ? 'Log in to Dunzo' : 'Sign up for Dunzo'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className={`${fieldLabel} mb-1.5`}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`${fieldLabel}`}>Password</label>
              {mode === 'login' && (
                <button
                  type="button"
                  className="text-sm font-medium text-[var(--accent2)] hover:text-[var(--accent1)] transition-colors cursor-pointer"
                  onClick={() => switchMode('forgot')}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${fieldClass} pr-11`}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg/30 hover:text-fg/70 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[var(--accent1)] hover:opacity-90 text-black font-bold h-9 rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>
        <p className="text-sm text-fg/80 mt-5">
          {mode === 'login' ? 'New to Dunzo? ' : 'Already have an account? '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            className="font-bold text-[var(--accent2)] hover:text-[var(--accent1)] transition-colors cursor-pointer"
          >
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </button>
        </p>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden">
      {/* Full-bleed background */}
      <img
        src={backgroundUrl}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover blur-lg scale-120 saturate-110 brightness-110"
      />

      <div className="relative h-full w-full flex flex-col md:flex-row">
        {/* ── Brand panel ── */}
        <div className="flex-1 flex flex-col justify-center items-center px-8 pt-14 pb-6 md:py-0">
          <div className="max-w-sm">
            <img
              src={logoUrl}
              alt="Dunzo"
              className="h-16 w-16 md:h-24 md:w-24 mb-5 md:mb-7 drop-shadow-sm"
            />
            <h1 className="text-3xl tracking-tight md:text-5xl font-bold text-neutral-900 leading-[1.05]">
              Dunzo is where stuff gets done.
            </h1>
          </div>
        </div>

        {/* ── Form panel ── */}
        <div className="w-full md:w-[45%] flex items-center px-16">
          {/* Visual block: full-height, hugs the right edge with a 4px gap */}
          <motion.div
            // initial={{ opacity: 0, y: 16 }}
            // animate={{ opacity: 1, y: 0 }}
            // transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-full bg-surface rounded-3xl flex items-center justify-center p-7 md:w-130 md:h-140"
          >
            {/* Content block: constrained + centered inside the visual block */}
            <div className="w-full md:w-90 md:px-8 md:py-10">
              {renderForm()}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

// ─── Gate ─────────────────────────────────────────────────────────────────────
// Full-screen sign-in gate shown while signed out. Account management for
// signed-in users lives in AccountModal.

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onAuthenticated }) =>
  isOpen ? <LoginScreen onAuthenticated={onAuthenticated} /> : null;

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Eye, EyeOff } from 'lucide-react';
import { authClient } from '../auth';
import backgroundUrl from '../assets/background.jpg';
import logoUrl from '../assets/icon.svg';

interface AuthModalProps {
  isOpen: boolean;
  onAuthenticated: () => void;
}

type AuthMode = 'login' | 'signup';

// ─── Signed-out view (full-screen login gate) ────────────────────────────────

const LoginScreen: React.FC<{
  onAuthenticated: () => void;
}> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (m: AuthMode) => {
    setMode(m);
    setError(null);
  };

  // Login-specific field styling (kept local so the account modal is unaffected).
  const fieldClass =
    'w-full bg-white/5 border border-white/10 rounded-lg px-4 h-9 text-white text-sm focus:outline-none focus:border-[var(--accent1)] transition-colors';
  const fieldLabel =
    'block text-sm font-medium text-white/80';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Full-bleed background */}
      <img
        src={backgroundUrl}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover blur-lg scale-120"
      />

      <div className="relative h-full w-full flex flex-col md:flex-row">
        {/* ── Brand panel ── */}
        <div className="flex-1 flex flex-col justify-center items-center px-8 pt-14 pb-6 md:py-0">
          <div className="w-full max-w-sm">
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
        <div className="flex-1 flex items-start md:items-center justify-center px-6 pb-10 md:py-0">
          <motion.div
            // initial={{ opacity: 0, y: 16 }}
            // animate={{ opacity: 1, y: 0 }}
            // transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-full max-w-[400px] bg-[#000000]/85 backdrop-blur-xl border border-white/10 rounded-[28px] shadow-2xl shadow-black/40 p-7 md:p-8"
          >
            <h2 className="text-2xl md:text-[28px] font-bold text-white mb-6">
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
                      className="text-sm font-medium text-[var(--accent2)] hover:text-[var(--accent1)] transition-colors"
                      onClick={() => console.log('[auth stub] forgot password')}
                    >
                      Forgot?
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
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
                className="w-full bg-[var(--accent1)] hover:opacity-90 text-black font-bold h-9 rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? 'Please wait…'
                  : mode === 'login'
                  ? 'Log In'
                  : 'Create Account'}
              </button>
            </form>

            <p className="text-sm text-white/80 mt-5">
              {mode === 'login' ? 'New to Dunzo? ' : 'Already have an account? '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                className="font-bold text-[var(--accent2)] hover:text-[var(--accent1)] transition-colors"
              >
                {mode === 'login' ? 'Create an account' : 'Log in'}
              </button>
            </p>
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

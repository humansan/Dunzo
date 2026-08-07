import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { authClient } from '@/lib/auth';
import { withBase } from '@/lib/basePath';
import { Checkbox } from '@/common/ui/Checkbox';
import { OtpInput } from './OtpInput';
import { apiFetch } from '@/lib/query/apiClient';
import { validatePassword, PASSWORD_HINT } from '@/common/lib/password';
import { applyTheme } from '@/theme/applyTheme';
import { btnAccent } from '@/theme/buttons';
import { DEFAULT_THEME_ID } from '@/theme/themes';
import backgroundUrl from '@/assets/background.jpg';
import logoUrl from '@/assets/icon-invert2.png';
// import { Link } from "@tanstack/react-router";

interface AuthModalProps {
  isOpen: boolean;
  onAuthenticated: () => void;
}

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset' | 'verify';
type SignupStep = 'email' | 'details';
// Why we're showing the code screen - only the copy differs.
// `resume` = the account exists but was never verified, and the user came back
// through signup (or the "verify your email" link) rather than a full log in.
type VerifyReason = 'signup' | 'unverified-login' | 'resume';

function getResetToken(): string | null {
  return new URLSearchParams(window.location.search).get('token');
}

const RESEND_COOLDOWN_SECONDS = 60;

// Better Auth rejects sign-in for an unconfirmed address with a 403 whose code is
// EMAIL_NOT_VERIFIED; the message wording isn't guaranteed, so match the code first.
function isEmailNotVerified(error: { code?: string; message?: string }): boolean {
  if (error.code === 'EMAIL_NOT_VERIFIED') return true;
  return /email.*not.*verified/i.test(error.message ?? '');
}

// A light draft (email + mode + signup step + pending verification) persisted so a
// remount / hard refresh doesn't wipe typed input on the login screen. Passwords are
// deliberately never persisted.
const AUTH_DRAFT_KEY = 'dun-auth-draft';
interface AuthDraft {
  email?: string;
  mode?: AuthMode;
  signupStep?: SignupStep;
  verifyReason?: VerifyReason;
  // Epoch ms until which "Resend code" stays disabled; survives a refresh so the
  // cooldown can't be reset by reloading the page.
  resendUntil?: number;
}
function readAuthDraft(): AuthDraft {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_DRAFT_KEY) || '{}');
  } catch {
    return {};
  }
}

// ─── Small in-file controls (no shared primitives for these yet) ─────────────

const RememberCheckbox: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({
  checked,
  onChange,
}) => (
  <Checkbox checked={checked} onChange={onChange} gold={true}>
    <span className="text-sm text-fg-muted">Remember me</span>
  </Checkbox>
);

const OrDivider: React.FC = () => (
  <div className="flex items-center gap-3 my-4">
    <div className="h-px flex-1 bg-line" />
    <span className="text-xs text-fg-faint">OR</span>
    <div className="h-px flex-1 bg-line" />
  </div>
);

const GoogleButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full h-9 rounded-lg border border-line bg-surface hover:bg-fill-subtle transition-colors flex items-center justify-center gap-2.5 text-sm font-medium text-fg cursor-pointer"
  >
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
    Continue with Google
  </button>
);

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
  // carries a reset token. `verify` is restored when we know which email it was
  // for: verifying no longer needs the (unpersisted) password, so a refresh mid-
  // verification lands back on the code screen instead of dumping the user at login.
  const [mode, setMode] = useState<AuthMode>(
    resetToken
      ? 'reset'
      : draft.mode === 'signup'
        ? 'signup'
        : draft.mode === 'verify' && draft.email
          ? 'verify'
          : 'login'
  );
  const [signupStep, setSignupStep] = useState<SignupStep>(
    draft.mode === 'signup' && draft.signupStep === 'details' ? 'details' : 'email'
  );
  const [email, setEmail] = useState(draft.email ?? '');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-error status line (e.g. "Email verified") - styled as a neutral notice so
  // a success message never shows up in the red error treatment.
  const [notice, setNotice] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  // Login was rejected because the address was never verified - the error box then
  // offers a link into the code screen to finish signing up.
  const [unverifiedEmail, setUnverifiedEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [verifyReason, setVerifyReason] = useState<VerifyReason>(draft.verifyReason ?? 'signup');
  const [otp, setOtp] = useState('');
  const [otpInvalid, setOtpInvalid] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  // Cooldown is held as an absolute deadline (not a countdown) so it survives a
  // refresh; `nowTick` just re-renders the remaining seconds.
  const [resendUntil, setResendUntil] = useState(draft.resendUntil ?? 0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const resendCooldown = Math.max(0, Math.ceil((resendUntil - nowTick) / 1000));

  const startResendCooldown = () => {
    setResendUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    setNowTick(Date.now());
  };

  // Keep the draft in sync (email + mode + step + pending verification; never passwords).
  useEffect(() => {
    sessionStorage.setItem(
      AUTH_DRAFT_KEY,
      JSON.stringify({ email, mode, signupStep, verifyReason, resendUntil })
    );
  }, [email, mode, signupStep, verifyReason, resendUntil]);

  // Tick down the resend cooldown so the button re-enables on its own.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setTimeout(() => setNowTick(Date.now()), 1000);
    return () => window.clearTimeout(id);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup') {
      const pwError = validatePassword(password);
      if (pwError) {
        setError(pwError);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    setUnverifiedEmail(false);
    try {
      const { data, error } =
        mode === 'login'
          ? await authClient.signIn.email({ email, password, rememberMe })
          : await authClient.signUp.email({
              email,
              password,
              // Fall back to the email local-part only if a name somehow wasn't collected.
              name: name.trim() || email.split('@')[0],
            });
      if (error) {
        // Signing in before confirming the address. Say so plainly and offer the
        // way out (finish signing up = enter the emailed code) rather than sending
        // a code the user didn't ask for.
        if (isEmailNotVerified(error)) {
          setUnverifiedEmail(true);
          setError('This email address hasn’t been verified yet.');
          return;
        }
        throw new Error(error.message || 'Authentication failed');
      }
      // With email verification required, sign-up returns no session token - the
      // account exists but stays unusable until the emailed code is entered. Neon
      // has already sent that code as part of sign-up, so don't send another.
      if (mode === 'signup' && !(data as { token?: string | null } | null)?.token) {
        await enterVerifyMode('signup', { send: false });
        return;
      }
      sessionStorage.removeItem(AUTH_DRAFT_KEY);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // Switch to the code screen, optionally sending a code first.
  //
  // `send: false` is for the path right after `signUp.email`, where Neon Auth has
  // already emailed a code itself. Its `send_verification_email_on_sign_up` flag
  // reads `false` via the API yet it sends anyway, so we can't turn that off - we
  // just don't add a second send of our own (which produced two emails with two
  // different codes ~1s apart, and users would often type the stale one). Every
  // other entry point has no sign-up behind it and must send: resuming an
  // abandoned signup, the unverified-login link, and Resend.
  const enterVerifyMode = async (reason: VerifyReason, { send = true } = {}) => {
    setVerifyReason(reason);
    setOtp('');
    setOtpInvalid(false);
    setResendSent(false);
    setError(null);
    setNotice(null);
    setMode('verify');
    if (!send) {
      // Still start the cooldown: a code *was* just sent, just not by us.
      startResendCooldown();
      return;
    }
    const { error } = await sendOtp();
    if (!error) startResendCooldown();
  };

  const sendOtp = async (): Promise<{ error?: { message?: string } | null }> => {
    try {
      const { error } = await (authClient as any).emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: 'email-verification',
      });
      if (error) throw new Error(error.message || 'Could not send verification code');
      return {};
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      return { error: { message } };
    }
  };

  const handleResend = async () => {
    if (!email.trim() || resendCooldown > 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    setOtp('');
    setOtpInvalid(false);
    const { error } = await sendOtp();
    if (!error) {
      setResendSent(true);
      startResendCooldown();
    }
    setSubmitting(false);
  };

  // Confirm the 6-digit code, then put the user straight into the app - no second
  // trip through the login form. Better Auth may hand back a session itself
  // (`token`), and because our auth calls go through the same-origin proxy that
  // cookie is first-party; when it doesn't, we still hold the password they just
  // typed, so we sign in with it. Only a page refresh (which drops the password)
  // can land on the "log in to continue" fallback.
  const handleVerifyOtp = async (code: string) => {
    if (code.length !== 6 || submitting) return;
    setSubmitting(true);
    setError(null);
    setOtpInvalid(false);
    try {
      const { data, error } = await (authClient as any).emailOtp.verifyEmail({
        email: email.trim(),
        otp: code,
      });
      if (error) {
        setOtpInvalid(true);
        setOtp('');
        throw new Error(error.message || 'That code is incorrect or has expired');
      }

      if (password) {
        const { error: signInError } = await authClient.signIn.email({
          email,
          password,
          rememberMe,
        });
        if (signInError) throw new Error(signInError.message || 'Could not sign you in');
      } else if (!data?.token) {
        const { data: session } = await authClient.getSession();
        if (!session) {
          // No password in hand (a resumed signup, or a refresh mid-verification):
          // the account is now verified, so hand them to the login form.
          switchMode('login');
          // switchMode clears messages, so set the notice after it.
          setNotice('Email verified. Log in to continue.');
          return;
        }
      }
      sessionStorage.removeItem(AUTH_DRAFT_KEY);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // Signup step 1 → step 2. Before collecting name/password, check the email
  // isn't already registered so we can steer existing users to log in - and so
  // an account that exists but was never verified can pick up where it left off
  // instead of dead-ending on "already exists".
  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setEmailTaken(false);
    setSubmitting(true);
    try {
      const { exists, verified } = await apiFetch<{ exists: boolean; verified?: boolean }>(
        `/auth/email-exists?email=${encodeURIComponent(email.trim())}`
      );
      if (exists && verified === false) {
        await enterVerifyMode('resume');
        return;
      }
      if (exists) {
        setEmailTaken(true);
        setError('An account with this email already exists.');
        return;
      }
      setSignupStep('details');
    } catch {
      // Fail open - never block signup because the check itself failed.
      setSignupStep('details');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    try {
      // Full-page OAuth redirect; the /login route's beforeLoad handles the
      // post-OAuth landing via getSession(), so onAuthenticated isn't called here.
      await (authClient as any).signIn.social({
        provider: 'google',
        callbackURL: window.location.origin + withBase('/today'),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
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
        redirectTo: window.location.origin + withBase('/login'),
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
    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }
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
    setSignupStep('email');
    setName('');
    setPassword('');
    setError(null);
    setNotice(null);
    setEmailTaken(false);
    setUnverifiedEmail(false);
    setForgotSent(false);
    setResetDone(false);
    setResendSent(false);
  };

  // Login-specific field styling (kept local so the account modal is unaffected).
  const fieldClass =
    'w-full bg-fill-subtle ring ring-line rounded-lg px-4 h-9 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-xp-tier1 transition-all ease-linear';
  const fieldLabel =
    'block text-sm font-medium text-fg-muted';

  const renderForm = () => {
    // ── Enter the 6-digit code from the verification email ───────────────────
    if (mode === 'verify') {
      return (
        <>
          <h2 className="text-2xl md:text-[28px] font-bold text-fg mb-3">Enter your code</h2>
          <p className="text-sm text-fg-subtle mb-6">
            {verifyReason === 'unverified-login'
              ? 'Your email address isn’t verified yet. We sent a 6-digit code to '
              : verifyReason === 'resume'
                ? 'You already started signing up with this email but never verified it. We sent a fresh 6-digit code to '
                : 'Almost there. We sent a 6-digit code to '}
            <span className="text-fg">{email}</span>. Enter it below to finish setting up
            your account.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleVerifyOtp(otp);
            }}
            className="space-y-3.5"
          >
            <OtpInput
              value={otp}
              onChange={(v) => {
                setOtp(v);
                if (otpInvalid) setOtpInvalid(false);
              }}
              // Submit as soon as the sixth digit lands (typed or pasted).
              onComplete={(code) => void handleVerifyOtp(code)}
              disabled={submitting}
              invalid={otpInvalid}
              autoFocus
            />
            {resendSent && !error && (
              <p className="text-xs text-fg-muted bg-fill-subtle rounded-lg px-3 py-2">
                New code sent. Check your inbox (and spam folder).
              </p>
            )}
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting || otp.length !== 6}
              className={`w-full h-9 rounded-lg cursor-pointer disabled:cursor-not-allowed ${btnAccent()}`}
            >
              {submitting ? 'Verifying…' : 'Verify'}
            </button>
          </form>

          <p className="text-sm text-fg-muted mt-5">
            Didn’t get it?{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={submitting || resendCooldown > 0}
              className="font-bold text-fg-muted hover:text-xp-tier1 transition-colors cursor-pointer disabled:text-fg-faint disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </p>
          <p className="text-sm text-fg-muted mt-2">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="font-bold text-fg-muted hover:text-xp-tier1 transition-colors cursor-pointer"
            >
              Back to log in
            </button>
          </p>
        </>
      );
    }

    // ── Forgot password ──────────────────────────────────────────────────────
    if (mode === 'forgot') {
      if (forgotSent) {
        return (
          <>
            <h2 className="text-2xl md:text-[28px] font-bold text-fg mb-3">Check your email</h2>
            <p className="text-sm text-fg-subtle mb-6">
              We sent a password reset link to <span className="text-fg">{email}</span>.
              Check your inbox and follow the link to set a new password.
            </p>
            <p className="text-sm text-fg-muted">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-bold text-fg-muted hover:text-xp-tier1 transition-colors cursor-pointer"
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
          <p className="text-sm text-fg-subtle mb-5">
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
              className={`w-full h-9 rounded-lg cursor-pointer disabled:cursor-not-allowed ${btnAccent()}`}
            >
              {submitting ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
          <p className="text-sm text-fg-muted mt-5">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="font-bold text-fg-muted hover:text-xp-tier1 transition-colors cursor-pointer"
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
            <p className="text-sm text-fg-subtle mb-6">
              Your password has been changed. You can now log in with your new password.
            </p>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`w-full h-9 rounded-lg cursor-pointer ${btnAccent()}`}
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-ghost hover:text-fg-muted transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-fg-faint mt-1.5">{PASSWORD_HINT}</p>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-ghost hover:text-fg-muted transition-colors"
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
              className={`w-full h-9 rounded-lg cursor-pointer disabled:cursor-not-allowed ${btnAccent()}`}
            >
              {submitting ? 'Saving…' : 'Set Password'}
            </button>
          </form>
        </>
      );
    }

    // ── Login / Signup ───────────────────────────────────────────────────────
    // Signup step 1 collects email only; the OR-divider + Google option appear on
    // login and the signup email step, but not on signup step 2 (name + password).
    const isSignup = mode === 'signup';
    const showEmailField = mode === 'login' || signupStep === 'email';
    const showCredentialFields = mode === 'login' || signupStep === 'details';
    const showGoogle = mode === 'login' || (isSignup && signupStep === 'email');

    const submitLabel = submitting
      ? 'Please wait…'
      : mode === 'login'
        ? 'Log In'
        : signupStep === 'email'
          ? 'Continue'
          : 'Create Account';

    // Signup email step checks the email isn't taken, then advances; no auth call yet.
    const onFormSubmit =
      isSignup && signupStep === 'email' ? handleEmailContinue : handleSubmit;

    return (
      <>
        <div className="mb-6">
          <h2 className="text-2xl md:text-[28px] font-bold text-fg mb-1.5">
            {mode === 'login' ? 'Log in to Dunzo' : 'Sign up for Dunzo'}
          </h2>
          <p className="text-sm text-fg-subtle">
            {mode === 'login' ? 'New to Dunzo? ' : 'Already have an account? '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="font-bold text-xp-tier1 hover:text-xp-tier1/75 transition-colors cursor-pointer"
            >
              {mode === 'login' ? 'Create an account' : 'Log in'}
            </button>
          </p>
        </div>

        {/* Back to email on signup step 2 */}
        {isSignup && signupStep === 'details' && (
          <button
            type="button"
            onClick={() => {
              setSignupStep('email');
              setError(null);
            }}
            className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors mb-4 cursor-pointer"
          >
            <ArrowLeft size={15} />
            {email}
          </button>
        )}

        <form onSubmit={onFormSubmit} className="space-y-3.5">
          {showEmailField && (
            <div>
              <label className={`${fieldLabel} mb-1.5`}>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  // Editing the email invalidates a prior "already taken" /
                  // "not verified" result.
                  if (emailTaken || unverifiedEmail) {
                    setEmailTaken(false);
                    setUnverifiedEmail(false);
                    setError(null);
                  }
                }}
                className={fieldClass}
                placeholder="you@example.com"
                autoFocus={showEmailField}
              />
            </div>
          )}

          {isSignup && signupStep === 'details' && (
            <div>
              <label className={`${fieldLabel} mb-1.5`}>Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
                placeholder="Your name"
                autoFocus
              />
            </div>
          )}

          {showCredentialFields && (
            <div>
              <label className={`${fieldLabel} mb-1.5`}>Password</label>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-ghost hover:text-fg-muted transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {isSignup && (
                <p className="text-xs text-fg-faint mt-1.5">
                  At least 8 characters, with an uppercase, lowercase, and number.
                </p>
              )}
            </div>
          )}

          {/* Remember me + Forgot password (login only) */}
          {mode === 'login' && (
            <div className="flex items-center justify-between">
              <RememberCheckbox checked={rememberMe} onChange={setRememberMe} />
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-sm text-fg-muted hover:text-xp-tier1 underline transition-colors cursor-pointer"
              >
                Forgot password?
              </button>
            </div>
          )}

          {notice && !error && (
            <p className="text-xs text-fg-muted bg-fill-subtle rounded-lg px-3 py-2">{notice}</p>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              {error}
              {emailTaken && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-bold text-fg-muted hover:text-xp-tier1 underline transition-colors cursor-pointer"
                  >
                    Log in instead
                  </button>
                </>
              )}
              {unverifiedEmail && (
                <>
                  {' '}
                  Finish signing up to verify it -{' '}
                  <button
                    type="button"
                    onClick={() => void enterVerifyMode('unverified-login')}
                    disabled={submitting}
                    className="font-bold text-fg-muted hover:text-xp-tier1 underline transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    send me a code
                  </button>
                </>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full h-9 rounded-lg cursor-pointer disabled:cursor-not-allowed ${btnAccent()}`}
          >
            {submitLabel}
          </button>
        </form>

        {showGoogle && (
          <>
            <OrDivider />
            <GoogleButton onClick={handleGoogle} />
          </>
        )}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden bg-canvas">
      {/* Full-bleed background */}
      <img
        src={backgroundUrl}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover opacity-50 blur-2xl scale-125"
      />

      <div className="relative h-full w-full flex flex-col md:flex-row">
        {/* ── Brand panel ── */}
        <div className="flex-1 flex flex-col justify-center items-end px-16 pt-14 pb-6 md:pr-20 md:pb-25 font-jakarta">
          <div className="max-w-sm">
            <a href="https://dunzo.work" className="flex items-center gap-3 md:h-24 md:w-24 mb-2">
              <img
                src={logoUrl}
                alt="Dunzo"
                className="h-12 w-12"
              />
              <span className="font-bold text-[33px]">Dunzo</span>
            </a>
            <h1 className="text-2xl md:text-5xl font-bold text-white leading-[1.05]">
              A <span className="text-xp-tier1">calmer</span> way to get things done
            </h1>
          </div>
        </div>

        {/* ── Form panel ── */}
        <div className="w-full md:w-[50%] flex items-center justify-center md:justify-start px-[5%]">
          {/* Visual block: full-height, hugs the right edge with a 4px gap */}
          <motion.div
            // initial={{ opacity: 0, y: 16 }}
            // animate={{ opacity: 1, y: 0 }}
            // transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-full max-w-105 bg-surface rounded-3xl flex items-center justify-center p-8 mb-8"
          >
            {/* Content block: constrained + centered inside the visual block */}
            <div className="w-full md:px-8 md:py-6">
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

// Shared password policy, used by the sign-in gate (features/auth) and the
// change-password form in settings (features/settings). Keep the rule and its
// human-readable hint together so the two surfaces never drift.

// Human-readable summary of the policy - render this under password inputs.
export const PASSWORD_HINT =
  'At least 8 characters, with an uppercase, lowercase, and number.';

// Returns an error string if the password violates the policy, else null.
export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must include a number.';
  return null;
}

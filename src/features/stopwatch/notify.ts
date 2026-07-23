// Desktop notifications for phase ends.
//
// There is no sound in v0, so the *primary* end-of-phase signal is on-screen (the
// digits change color and the view pulses). This is only the fallback for when
// you're looking at something else - which is why it deliberately stays quiet
// while the app has focus: an OS banner for a timer you're already watching is
// noise, not information.

const supported = (): boolean => typeof window !== 'undefined' && 'Notification' in window;

export function notificationsSupported(): boolean {
  return supported();
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return supported() ? Notification.permission : 'unsupported';
}

// Must be called from a user gesture - browsers reject a permission prompt that
// isn't tied to one. The config panel's toggle is that gesture.
export async function requestNotifications(): Promise<boolean> {
  if (!supported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

// `enabled` is the user's pref; the rest is the browser's state and the "are you
// even looking?" test. `document.hidden` alone isn't enough - a visible but
// unfocused window (second monitor, app behind an editor) is exactly the case
// where the notification is most useful.
export function notifyPhaseEnd(enabled: boolean, title: string, body: string): void {
  if (!enabled || !supported()) return;
  if (Notification.permission !== 'granted') return;
  if (!document.hidden && document.hasFocus()) return;
  try {
    // A fixed tag means a second phase end replaces the first banner instead of
    // stacking up a queue of stale ones.
    new Notification(title, { body, tag: 'dun-focus', silent: false });
  } catch {
    // Some browsers throw for constructed notifications without a service
    // worker. Nothing to recover - the on-screen signal already fired.
  }
}

import { useEffect, useState } from 'react';

// Returns `value` lagged by `delayMs`: it holds the previous value and only catches
// up `delayMs` after the latest change (the timer resets on each change, so it
// settles `delayMs` after things stop changing). No delay on first mount. Used to
// run the XP star/streak celebration AFTER the XP count-up finishes.
export function useDelayedValue<T>(value: T, delayMs: number): T {
  const [delayed, setDelayed] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDelayed(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return delayed;
}

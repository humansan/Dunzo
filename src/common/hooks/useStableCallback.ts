import { useLayoutEffect, useRef } from 'react';

// Returns a callback with a stable identity across renders that always invokes
// the latest version of `fn`. Lets us pass handlers to React.memo'd rows without
// breaking memoization, and without the stale-closure risk of useCallback([]).
export function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useRef(((...args: any[]) => ref.current(...args)) as T).current;
}

import { useEffect, useState } from 'react';

/**
 * The current time as a `Date`, refreshed on a timer so countdowns and clocks
 * tick without a refetch. Also refreshes the moment the page becomes visible
 * again, because browsers throttle timers in a backgrounded tab and a phone
 * coming out of the pocket should not show a minute-old clock.
 *
 * Purely client-side: it never touches the network, so it behaves the same
 * offline.
 */
export function useNow(intervalMs: number = 5000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = setInterval(refresh, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return now;
}

export default useNow;

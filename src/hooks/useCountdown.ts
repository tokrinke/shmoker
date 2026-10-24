import { useEffect, useState } from 'react';

/** Milliseconds left until `deadline` (server time), updating about 5 times per second. */
export function useCountdown(deadline: number | null, serverNow: () => number): number {
  const [remaining, setRemaining] = useState(() => (deadline ? Math.max(0, deadline - serverNow()) : 0));
  useEffect(() => {
    if (!deadline) {
      setRemaining(0);
      return;
    }
    const update = () => setRemaining(Math.max(0, deadline - serverNow()));
    update();
    const id = window.setInterval(update, 200);
    return () => window.clearInterval(id);
  }, [deadline, serverNow]);
  return remaining;
}

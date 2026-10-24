import { ReactNode, useMemo } from 'react';
import { useCountdown } from '../../hooks/useCountdown';
import './timer.css';

interface Props {
  /** Server time (ms) when the turn ends. */
  deadline: number;
  /** Full length of the turn, used to size the ring. */
  totalMs: number;
  serverNow: () => number;
  children: ReactNode;
}

const WARNING_MS = 6000;

/** A ring that drains around its children. The animation is pure CSS, started once per turn. */
export function TurnTimer({ deadline, totalMs, serverNow, children }: Props) {
  const remaining = useCountdown(deadline, serverNow);

  // Computed once per deadline so re-renders never restart the animation.
  const animation = useMemo(() => {
    const total = Math.max(totalMs, deadline - serverNow());
    const elapsed = Math.min(total, Math.max(0, total - (deadline - serverNow())));
    return { '--timer-duration': `${total}ms`, '--timer-delay': `-${elapsed}ms` } as React.CSSProperties;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, totalMs]);

  const isWarning = remaining > 0 && remaining <= WARNING_MS;
  return (
    <div className={`turn-timer ${isWarning ? 'turn-timer--warning' : ''}`} style={animation}>
      <svg className="turn-timer__ring" viewBox="0 0 44 44" aria-hidden>
        <rect className="turn-timer__track" x="2" y="2" width="40" height="40" rx="6" />
        <rect key={deadline} className="turn-timer__progress" x="2" y="2" width="40" height="40" rx="6" pathLength={100} />
      </svg>
      <div className="turn-timer__content">{children}</div>
      <span className="turn-timer__seconds">{Math.ceil(remaining / 1000)}</span>
    </div>
  );
}

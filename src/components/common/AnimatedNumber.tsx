import { useEffect, useRef, useState } from 'react';
import { money } from '../../lib/format';

interface Props {
  value: number;
  /** Wait this long before counting UP (used so winnings arrive after the chips fly in). */
  delay?: number;
  duration?: number;
  format?: (value: number) => string;
}

/** Shows a number that counts smoothly to its new value. Increases glow gold while they count. */
export function AnimatedNumber({ value, delay = 0, duration = 1000, format = money }: Props) {
  const [shown, setShown] = useState(value);
  const [growing, setGrowing] = useState(false);
  const current = useRef(value);

  useEffect(() => {
    if (value === current.current) return;
    const from = current.current;
    const increasing = value > from;
    const length = increasing ? duration : 250;
    let frame = 0;
    const timer = window.setTimeout(() => {
      const start = performance.now();
      if (increasing) setGrowing(true);
      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / length);
        const eased = 1 - Math.pow(1 - progress, 3);
        current.current = Math.round(from + (value - from) * eased);
        setShown(current.current);
        if (progress < 1) frame = requestAnimationFrame(step);
        else setGrowing(false);
      };
      frame = requestAnimationFrame(step);
    }, increasing ? delay : 0);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [value, delay, duration]);

  return <span className={`animated-number ${growing ? 'animated-number--growing' : ''}`}>{format(shown)}</span>;
}

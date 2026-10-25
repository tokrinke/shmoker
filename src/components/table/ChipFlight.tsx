import { RefObject, useEffect, useState } from 'react';
import './chip-flight.css';

interface Props {
  /** The table stage: chips are measured and drawn inside it. */
  stageRef: RefObject<HTMLElement>;
  winners: { id: string; amount: number }[];
  /** Changes with every hand, so the animation plays once per hand. */
  handKey: number;
}

interface FlyingChip {
  key: string;
  fromX: number;
  fromY: number;
  dx: number;
  dy: number;
  delay: number;
}

/** Little gold chips fly from the pot to each winner's seat. */
export function ChipFlight({ stageRef, winners, handKey }: Props) {
  const [chips, setChips] = useState<FlyingChip[]>([]);

  useEffect(() => {
    const stage = stageRef.current;
    const pot = stage?.querySelector('.poker-table__pot-amount');
    if (!stage || !pot || winners.length === 0) {
      setChips([]);
      return;
    }
    const stageBox = stage.getBoundingClientRect();
    const potBox = pot.getBoundingClientRect();
    const fromX = potBox.left + potBox.width / 2 - stageBox.left;
    const fromY = potBox.top + potBox.height / 2 - stageBox.top;

    const flying: FlyingChip[] = [];
    winners.forEach((winner, winnerIndex) => {
      const panel = stage.querySelector(`[data-seat-id="${winner.id}"] .player-seat__panel`);
      if (!panel) return;
      const box = panel.getBoundingClientRect();
      const toX = box.left + box.width / 2 - stageBox.left;
      const toY = box.top + box.height / 2 - stageBox.top;
      const count = Math.min(12, 6 + Math.floor(Math.log10(Math.max(10, winner.amount)) * 2));
      for (let i = 0; i < count; i++) {
        flying.push({
          key: `${handKey}-${winner.id}-${i}`,
          fromX: fromX + (Math.random() - 0.5) * 26,
          fromY: fromY + (Math.random() - 0.5) * 12,
          dx: toX - fromX + (Math.random() - 0.5) * 36,
          dy: toY - fromY + (Math.random() - 0.5) * 14,
          delay: winnerIndex * 140 + i * 65,
        });
      }
    });
    setChips(flying);
    const timer = window.setTimeout(() => setChips([]), 2400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handKey]);

  return (
    <>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="chip-flight__chip"
          style={{ left: chip.fromX, top: chip.fromY, '--dx': `${chip.dx}px`, '--dy': `${chip.dy}px`, animationDelay: `${chip.delay}ms` } as React.CSSProperties}
        />
      ))}
    </>
  );
}

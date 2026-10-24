import { playerMark } from '../../lib/playerStyle';

/** A player's name in bold with their personal suit mark in front. Used everywhere names appear. */
export function PlayerName({ name, seatIndex }: { name: string; seatIndex: number }) {
  const mark = playerMark(seatIndex);
  return (
    <span className="player-name" style={{ '--mark-color': mark.color } as React.CSSProperties}>
      <span className="player-name__mark" aria-hidden>{mark.glyph}</span>
      {name}
    </span>
  );
}

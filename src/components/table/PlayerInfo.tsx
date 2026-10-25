import type { PublicSeat } from '@engine';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { PlayerName } from '../common/PlayerName';

export type SeatStatus = 'active' | 'waiting' | 'folded' | 'out';

/** Maps a seat to the colour of its little glowing dot. */
export function seatStatus(seat: PublicSeat, connected: boolean): SeatStatus {
  if (seat.eliminated || seat.left) return 'out';
  if (seat.folded) return 'folded';
  if (!connected || seat.away) return 'waiting';
  return 'active';
}

interface Props {
  seat: PublicSeat;
  status: SeatStatus;
  isYou: boolean;
  connected: boolean;
  /** Wait before counting a win up (see WIN_COUNT_DELAY). */
  countDelay?: number;
  /** Best hand so far (shown during an all-in runout and at showdown). */
  handName?: string;
}

function statusLabel(seat: PublicSeat, status: SeatStatus, connected: boolean): string {
  if (status === 'out') return 'Out';
  if (status === 'folded') return 'Folded';
  if (seat.allIn) return 'All-in';
  if (seat.away) return 'Away';
  if (!connected) return 'Reconnecting';
  return '';
}

export function PlayerInfo({ seat, status, isYou, connected, countDelay = 0, handName }: Props) {
  const label = statusLabel(seat, status, connected);
  return (
    <div className="player-info">
      <div className="player-info__name-row">
        <span className={`status-dot status-dot--${status}`} />
        <span className="player-info__name"><PlayerName name={seat.name} seatIndex={seat.seatIndex} /></span>
      </div>
      <div className="player-info__stack"><AnimatedNumber value={seat.stack} delay={countDelay} /></div>
      {handName ? <div className="player-info__hand">{handName}</div> : label && <div className="player-info__status">{label}</div>}
    </div>
  );
}

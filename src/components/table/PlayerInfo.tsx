import type { PublicSeat } from '@engine';
import { money } from '../../lib/format';
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
}

function statusLabel(seat: PublicSeat, status: SeatStatus, connected: boolean): string {
  if (status === 'out') return 'Out';
  if (status === 'folded') return 'Folded';
  if (seat.allIn) return 'All-in';
  if (seat.away) return 'Away';
  if (!connected) return 'Reconnecting';
  return '';
}

export function PlayerInfo({ seat, status, isYou, connected }: Props) {
  const label = statusLabel(seat, status, connected);
  return (
    <div className="player-info">
      <div className="player-info__name-row">
        <span className={`status-dot status-dot--${status}`} />
        <span className="player-info__name"><PlayerName name={seat.name} seatIndex={seat.seatIndex} /></span>
      </div>
      <div className="player-info__stack">{money(seat.stack)}</div>
      {label && <div className="player-info__status">{label}</div>}
    </div>
  );
}

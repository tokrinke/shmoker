import type { ReactNode } from 'react';
import type { Card, PublicSeat } from '@engine';
import { money } from '../../lib/format';
import { IconCoins, IconCrown } from '../common/Icons';
import { PlayerInfo, seatStatus } from './PlayerInfo';
import { PlayingCard } from './PlayingCard';
import { TurnTimer } from './TurnTimer';
import './seat.css';

interface Props {
  seat: PublicSeat;
  /** Position around the table, see styles/seat-positions.css */
  slot: number;
  isYou: boolean;
  isHost: boolean;
  isDealer: boolean;
  isActive: boolean;
  connected: boolean;
  /** Face-up cards (your own, or revealed at showdown). null = show backs if the player holds cards. */
  visibleCards: Card[] | null;
  timer: { deadline: number; totalMs: number; serverNow: () => number } | null;
  /** Chips won this hand (for the award animation). */
  wonAmount?: number;
  /** Fold / Call / Raise buttons, shown next to your own seat. */
  actions?: ReactNode;
}

export function PlayerSeat({ seat, slot, isYou, isHost, isDealer, isActive, connected, visibleCards, timer, wonAmount, actions }: Props) {
  const status = seatStatus(seat, connected);
  const classes = [
    'player-seat',
    isYou && 'player-seat--you',
    isActive && 'player-seat--active',
    wonAmount && 'player-seat--winner',
    status === 'folded' && 'player-seat--folded',
    status === 'out' && 'player-seat--out',
  ]
    .filter(Boolean)
    .join(' ');

  const avatar = <div className="player-seat__avatar">{seat.name.slice(0, 1).toUpperCase()}</div>;

  return (
    <div className={classes} data-slot={slot}>
      <div className="player-seat__cards">
        {visibleCards
          ? visibleCards.map((card) => <PlayingCard key={card} card={card} size={isYou ? 'hero' : 'small'} />)
          : seat.hasCards && [0, 1].map((index) => <PlayingCard key={index} size="small" dealDelay={index * 120} />)}
      </div>

      <div className="player-seat__panel">
        {isHost && <span className="player-seat__host" title="Host"><IconCrown size={15} /></span>}
        {timer && isActive ? <TurnTimer {...timer}>{avatar}</TurnTimer> : <div className="player-seat__avatar-wrap">{avatar}</div>}
        <PlayerInfo seat={seat} status={status} isYou={isYou} connected={connected} />
      </div>

      {seat.bet > 0 && (
        <div className="player-seat__bet"><IconCoins size={15} />{money(seat.bet)}</div>
      )}
      {isDealer && <div className="player-seat__dealer-button" title="Dealer">D</div>}
      {wonAmount ? <div className="player-seat__award">+{money(wonAmount)}</div> : null}
      {actions && <div className="player-seat__actions">{actions}</div>}
    </div>
  );
}

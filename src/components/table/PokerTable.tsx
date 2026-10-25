import { ReactNode, useEffect, useRef, useState } from 'react';
import { evaluateHand } from '@engine';
import type { PublicGameView } from '@engine';
import { money } from '../../lib/format';
import { IconCoins } from '../common/Icons';
import type { PrivateHand } from '../../types/room';
import { ChipFlight } from './ChipFlight';
import { CommunityCards } from './CommunityCards';
import { PlayerSeat } from './PlayerSeat';
import { assignSlots } from './seatLayout';
import './table.css';

interface Props {
  game: PublicGameView;
  hand: PrivateHand | null;
  userId: string;
  hostId: string;
  connectedIds: Set<string>;
  serverNow: () => number;
  /** Fold / Call / Raise buttons for your own seat. */
  actions?: ReactNode;
}

const STAGE_LABELS: Record<PublicGameView['phase'], string> = {
  preflop: 'Pre-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  handover: 'Hand complete',
  gameover: 'Game over',
};

export function PokerTable({ game, hand, userId, hostId, connectedIds, serverNow, actions }: Props) {
  const betting = ['preflop', 'flop', 'turn', 'river'].includes(game.phase);
  const stageRef = useRef<HTMLDivElement>(null);
  const reveals = game.reveals ?? {}; // older published tables may not have this field yet
  const runout = betting && Boolean(game.runoutAt);
  const placed = assignSlots(game.seats, userId);
  const result = !betting ? game.result : null;
  const payouts = new Map(result?.payouts.map((payout) => [payout.playerId, payout.amount]));
  const sidePots = game.pots.length > 1 ? game.pots.slice(1) : [];

  // After a hand the pot stays visible for a moment while the chips fly to the winner, then empties.
  const potTotal = result ? result.payouts.reduce((sum, payout) => sum + payout.amount, 0) : 0;
  const [potEmptied, setPotEmptied] = useState(false);
  useEffect(() => {
    setPotEmptied(false);
    if (!result) return;
    const timer = window.setTimeout(() => setPotEmptied(true), 1100);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.handNumber]);
  const potShown = betting ? game.pot : result && !potEmptied ? potTotal : 0;

  // While everybody is all-in, show each player's best hand so far
  const handNameFor = (id: string): string | undefined => {
    const cards = reveals[id];
    if (!cards || game.community.length < 3) return undefined;
    return evaluateHand([...cards, ...game.community]).name;
  };

  const nameOf = (id: string) => game.seats.find((seat) => seat.id === id)?.name ?? 'Someone';
  const winners = result ? result.payouts.map((payout) => `${nameOf(payout.playerId)} wins ${money(payout.amount)}${payout.handName ? ` · ${payout.handName}` : ''}`) : [];

  return (
    <div className="poker-table">
      <div className="poker-table__stage" ref={stageRef}>
        <div className="poker-table__rail">
          <div className="poker-table__felt" />
        </div>

        <div className="poker-table__center">
          <div className={`poker-table__stage-label ${winners.length > 0 ? 'poker-table__stage-label--result' : ''}`}>
            {winners.length > 0
              ? winners.map((text) => <div key={text}>{text}</div>)
              : runout ? `All-in · ${STAGE_LABELS[game.phase]}` : STAGE_LABELS[game.phase]}
            {game.phase === 'gameover' && game.winnerId && <div className="poker-table__game-over">{nameOf(game.winnerId)} wins the game</div>}
          </div>
          <div className="poker-table__pot">
            <span className="poker-table__pot-label">Pot</span>
            <span className="poker-table__pot-amount"><IconCoins size={26} />{money(potShown)}</span>
          </div>
          {sidePots.length > 0 && (
            <div className="poker-table__side-pots">
              {sidePots.map((pot, index) => (
                <span key={index} className="poker-table__side-pot">Side pot {money(pot.amount)}</span>
              ))}
            </div>
          )}
          <CommunityCards cards={game.community} />
        </div>

        {result && <ChipFlight stageRef={stageRef} handKey={result.handNumber} winners={result.payouts.map((payout) => ({ id: payout.playerId, amount: payout.amount }))} />}

        {placed.map(({ seat, slot }) => {
          const isYou = seat.id === userId;
          const reveal = result?.reveals[seat.id]?.cards ?? reveals[seat.id];
          const ownCards = hand && hand.handNumber === game.handNumber && (betting || reveal) ? hand.cards : null;
          const visibleCards = reveal ?? (isYou ? ownCards : null);
          return (
            <PlayerSeat
              key={seat.id}
              seat={betting ? seat : { ...seat, hasCards: false }}
              slot={slot}
              isYou={isYou}
              isHost={seat.id === hostId}
              isDealer={game.dealerId === seat.id && game.phase !== 'gameover'}
              isActive={game.toActId === seat.id}
              connected={connectedIds.has(seat.id)}
              visibleCards={visibleCards}
              timer={game.deadline ? { deadline: game.deadline, totalMs: game.settings.turnSeconds * 1000, serverNow } : null}
              wonAmount={payouts.get(seat.id)}
              actions={isYou ? actions : undefined}
              handName={result?.reveals[seat.id]?.handName ?? handNameFor(seat.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

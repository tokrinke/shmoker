import { useEffect, useRef, useState } from 'react';
import { getLegalActions, presetRaiseTo } from '@engine';
import type { PlayerAction, PublicGameView } from '@engine';
import { money } from '../../lib/format';
import { IconCall, IconCheck, IconCoins, IconFold, IconRaise } from '../common/Icons';
import './seat-actions.css';

interface Props {
  game: PublicGameView;
  userId: string;
  busy: boolean;
  onAction: (action: PlayerAction) => void;
  onSitIn: () => void;
  /** Open the raise panel immediately (used for previews). */
  startOpen?: boolean;
}

const PRESETS = [
  { label: '½ pot', fraction: 0.5 },
  { label: '¾ pot', fraction: 0.75 },
  { label: 'Pot', fraction: 1 },
];

/** Fold / Check / Call / Raise buttons that appear next to your own seat when it is your turn. */
export function SeatActions({ game, userId, busy, onAction, onSitIn, startOpen = false }: Props) {
  const legal = getLegalActions(game, userId);
  const me = game.seats.find((seat) => seat.id === userId);
  const [raiseOpen, setRaiseOpen] = useState(startOpen);
  const [raiseTo, setRaiseTo] = useState(legal.minRaiseTo);
  const panelRef = useRef<HTMLDivElement>(null);

  // Every new decision starts closed, at the minimum legal raise.
  useEffect(() => {
    setRaiseOpen(startOpen);
    setRaiseTo(legal.minRaiseTo);
  }, [game.actionSeq, legal.minRaiseTo, startOpen]);

  // Make sure the bet panel is fully visible when it opens
  useEffect(() => {
    if (raiseOpen) panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [raiseOpen]);

  if (me?.away) {
    return <button className="button button--primary" onClick={onSitIn}>You are away. Sit back in</button>;
  }
  if (!legal.isYourTurn) return null;

  const amount = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(raiseTo) || 0));
  const raiseLabel = legal.raiseKind === 'bet' ? 'Bet' : 'Raise';

  return (
    <div className="seat-actions">
      <div className="seat-actions__bar">
        <button className="button button--danger" disabled={busy} onClick={() => onAction({ type: 'fold' })}>
          <IconFold size={18} />Fold
        </button>
        {legal.canCall ? (
          <button className="button" disabled={busy} onClick={() => onAction({ type: 'call' })}>
            <IconCall size={18} />Call {money(legal.callAmount)}
          </button>
        ) : (
          <button className="button" disabled={busy} onClick={() => onAction({ type: 'check' })}>
            <IconCheck size={18} />Check
          </button>
        )}
        {legal.canRaise && (
          <button className={`button ${raiseOpen ? 'button--primary' : ''}`} disabled={busy} onClick={() => setRaiseOpen((open) => !open)}>
            <IconRaise size={18} />{raiseLabel}
          </button>
        )}
      </div>

      {raiseOpen && legal.canRaise && (
        <div ref={panelRef} className="seat-actions__raise-panel">
          <div className="seat-actions__raise-amount">
            <span className="seat-actions__raise-label">{raiseLabel} to</span>
            <input
              className="seat-actions__amount-input"
              type="number"
              inputMode="numeric"
              min={legal.minRaiseTo}
              max={legal.maxRaiseTo}
              value={raiseTo || ''}
              onChange={(event) => setRaiseTo(Number(event.target.value))}
            />
          </div>
          <input
            className="seat-actions__slider"
            type="range"
            min={legal.minRaiseTo}
            max={Math.max(legal.minRaiseTo, legal.maxRaiseTo)}
            value={amount}
            onChange={(event) => setRaiseTo(Number(event.target.value))}
          />
          <div className="seat-actions__presets">
            {PRESETS.map((preset) => (
              <button key={preset.label} className="button button--small button--ghost" onClick={() => setRaiseTo(presetRaiseTo(game, userId, preset.fraction))}>
                {preset.label}
              </button>
            ))}
            <button className="button button--small button--ghost" onClick={() => setRaiseTo(legal.maxRaiseTo)}>Max</button>
          </div>
          <div className="seat-actions__confirm">
            <button className="button button--primary" disabled={busy} onClick={() => onAction({ type: legal.raiseKind, amount })}>
              <IconRaise size={18} />{raiseLabel} {money(amount)}
            </button>
            {legal.canAllIn && (
              <button className="button" disabled={busy} onClick={() => onAction({ type: 'allin' })}>
                <IconCoins size={18} />All-in {money(legal.maxRaiseTo)}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getLegalActions, presetRaiseTo } from '@engine';
import type { PlayerAction, PublicGameView } from '@engine';
import './controls.css';

interface Props {
  game: PublicGameView;
  userId: string;
  busy: boolean;
  onAction: (action: PlayerAction) => void;
  onSitIn: () => void;
}

const PRESETS = [
  { label: '½ pot', fraction: 0.5 },
  { label: '¾ pot', fraction: 0.75 },
  { label: 'Pot', fraction: 1 },
];

export function BettingControls({ game, userId, busy, onAction, onSitIn }: Props) {
  const legal = getLegalActions(game, userId);
  const me = game.seats.find((seat) => seat.id === userId);
  const [raiseTo, setRaiseTo] = useState(legal.minRaiseTo);

  // Start from the minimum legal raise on every new decision.
  useEffect(() => setRaiseTo(legal.minRaiseTo), [game.actionSeq, legal.minRaiseTo]);

  const betting = game.toActId !== null;
  const turnName = game.seats.find((seat) => seat.id === game.toActId)?.name;
  const clamped = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(raiseTo) || 0));
  const disabled = !legal.isYourTurn || busy;

  let hint = 'Waiting for the next hand…';
  if (betting) hint = legal.isYourTurn ? 'Your turn' : `Waiting for ${turnName}…`;
  if (me?.folded && betting && !legal.isYourTurn) hint = `You folded. ${turnName} is acting…`;

  const reason = (text: string) => (legal.isYourTurn ? text : 'Not your turn');

  return (
    <section className="betting-controls panel">
      <div className="betting-controls__status">{hint}</div>

      <dl className="betting-controls__facts">
        <div><dt>Your chips</dt><dd>{(me?.stack ?? 0).toLocaleString('en-US')}</dd></div>
        <div><dt>To call</dt><dd>{legal.isYourTurn ? legal.callAmount.toLocaleString('en-US') : '–'}</dd></div>
        <div><dt>Min raise to</dt><dd>{legal.canRaise ? legal.minRaiseTo.toLocaleString('en-US') : '–'}</dd></div>
      </dl>

      {me?.away && (
        <button className="button button--primary betting-controls__sit-in" onClick={onSitIn}>
          You are away — sit back in
        </button>
      )}

      <div className="betting-controls__main">
        <button className="button button--danger" disabled={disabled || !legal.canFold} title={reason('Give up this hand')} onClick={() => onAction({ type: 'fold' })}>
          Fold
        </button>
        {legal.canCall || !legal.canCheck ? (
          <button className="button" disabled={disabled || !legal.canCall} title={reason('Match the current bet')} onClick={() => onAction({ type: 'call' })}>
            Call {legal.canCall ? legal.callAmount.toLocaleString('en-US') : ''}
          </button>
        ) : (
          <button className="button" disabled={disabled || !legal.canCheck} title={reason('Pass without betting')} onClick={() => onAction({ type: 'check' })}>
            Check
          </button>
        )}
      </div>

      <div className="betting-controls__raise">
        <div className="betting-controls__presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              className="button button--small button--ghost"
              disabled={disabled || !legal.canRaise}
              onClick={() => setRaiseTo(presetRaiseTo(game, userId, preset.fraction))}
            >
              {preset.label}
            </button>
          ))}
          <button className="button button--small button--ghost" disabled={disabled || !legal.canRaise} onClick={() => setRaiseTo(legal.maxRaiseTo)}>
            Max
          </button>
        </div>
        <input
          className="betting-controls__slider"
          type="range"
          min={legal.minRaiseTo}
          max={Math.max(legal.minRaiseTo, legal.maxRaiseTo)}
          value={clamped}
          disabled={disabled || !legal.canRaise}
          onChange={(event) => setRaiseTo(Number(event.target.value))}
        />
        <input
          className="text-input betting-controls__amount"
          type="number"
          inputMode="numeric"
          min={legal.minRaiseTo}
          max={legal.maxRaiseTo}
          value={raiseTo || ''}
          disabled={disabled || !legal.canRaise}
          onChange={(event) => setRaiseTo(Number(event.target.value))}
        />
        <button
          className="button button--primary betting-controls__raise-button"
          disabled={disabled || !legal.canRaise}
          title={legal.canRaise ? 'Raise' : reason('You cannot raise right now')}
          onClick={() => onAction({ type: legal.raiseKind, amount: clamped })}
        >
          {legal.raiseKind === 'bet' ? 'Bet' : 'Raise to'} {clamped.toLocaleString('en-US')}
        </button>
        <button className="button betting-controls__all-in" disabled={disabled || !legal.canAllIn} title={reason('Put in all your chips')} onClick={() => onAction({ type: 'allin' })}>
          All-in {legal.canAllIn ? legal.maxRaiseTo.toLocaleString('en-US') : ''}
        </button>
      </div>
    </section>
  );
}

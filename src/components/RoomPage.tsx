import { useEffect, useRef, useState } from 'react';
import type { PlayerAction, PublicGameView } from '@engine';
import { useRoom } from '../hooks/useRoom';
import { useTableClock } from '../hooks/useTableClock';
import { useToasts } from '../hooks/useToasts';
import { api } from '../lib/api';
import { goHome } from '../lib/router';
import { isSoundEnabled, setSoundEnabled, sounds } from '../lib/sounds';
import { money } from '../lib/format';
import { ConnectionBadge } from './common/ConnectionBadge';
import { IconExit, IconSound, IconSoundOff } from './common/Icons';
import { AmbientFlakes } from './common/AmbientFlakes';
import { PlayerList } from './common/PlayerList';
import { ToastNotifications } from './common/ToastNotifications';
import { SeatActions } from './controls/SeatActions';
import { TableStats } from './controls/TableStats';
import { Lobby } from './lobby/Lobby';
import { ActionLog } from './log/ActionLog';
import { PokerTable } from './table/PokerTable';
import './room.css';

export function RoomPage({ roomId, userId }: { roomId: string; userId: string }) {
  const { view, hand, connection, connectedIds, notSeated, refetch } = useRoom(roomId, userId);
  const game = view?.game ?? null;
  const serverNow = useTableClock(roomId, game);
  const { toasts, push, dismiss } = useToasts();
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled);

  useGameFeedback(game, userId, connection, push);

  const act = async (action: PlayerAction) => {
    if (!game) return;
    setBusy(true);
    try {
      await api.act(roomId, game.actionSeq, action);
    } catch (problem) {
      push((problem as Error).message, 'error');
      refetch();
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!window.confirm('Leave this table? You will not be able to come back to the current game.')) return;
    try {
      await api.leave(roomId);
    } catch {
      /* leaving anyway */
    }
    goHome();
  };

  const toggleSound = () => {
    setSoundEnabled(!soundOn);
    setSoundOn(!soundOn);
  };

  if (notSeated) {
    return (
      <main className="room-message panel">
        <h1>You are not seated at this table</h1>
        <p>Ask the host for the invite link, or the table may have expired.</p>
        <button className="button button--primary" onClick={goHome}>Back to start</button>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="room-screen">
        <div className="skeleton room-screen__skeleton" />
      </main>
    );
  }

  const isHost = view.room.hostId === userId;

  return (
    <main className="room-screen">
      <header className="room-screen__header">
        <div className="room-screen__title">
          <span className="room-screen__code">{view.room.code}</span>
          <ConnectionBadge state={connection} />
        </div>
        <div className="room-screen__header-actions">
          <button className="button button--ghost button--small" onClick={toggleSound} title={soundOn ? 'Mute sounds' : 'Turn sounds on'}>
            {soundOn ? <IconSound size={18} /> : <IconSoundOff size={18} />}
            {soundOn ? 'Sound on' : 'Sound off'}
          </button>
          <button className="button button--ghost button--small" onClick={leave} title="Leave the table">
            <IconExit size={18} />Leave
          </button>
        </div>
      </header>

      {game ? (
        <div className="room-screen__body">
          <aside className="room-screen__roster">
            <PlayerList
              players={view.players}
              hostId={view.room.hostId}
              userId={userId}
              connectedIds={connectedIds}
              stacks={new Map(game.seats.map((seat) => [seat.id, seat.stack]))}
              winnerIds={new Set(game.toActId === null ? game.result?.payouts.map((payout) => payout.playerId) : [])}
            />
          </aside>
          <div className="room-screen__main">
            <PokerTable
              game={game}
              hand={hand}
              userId={userId}
              hostId={view.room.hostId}
              connectedIds={connectedIds}
              serverNow={serverNow}
              actions={
                <SeatActions
                  game={game}
                  userId={userId}
                  busy={busy}
                  onAction={act}
                  onSitIn={() => api.sitIn(roomId).catch((e) => push(e.message, 'error'))}
                />
              }
            />
            {game.phase === 'gameover' && isHost && (
              <button className="button button--primary button--large" onClick={() => api.backToLobby(roomId).catch((e) => push(e.message, 'error'))}>
                Back to lobby with fresh chips
              </button>
            )}
          </div>
          <aside className="room-screen__sidebar">
            <TableStats game={game} userId={userId} />
            <ActionLog entries={view.log} />
          </aside>
        </div>
      ) : (
        <div className="room-screen__lobby">
          <AmbientFlakes density="calm" />
          <div className="room-screen__lobby-stack">
            <Lobby view={view} userId={userId} onError={(text) => push(text, 'error')} onNotice={(text) => push(text, 'success')} />
          </div>
        </div>
      )}

      <ToastNotifications toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}

/** Sounds and toasts for things that happen at the table. */
function useGameFeedback(
  game: PublicGameView | null,
  userId: string,
  connection: string,
  push: (text: string, tone?: 'info' | 'success' | 'error' | 'win') => void,
) {
  const previous = useRef<PublicGameView | null>(null);
  const previousConnection = useRef(connection);

  useEffect(() => {
    if (connection !== previousConnection.current) {
      if (connection === 'offline') push('Connection lost, reconnecting…', 'error');
      if (connection === 'online' && previousConnection.current === 'offline') push('Reconnected', 'success');
      previousConnection.current = connection;
    }
  }, [connection, push]);

  useEffect(() => {
    const before = previous.current;
    previous.current = game;
    if (!game || !before) return;

    if (game.handNumber > before.handNumber) sounds.deal(4, 0.13);
    else if (game.community.length > before.community.length) sounds.deal(game.community.length - before.community.length);
    const committed = (state: PublicGameView) => state.seats.reduce((sum, seat) => sum + seat.bet, 0);
    if (game.handNumber === before.handNumber && game.actionSeq !== before.actionSeq) {
      const newlyFolded = game.seats.some((seat, index) => seat.folded && !before.seats[index]?.folded);
      if (committed(game) > committed(before)) sounds.chips();
      else if (newlyFolded) sounds.fold();
      else if (game.phase === before.phase && game.toActId && game.toActId !== before.toActId) sounds.check();
    }

    if (game.toActId === userId && before.toActId !== userId) {
      sounds.yourTurn();
      push('Your turn', 'info');
    }

    if (game.result && game.result.handNumber !== before.result?.handNumber) {
      sounds.collect();
      const mine = game.result.payouts.find((payout) => payout.playerId === userId);
      if (mine) {
        sounds.win();
        push(`You won ${money(mine.amount)}`, 'win');
      } else {
        const top = game.result.payouts[0];
        const name = game.seats.find((seat) => seat.id === top?.playerId)?.name;
        if (name) push(`${name} won ${money(top.amount)}`, 'info');
      }
    }
  }, [game, userId, push]);
}

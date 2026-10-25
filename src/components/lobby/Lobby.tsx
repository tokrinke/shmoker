import { useState } from 'react';
import { api } from '../../lib/api';
import { inviteLink } from '../../lib/router';
import type { RoomView } from '../../types/room';
import { IconCopy, IconCrown, IconLock } from '../common/Icons';
import { PlayerName } from '../common/PlayerName';
import { GameSettings } from './GameSettings';
import './lobby.css';

interface Props {
  view: RoomView;
  userId: string;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

export function Lobby({ view, userId, onError, onNotice }: Props) {
  const { room, players } = view;
  const [starting, setStarting] = useState(false);
  const isHost = room.hostId === userId;
  const canStart = isHost && players.length >= 2;
  const host = players.find((player) => player.id === room.hostId);
  const link = inviteLink(room.code);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(link);
      onNotice('Invite link copied');
    } catch {
      onError('Could not copy, select the link and copy it manually');
    }
  };

  const start = async () => {
    setStarting(true);
    try {
      await api.startGame(room.id);
    } catch (problem) {
      onError((problem as Error).message);
      setStarting(false);
    }
  };

  const seats = Array.from({ length: room.maxPlayers }, (_, seat) => players.find((player) => player.seat === seat));

  return (
    <section className="lobby panel">
      <header className="lobby__header">
        <div>
          <p className="field-label">Room code</p>
          <p className="lobby__code">{room.code}</p>
        </div>
        <p className="lobby__host"><IconCrown size={16} />Hosted by <strong>{host?.name ?? '…'}</strong></p>
      </header>

      <div className="lobby__invite">
        <input className="text-input lobby__invite-link" readOnly value={link} onFocus={(event) => event.target.select()} />
        <button className="button button--primary" onClick={copyInvite}><IconCopy size={18} />Copy Invite Link</button>
      </div>

      <ul className="lobby__seats">
        {seats.map((player, seat) => (
          <li key={seat} className={`lobby__seat ${player ? 'lobby__seat--taken' : 'lobby__seat--empty'}`}>
            <span className="lobby__seat-number">{seat + 1}</span>
            {player ? (
              <>
                <span className="status-dot status-dot--active" />
                <span className="lobby__seat-name"><PlayerName name={player.name} seatIndex={player.seat} /></span>
                {player.id === room.hostId && <span className="host-tag">Host</span>}
                {player.id === userId && <span className="lobby__badge lobby__badge--you">You</span>}
              </>
            ) : (
              <span className="lobby__seat-empty-label">Empty seat</span>
            )}
          </li>
        ))}
      </ul>

      <GameSettings
        settings={room.settings}
        editable={isHost}
        onSave={async (settings) => {
          try {
            await api.updateSettings(room.id, settings);
            onNotice('Settings saved');
          } catch (problem) {
            onError((problem as Error).message);
          }
        }}
      />

      <footer className="lobby__footer">
        {isHost ? (
          <button className="button button--primary button--large lobby__start" disabled={!canStart || starting} onClick={start}>
            {starting ? 'Dealing…' : canStart ? 'Start the game' : 'Waiting for at least two players'}
          </button>
        ) : (
          <div className="lobby__waiting" role="status">
            <span className="lobby__waiting-pulse" />
            <div>
              <p className="lobby__waiting-title">Waiting for {host?.name ?? 'the host'} to start the game</p>
              <p className="lobby__waiting-note"><IconLock size={13} />Only the host can start the game or change the settings</p>
            </div>
          </div>
        )}
      </footer>
    </section>
  );
}

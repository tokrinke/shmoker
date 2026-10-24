import { money } from '../../lib/format';
import { IconUsers } from './Icons';
import { PlayerName } from './PlayerName';
import './players.css';

interface Props {
  players: { id: string; name: string; seat: number }[];
  hostId: string;
  userId: string;
  connectedIds: Set<string>;
  /** Current chips per player, when a game is running. */
  stacks?: Map<string, number>;
}

/** Everyone at the table, top left, one per line. The host carries a gold HOST tag. */
export function PlayerList({ players, hostId, userId, connectedIds, stacks }: Props) {
  const ordered = [...players].sort((a, b) => (a.id === hostId ? -1 : b.id === hostId ? 1 : a.seat - b.seat));
  return (
    <section className="player-list">
      <h2 className="player-list__title"><IconUsers size={16} />Players</h2>
      <ul className="player-list__items">
        {ordered.map((player) => (
          <li key={player.id} className={`player-list__item ${player.id === userId ? 'player-list__item--you' : ''}`}>
            <div className="player-list__row">
              <span className={`status-dot status-dot--${connectedIds.has(player.id) ? 'active' : 'waiting'}`} />
              <span className="player-list__name"><PlayerName name={player.name} seatIndex={player.seat} /></span>
              {player.id === hostId && <span className="host-tag">Host</span>}
            </div>
            {stacks?.has(player.id) && <span className="player-list__stack">{money(stacks.get(player.id) as number)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

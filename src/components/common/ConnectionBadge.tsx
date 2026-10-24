import type { ConnectionState } from '../../types/room';

const LABELS: Record<ConnectionState, string> = {
  connecting: 'Connecting…',
  online: 'Connected',
  offline: 'Reconnecting…',
};

export function ConnectionBadge({ state }: { state: ConnectionState }) {
  return (
    <span className={`connection-badge connection-badge--${state}`}>
      <span className="status-dot" />
      {LABELS[state]}
    </span>
  );
}

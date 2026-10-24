import { useState } from 'react';
import { api } from '../../lib/api';
import { goToRoom } from '../../lib/router';
import { IconArrowRight, IconPlus } from '../common/Icons';

export function CreateRoomForm({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    setError('');
    if (!name.trim()) return setError('Enter your name first');
    setBusy(true);
    try {
      const { roomId } = await api.createRoom(name);
      goToRoom(roomId);
    } catch (problem) {
      setError((problem as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="landing__choice-wrap">
      <button className="landing__choice landing__choice--primary" disabled={busy} onClick={create}>
        <span className="landing__choice-icon"><IconPlus size={22} /></span>
        <span className="landing__choice-text">
          <strong>{busy ? 'Creating your table…' : 'Create a table'}</strong>
          <small>Host a private game and send the invite link</small>
        </span>
        <IconArrowRight className="landing__choice-arrow" />
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

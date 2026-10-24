import { FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { goToRoom } from '../../lib/router';
import { IconArrowRight, IconEnter } from '../common/Icons';

interface Props {
  name: string;
  initialCode?: string;
}

export function JoinRoomForm({ name, initialCode = '' }: Props) {
  const [open, setOpen] = useState(Boolean(initialCode));
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const join = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!name.trim()) return setError('Enter your name first');
    if (code.trim().length < 4) return setError('Enter the room code');
    setBusy(true);
    try {
      const { roomId } = await api.joinRoom(code, name);
      goToRoom(roomId);
    } catch (problem) {
      setError((problem as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="landing__choice-wrap">
      {!open ? (
        <button className="landing__choice" onClick={() => setOpen(true)}>
          <span className="landing__choice-icon"><IconEnter size={22} /></span>
          <span className="landing__choice-text">
            <strong>Join a table</strong>
            <small>Use the code or link your host sent you</small>
          </span>
          <IconArrowRight className="landing__choice-arrow" />
        </button>
      ) : (
        <form className="landing__choice landing__choice--open" onSubmit={join}>
          <span className="landing__choice-icon"><IconEnter size={22} /></span>
          <input
            className="landing__code-input"
            value={code}
            maxLength={8}
            autoFocus
            placeholder="ROOM CODE"
            autoCapitalize="characters"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          <button className="button button--primary" type="submit" disabled={busy}>
            {busy ? 'Joining…' : 'Join'}
          </button>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

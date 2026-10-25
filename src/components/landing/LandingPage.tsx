import { useState } from 'react';
import { AmbientFlakes } from '../common/AmbientFlakes';
import { CreateRoomForm } from './CreateRoomForm';
import { JoinRoomForm } from './JoinRoomForm';
import './landing.css';

const NAME_KEY = 'poker-display-name';

export function LandingPage({ joinCode }: { joinCode?: string }) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      return '';
    }
  });

  const updateName = (value: string) => {
    setName(value);
    try {
      localStorage.setItem(NAME_KEY, value);
    } catch {
      /* ignore */
    }
  };

  return (
    <main className="landing">
      <AmbientFlakes />
      <div className="landing__content">
        <p className="landing__eyebrow">Private room &middot; By invitation only</p>
        <h1 className="landing__title">პოკერი კედლისქუჩაზე</h1>
        <p className="landing__subtitle">A quiet table for friends. Good cards, good company.</p>

        <div className="landing__name">
          <label className="field-label" htmlFor="display-name">Your name at the table</label>
          <input
            id="display-name"
            className="landing__name-input"
            value={name}
            maxLength={16}
            placeholder="Enter your name"
            autoComplete="nickname"
            onChange={(event) => updateName(event.target.value)}
          />
        </div>

        <div className="landing__choices">
          <CreateRoomForm name={name} />
          <JoinRoomForm name={name} initialCode={joinCode} />
        </div>
      </div>
    </main>
  );
}

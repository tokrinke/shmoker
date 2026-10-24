import { useEffect, useState } from 'react';
import type { GameSettings as Settings } from '@engine';
import { money } from '../../lib/format';
import { IconLock } from '../common/Icons';

interface Props {
  settings: Settings;
  editable: boolean;
  onSave: (settings: Partial<Settings>) => Promise<void>;
}

const FIELDS: { key: 'startingStack' | 'smallBlind' | 'bigBlind' | 'turnSeconds'; label: string; format: (value: number) => string }[] = [
  { key: 'startingStack', label: 'Starting balance', format: money },
  { key: 'smallBlind', label: 'Small blind', format: money },
  { key: 'bigBlind', label: 'Big blind', format: money },
  { key: 'turnSeconds', label: 'Turn time', format: (value) => `${value}s` },
];

export function GameSettings({ settings, editable, onSave }: Props) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const changed = FIELDS.some(({ key }) => draft[key] !== settings[key]);

  return (
    <div className={`game-settings ${editable ? '' : 'game-settings--locked'}`}>
      <div className="game-settings__header">
        <p className="field-label">Game settings</p>
        {!editable && (
          <span className="game-settings__lock"><IconLock size={14} />Set by the host</span>
        )}
      </div>

      <div className="game-settings__grid">
        {FIELDS.map(({ key, label, format }) =>
          editable ? (
            <label key={key} className="game-settings__field">
              <span className="game-settings__label">{label}</span>
              <input
                className="text-input"
                type="number"
                min={1}
                value={draft[key]}
                onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })}
              />
            </label>
          ) : (
            <div key={key} className="game-settings__field game-settings__field--static">
              <span className="game-settings__label">{label}</span>
              <span className="game-settings__value">{format(settings[key])}</span>
            </div>
          ),
        )}
      </div>

      {editable && changed && (
        <button className="button button--small game-settings__save" onClick={() => onSave(draft)}>
          Save settings
        </button>
      )}
    </div>
  );
}

import type { PlayerAction, GameSettings } from '@engine';
import { supabase } from './supabase';

/** Calls the single "poker" Edge Function and turns server errors into readable messages. */
async function call<T = { serverTime: number }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('poker', { body });
  if (error) {
    let message = 'Could not reach the game server. Check your connection and try again.';
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') {
      try {
        const payload = await response.json();
        if (payload?.error) message = payload.error;
      } catch {
        /* keep the default message */
      }
    }
    throw new Error(message);
  }
  return data as T;
}

type Settings = Partial<GameSettings>;

export const api = {
  createRoom: (name: string, settings?: Settings) =>
    call<{ roomId: string; code: string; serverTime: number }>({ action: 'create', name, settings }),
  joinRoom: (code: string, name: string) =>
    call<{ roomId: string; serverTime: number }>({ action: 'join', code, name }),
  updateSettings: (roomId: string, settings: Settings) => call({ action: 'settings', roomId, settings }),
  startGame: (roomId: string) => call({ action: 'start', roomId }),
  act: (roomId: string, seq: number, action: PlayerAction) =>
    call({ action: 'act', roomId, seq, action_data: action }),
  tick: (roomId: string) => call<{ changed: boolean; serverTime: number }>({ action: 'tick', roomId }),
  sitIn: (roomId: string) => call({ action: 'sit_in', roomId }),
  leave: (roomId: string) => call({ action: 'leave', roomId }),
  backToLobby: (roomId: string) => call({ action: 'reset', roomId }),
};

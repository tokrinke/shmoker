import type { Card, GameSettings, PublicGameView } from '@engine';

/** What the server publishes for a room (see supabase/functions/poker/index.ts -> publish). */
export interface RoomView {
  serverTime: number;
  room: {
    id: string;
    code: string;
    status: 'lobby' | 'playing';
    hostId: string;
    settings: GameSettings;
    maxPlayers: number;
  };
  players: { id: string; name: string; seat: number }[];
  log: { time: number; text: string }[];
  game: PublicGameView | null;
}

export interface PrivateHand {
  handNumber: number;
  cards: Card[];
}

export type ConnectionState = 'connecting' | 'online' | 'offline';

import type { Card } from './cards.ts';

export interface GameSettings {
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  turnSeconds: number;
  /** Pause between the end of a hand and the next deal. */
  nextHandDelaySeconds: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  startingStack: 500,
  smallBlind: 5,
  bigBlind: 10,
  turnSeconds: 25,
  nextHandDelaySeconds: 6,
};

export interface Seat {
  id: string;
  name: string;
  seatIndex: number;
  stack: number;
  /** Chips put in during the current betting round. */
  bet: number;
  /** Chips put in during the whole hand. */
  totalBet: number;
  folded: boolean;
  allIn: boolean;
  /** Has acted since the last full raise (so may not re-raise after a short all-in). */
  hasActed: boolean;
  cards: Card[];
  eliminated: boolean;
  /** Missed two turns in a row: acts automatically (fast) until they sit back in. */
  away: boolean;
  timeouts: number;
  left: boolean;
}

export type Phase = 'preflop' | 'flop' | 'turn' | 'river' | 'handover' | 'gameover';

export interface LogEntry {
  time: number;
  text: string;
}

export interface PotResult {
  amount: number;
  eligibleIds: string[];
  winnerIds: string[];
}

export interface HandResult {
  handNumber: number;
  pots: PotResult[];
  payouts: { playerId: string; amount: number; handName?: string }[];
  /** Cards that are shown at showdown (empty when everybody else folded). */
  reveals: Record<string, { cards: Card[]; handName: string }>;
  uncalled?: { playerId: string; amount: number };
  endedByFold: boolean;
}

/** Full authoritative state. Contains the deck and hole cards: NEVER send this to a browser. */
export interface GameState {
  settings: GameSettings;
  seats: Seat[];
  handNumber: number;
  phase: Phase;
  dealerIndex: number;
  deck: Card[];
  community: Card[];
  currentBet: number;
  minRaise: number;
  lastFullRaiseTo: number;
  toActIndex: number;
  /** Increments on every state change; clients send it with each action to reject stale/duplicate requests. */
  actionSeq: number;
  deadline: number | null;
  nextHandAt: number | null;
  /** All-in runout: when the next street (or the showdown) is due. Null when not running out. */
  runoutAt: number | null;
  /** True once no more betting is possible and the remaining players' cards are turned face up. */
  exposed: boolean;
  result: HandResult | null;
  winnerId: string | null;
  log: LogEntry[];
}

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface PlayerAction {
  type: ActionType;
  /** For bet/raise: the TOTAL amount to bet this round ("raise to"). */
  amount?: number;
}

export class EngineError extends Error {}

// ---- What browsers are allowed to see -------------------------------------------------------

export interface PublicSeat {
  id: string;
  name: string;
  seatIndex: number;
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  hasActed: boolean;
  away: boolean;
  eliminated: boolean;
  left: boolean;
  /** True when this player holds cards (the cards themselves are not included). */
  hasCards: boolean;
}

export interface PublicPot {
  amount: number;
  eligibleIds: string[];
}

export interface PublicGameView {
  handNumber: number;
  phase: Phase;
  dealerId: string | null;
  toActId: string | null;
  deadline: number | null;
  nextHandAt: number | null;
  runoutAt: number | null;
  /** Hole cards that are public right now (only during an all-in runout). */
  reveals: Record<string, Card[]>;
  currentBet: number;
  minRaise: number;
  bigBlind: number;
  pot: number;
  pots: PublicPot[];
  community: Card[];
  actionSeq: number;
  seats: PublicSeat[];
  result: HandResult | null;
  winnerId: string | null;
  settings: GameSettings;
}

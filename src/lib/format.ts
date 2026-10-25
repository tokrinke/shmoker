import type { PublicGameView } from '@engine';

/** Chip amounts are always shown with a dollar sign: money(1180) -> "$1,180". */
export const money = (amount: number): string => `$${Math.round(amount).toLocaleString('en-US')}`;

/** How long to wait (ms) before counting a winner's balance up, so it lands after the chips fly over. */
export const WIN_COUNT_DELAY = 750;

/** True while the hand result is on screen and this player won something. */
export const wonThisHand = (game: PublicGameView, playerId: string): boolean =>
  game.toActId === null && !!game.result?.payouts.some((payout) => payout.playerId === playerId);

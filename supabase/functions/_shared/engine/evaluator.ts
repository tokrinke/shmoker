import { Card, rankOf, suitOf } from './cards.ts';

export const HAND_NAMES = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
] as const;

export interface HandScore {
  /** Higher is better. Equal scores split the pot. */
  score: number;
  /** 0 (high card) .. 8 (straight flush) */
  category: number;
  /** Human readable, e.g. "Full House" or "Royal Flush" */
  name: string;
}

const BASE = 15; // ranks go up to 14, so base 15 gives every kicker its own "digit"

/** Score exactly five cards: category in the top digit, then tiebreak ranks. */
function scoreFiveCards(cards: Card[]): number {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const isFlush = cards.every((card) => suitOf(card) === suitOf(cards[0]));

  const unique = [...new Set(ranks)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique[0] === 14 && unique[1] === 5) straightHigh = 5; // A-2-3-4-5 ("wheel")
  }

  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  // Group by count (quads/trips/pairs first), then by rank.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map((group) => group[1]).join('');

  let category = 0;
  let tiebreak = groups.map((group) => group[0]);
  if (straightHigh && isFlush) {
    category = 8;
    tiebreak = [straightHigh];
  } else if (shape === '41') category = 7;
  else if (shape === '32') category = 6;
  else if (isFlush) category = 5;
  else if (straightHigh) {
    category = 4;
    tiebreak = [straightHigh];
  } else if (shape === '311') category = 3;
  else if (shape === '221') category = 2;
  else if (shape === '2111') category = 1;

  let score = category;
  for (let i = 0; i < 5; i++) score = score * BASE + (tiebreak[i] ?? 0);
  return score;
}

/** Best five-card hand out of 5 to 7 cards. */
export function evaluateHand(cards: Card[]): HandScore {
  if (cards.length < 5 || cards.length > 7) throw new Error('A hand needs 5 to 7 cards');

  let best = -1;
  const pick: Card[] = [];
  const choose = (start: number) => {
    if (pick.length === 5) {
      best = Math.max(best, scoreFiveCards(pick));
      return;
    }
    for (let i = start; i < cards.length; i++) {
      pick.push(cards[i]);
      choose(i + 1);
      pick.pop();
    }
  };
  choose(0);

  const category = Math.floor(best / BASE ** 5);
  const highestTiebreak = Math.floor(best / BASE ** 4) % BASE;
  const name = category === 8 && highestTiebreak === 14 ? 'Royal Flush' : HAND_NAMES[category];
  return { score: best, category, name };
}

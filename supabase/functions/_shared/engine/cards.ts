// Cards are plain strings: rank character + suit character, e.g. "As" (ace of spades), "Td" (ten of diamonds).
export type Card = string;
export type Suit = 's' | 'h' | 'd' | 'c';

export const RANK_CHARS = '23456789TJQKA';
export const SUITS: Suit[] = ['s', 'h', 'd', 'c'];

/** 2..14 (ace = 14) */
export const rankOf = (card: Card): number => RANK_CHARS.indexOf(card[0]) + 2;
export const suitOf = (card: Card): Suit => card[1] as Suit;

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANK_CHARS) deck.push(rank + suit);
  return deck;
}

export type RandomInt = (maxExclusive: number) => number;

/** Cryptographically secure random integer in [0, maxExclusive) without modulo bias. */
export function secureRandomInt(maxExclusive: number): number {
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % maxExclusive;
}

/** Fisher-Yates shuffle. Returns a new array. */
export function shuffle(deck: Card[], randomInt: RandomInt = secureRandomInt): Card[] {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const SUIT_SYMBOLS: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

/** "Td" -> "10♦" (used in log messages and the UI) */
export function cardLabel(card: Card): string {
  const rank = card[0] === 'T' ? '10' : card[0];
  return rank + SUIT_SYMBOLS[suitOf(card)];
}

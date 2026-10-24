// Every seat gets its own small suit mark in a muted jewel tone, shown before the player's name.
const MARKS = [
  { glyph: '\u2660', color: '#e0c07f' }, // spade, champagne
  { glyph: '\u2665', color: '#d4666f' }, // heart, ruby
  { glyph: '\u2666', color: '#6a9be0' }, // diamond, sapphire
  { glyph: '\u2663', color: '#58b88b' }, // club, emerald
  { glyph: '\u2666', color: '#a688e0' }, // diamond, amethyst
  { glyph: '\u2665', color: '#d99a5b' }, // heart, amber
];

export const playerMark = (seatIndex: number) => MARKS[seatIndex % MARKS.length];

// Which of the six slots (see styles/seat-positions.css) are used for N players.
// Slots go clockwise starting at the bottom: 0 bottom, 1 left-low, 2 left-high, 3 top, 4 right-high, 5 right-low.
export const SLOTS_BY_PLAYER_COUNT: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 5],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
};

/** Orders seats clockwise starting with the viewer (always at the bottom) and gives each a slot. */
export function assignSlots<T extends { id: string; seatIndex: number }>(seats: T[], viewerId: string) {
  const ordered = [...seats].sort((a, b) => a.seatIndex - b.seatIndex);
  const viewerPosition = Math.max(0, ordered.findIndex((seat) => seat.id === viewerId));
  const rotated = [...ordered.slice(viewerPosition), ...ordered.slice(0, viewerPosition)];
  const slots = SLOTS_BY_PLAYER_COUNT[rotated.length] ?? SLOTS_BY_PLAYER_COUNT[6];
  return rotated.map((seat, index) => ({ seat, slot: slots[index] }));
}

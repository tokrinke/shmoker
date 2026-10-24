import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Card,
  GameSettings,
  GameState,
  PlayerAction,
  bettingContext,
  buildPots,
  createDeck,
  createGame,
  getLegalActions,
  markLeft,
  applyAction,
  privateCards,
  publicView,
  startHand,
  tick,
  EngineError,
  presetRaiseTo,
} from '../supabase/functions/_shared/engine/index.ts';

// ---- helpers ----------------------------------------------------------------------------------

const SETTINGS: GameSettings = { startingStack: 500, smallBlind: 5, bigBlind: 10, turnSeconds: 25, nextHandDelaySeconds: 6 };
const NOW = 1_000_000;

function newGame(count: number, settings: Partial<GameSettings> = {}, stacks?: number[]): GameState {
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `P${i}`, seatIndex: i }));
  const state = createGame(players, { ...SETTINGS, ...settings });
  stacks?.forEach((stack, i) => (state.seats[i].stack = stack));
  return state;
}

/** Build a deck that deals exactly these cards (holes keyed by seat index) to a game where nobody is eliminated. */
function rig(state: GameState, holes: Record<number, [Card, Card]>, board: Card[]): Card[] {
  const count = state.seats.length;
  const dealer = (state.dealerIndex + 1) % count;
  const order = Array.from({ length: count }, (_, step) => (dealer + 1 + step) % count);
  const used = new Set<Card>([...board, ...Object.values(holes).flat()]);
  const spare = createDeck().filter((card) => !used.has(card));
  const burn = () => spare.pop() as Card;
  return [
    ...order.map((i) => holes[i][0]),
    ...order.map((i) => holes[i][1]),
    burn(), board[0], board[1], board[2],
    burn(), board[3],
    burn(), board[4],
    ...spare,
  ];
}

const begin = (state: GameState, holes: Record<number, [Card, Card]>, board: Card[]) =>
  startHand(state, undefined, NOW, rig(state, holes, board));

const act = (state: GameState, id: string, action: PlayerAction) => applyAction(state, id, action, NOW);
const toActId = (state: GameState) => state.seats[state.toActIndex].id;
const seat = (state: GameState, id: string) => state.seats.find((s) => s.id === id)!;
const totalChips = (state: GameState) => state.seats.reduce((sum, s) => sum + s.stack + s.totalBet, 0);

function checkDown(state: GameState): GameState {
  while (state.toActIndex >= 0 && state.phase !== 'handover') state = act(state, toActId(state), { type: 'check' });
  return state;
}

const BLANK_BOARD: Card[] = ['2c', '7d', '9h', 'Js', '4d'];

// ---- blinds, dealer, order -----------------------------------------------------------------------

test('blinds are posted and the dealer button rotates', () => {
  let state = begin(newGame(3), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] }, BLANK_BOARD);
  assert.equal(state.seats[state.dealerIndex].id, 'p0');
  assert.equal(seat(state, 'p1').bet, 5, 'small blind');
  assert.equal(seat(state, 'p2').bet, 10, 'big blind');
  assert.equal(toActId(state), 'p0', 'under the gun acts first');
  assert.equal(state.phase, 'preflop');

  state = act(state, 'p0', { type: 'fold' });
  assert.equal(toActId(state), 'p1');
  state = act(state, 'p1', { type: 'fold' });

  // BB wins; his own extra blind chips are returned as uncalled
  assert.equal(state.phase, 'handover');
  assert.equal(seat(state, 'p2').stack, 505);
  assert.equal(seat(state, 'p1').stack, 495);
  assert.equal(seat(state, 'p0').stack, 500);
  assert.equal(state.result?.uncalled?.amount, 5);

  const next = tick(state, state.nextHandAt!).state;
  assert.equal(next.handNumber, 2);
  assert.equal(next.seats[next.dealerIndex].id, 'p1');
  assert.equal(next.seats[next.toActIndex].id, 'p1', 'UTG is the dealer in a 3-handed game after the rotation');
  assert.equal(seat(next, 'p2').bet, 5);
  assert.equal(seat(next, 'p0').bet, 10);
});

test('heads-up: dealer is the small blind and acts first before the flop, last after it', () => {
  let state = begin(newGame(2), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'] }, BLANK_BOARD);
  assert.equal(seat(state, 'p0').bet, 5);
  assert.equal(seat(state, 'p1').bet, 10);
  assert.equal(toActId(state), 'p0');
  state = act(state, 'p0', { type: 'call' });
  assert.equal(toActId(state), 'p1', 'big blind gets the option');
  state = act(state, 'p1', { type: 'check' });
  assert.equal(state.phase, 'flop');
  assert.equal(state.community.length, 3);
  assert.equal(toActId(state), 'p1', 'non-dealer acts first after the flop');
});

test('streets are dealt in order: 3, 4, 5 community cards', () => {
  let state = begin(newGame(2), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'] }, BLANK_BOARD);
  assert.equal(state.community.length, 0);
  state = act(state, 'p0', { type: 'call' });
  state = act(state, 'p1', { type: 'check' });
  assert.deepEqual(state.community, ['2c', '7d', '9h']);
  state = act(state, 'p1', { type: 'check' });
  state = act(state, 'p0', { type: 'check' });
  assert.deepEqual(state.community, ['2c', '7d', '9h', 'Js']);
  state = act(state, 'p1', { type: 'check' });
  state = act(state, 'p0', { type: 'check' });
  assert.deepEqual(state.community, BLANK_BOARD);
  assert.equal(state.phase, 'river');
});

// ---- validation -----------------------------------------------------------------------------------

test('out-of-turn and duplicate actions are rejected', () => {
  let state = begin(newGame(3), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] }, BLANK_BOARD);
  assert.throws(() => act(state, 'p1', { type: 'call' }), EngineError);
  assert.throws(() => act(state, 'nobody', { type: 'call' }), EngineError);
  state = act(state, 'p0', { type: 'call' });
  assert.throws(() => act(state, 'p0', { type: 'call' }), /not your turn/); // network retry of the same action
});

test('cannot check when facing a bet; cannot call when there is nothing to call', () => {
  const state = begin(newGame(3), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] }, BLANK_BOARD);
  assert.throws(() => act(state, 'p0', { type: 'check' }), /cannot check/);
  let later = act(state, 'p0', { type: 'call' });
  later = act(later, 'p1', { type: 'call' });
  assert.throws(() => act(later, 'p2', { type: 'call' }), /nothing to call/);
});

test('minimum raise, invalid amounts and stack limits are enforced', () => {
  let state = begin(newGame(3), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] }, BLANK_BOARD);
  assert.throws(() => act(state, 'p0', { type: 'raise', amount: 15 }), /minimum raise is to 20/);
  assert.throws(() => act(state, 'p0', { type: 'raise', amount: -50 }), EngineError);
  assert.throws(() => act(state, 'p0', { type: 'raise', amount: 12.5 }), EngineError);
  assert.throws(() => act(state, 'p0', { type: 'raise', amount: Number.NaN }), EngineError);
  assert.throws(() => act(state, 'p0', { type: 'raise', amount: 501 }), /do not have/);
  assert.throws(() => act(state, 'p0', { type: 'bet', amount: 50 }), /use raise/);
  state = act(state, 'p0', { type: 'raise', amount: 20 });
  assert.equal(state.minRaise, 10);
  assert.throws(() => act(state, 'p1', { type: 'raise', amount: 29 }), /minimum raise is to 30/);
  state = act(state, 'p1', { type: 'raise', amount: 40 });
  assert.equal(state.minRaise, 20, 'min raise grows with the last raise');
  assert.throws(() => act(state, 'p2', { type: 'raise', amount: 59 }), /minimum raise is to 60/);
});

test('post-flop bet must be at least the big blind and "raise" is not allowed with no bet', () => {
  let state = begin(newGame(2), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'] }, BLANK_BOARD);
  state = act(state, 'p0', { type: 'call' });
  state = act(state, 'p1', { type: 'check' });
  assert.throws(() => act(state, 'p1', { type: 'bet', amount: 5 }), /minimum bet is to 10/);
  assert.throws(() => act(state, 'p1', { type: 'raise', amount: 20 }), /use bet/);
  state = act(state, 'p1', { type: 'bet', amount: 20 });
  assert.equal(state.currentBet, 20);
  assert.equal(state.minRaise, 20);
});

test('legal-action helper and pot presets', () => {
  const state = begin(newGame(3), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] }, BLANK_BOARD);
  const ctx = bettingContext(state);
  const legal = getLegalActions(ctx, 'p0');
  assert.equal(legal.isYourTurn, true);
  assert.equal(legal.canCheck, false);
  assert.equal(legal.callAmount, 10);
  assert.equal(legal.minRaiseTo, 20);
  assert.equal(legal.maxRaiseTo, 500);
  assert.equal(getLegalActions(ctx, 'p1').isYourTurn, false);
  // pot is 15 (5 + 10). Pot-sized raise: call 10, then raise by pot + call (15 + 10) -> raise to 35
  assert.equal(presetRaiseTo(ctx, 'p0', 1), 35);
  assert.equal(presetRaiseTo(ctx, 'p0', 0.01), 20, 'clamped to the minimum raise');
});

// ---- all-ins, reopening, side pots ---------------------------------------------------------------

test('a short all-in raise does not reopen the betting for players who already acted', () => {
  let state = begin(newGame(3, {}, [500, 35, 500]), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] }, BLANK_BOARD);
  state = act(state, 'p0', { type: 'raise', amount: 30 }); // full raise by 20
  state = act(state, 'p1', { type: 'allin' }); // total 35: only +5, not a full raise
  assert.equal(state.currentBet, 35);
  assert.equal(state.minRaise, 20);
  assert.equal(toActId(state), 'p2', 'big blind has not acted since the full raise and may still raise');
  assert.equal(getLegalActions(bettingContext(state), 'p2').canRaise, true);
  state = act(state, 'p2', { type: 'call' });
  assert.equal(toActId(state), 'p0');
  const legal = getLegalActions(bettingContext(state), 'p0');
  assert.equal(legal.canRaise, false);
  assert.equal(legal.canAllIn, false);
  assert.equal(legal.callAmount, 5);
  assert.throws(() => act(state, 'p0', { type: 'raise', amount: 100 }), /not reopened/);
  assert.throws(() => act(state, 'p0', { type: 'allin' }), /not reopened/);
  state = act(state, 'p0', { type: 'call' });
  assert.equal(state.phase, 'flop');
});

test('a full all-in raise reopens the betting', () => {
  let state = begin(newGame(3, {}, [500, 500, 500]), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] }, BLANK_BOARD);
  state = act(state, 'p0', { type: 'raise', amount: 30 });
  state = act(state, 'p1', { type: 'call' });
  state = act(state, 'p2', { type: 'raise', amount: 100 });
  assert.equal(toActId(state), 'p0');
  assert.equal(getLegalActions(bettingContext(state), 'p0').canRaise, true);
});

test('side pots: three players all-in for different amounts, each pot goes to the right winner', () => {
  let state = begin(
    newGame(3, {}, [100, 300, 500]),
    { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] },
    BLANK_BOARD,
  );
  state = act(state, 'p0', { type: 'allin' });
  state = act(state, 'p1', { type: 'allin' });
  state = act(state, 'p2', { type: 'call' });
  assert.equal(state.phase, 'handover', 'board is run out automatically');
  assert.equal(state.community.length, 5);
  assert.deepEqual(state.result!.pots.map((p) => p.amount), [300, 400]);
  assert.deepEqual(state.result!.pots[0].eligibleIds, ['p0', 'p1', 'p2']);
  assert.deepEqual(state.result!.pots[1].eligibleIds, ['p1', 'p2']);
  assert.equal(seat(state, 'p0').stack, 300, 'aces win the main pot');
  assert.equal(seat(state, 'p1').stack, 400, 'kings win the side pot');
  assert.equal(seat(state, 'p2').stack, 200);
  assert.equal(totalChips(state), 900);
  assert.equal(state.seats.filter((s) => s.eliminated).length, 0);
});

test('uncalled bets are returned', () => {
  let state = begin(newGame(2, {}, [500, 40]), { 0: ['Ks', 'Kh'], 1: ['As', 'Ah'] }, BLANK_BOARD);
  state = act(state, 'p0', { type: 'raise', amount: 100 });
  state = act(state, 'p1', { type: 'allin' }); // can only call 40 in total
  assert.deepEqual(state.result?.uncalled, { playerId: 'p0', amount: 60 });
  assert.equal(seat(state, 'p1').stack, 80);
  assert.equal(seat(state, 'p0').stack, 460);
  assert.equal(totalChips(state), 540);
});

test('a big blind that cannot cover the blind is all-in and others still call the full blind', () => {
  let state = begin(newGame(3, {}, [500, 500, 4]), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] }, BLANK_BOARD);
  assert.equal(seat(state, 'p2').allIn, true);
  assert.equal(seat(state, 'p2').bet, 4);
  assert.equal(state.currentBet, 10);
  state = act(state, 'p0', { type: 'call' });
  state = act(state, 'p1', { type: 'call' });
  assert.equal(state.phase, 'flop');
  assert.equal(totalChips(state), 1004);
});

test('buildPots merges equal eligibility and ignores chips of folded players for eligibility', () => {
  const pots = buildPots([
    { id: 'a', totalBet: 50, folded: true, eliminated: false },
    { id: 'b', totalBet: 100, folded: false, eliminated: false },
    { id: 'c', totalBet: 100, folded: false, eliminated: false },
  ]);
  assert.deepEqual(pots, [{ amount: 250, eligibleIds: ['b', 'c'] }]);
});

// ---- showdown ----------------------------------------------------------------------------------------

test('split pot: identical best hands share the pot', () => {
  let state = begin(
    newGame(2),
    { 0: ['2c', '3d'], 1: ['4c', '5d'] },
    ['As', 'Ks', 'Qs', 'Js', 'Ts'],
  );
  state = act(state, 'p0', { type: 'call' });
  state = act(state, 'p1', { type: 'check' });
  state = checkDown(state);
  assert.equal(state.phase, 'handover');
  assert.equal(seat(state, 'p0').stack, 500);
  assert.equal(seat(state, 'p1').stack, 500);
  assert.deepEqual(state.result!.pots[0].winnerIds.sort(), ['p0', 'p1']);
});

test('odd chip in a split pot goes to the winner closest to the left of the dealer', () => {
  let state = begin(
    newGame(3, { smallBlind: 1, bigBlind: 3 }),
    { 0: ['2c', '3d'], 1: ['Ac', '5d'], 2: ['As', '6d'] },
    ['9s', '9d', '4c', '4h', 'Kd'],
  );
  state = act(state, 'p0', { type: 'call' });
  state = act(state, 'p1', { type: 'call' });
  state = act(state, 'p2', { type: 'check' });
  state = checkDown(state);
  assert.equal(state.result!.pots[0].amount, 9);
  assert.equal(seat(state, 'p1').stack, 500 - 3 + 5, 'first clockwise from the dealer gets the extra chip');
  assert.equal(seat(state, 'p2').stack, 500 - 3 + 4);
  assert.equal(seat(state, 'p0').stack, 497);
  assert.equal(totalChips(state), 1500);
});

test('folded players never win and their cards are not revealed', () => {
  let state = begin(newGame(3), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] }, BLANK_BOARD);
  state = act(state, 'p0', { type: 'fold' });
  state = act(state, 'p1', { type: 'call' });
  state = act(state, 'p2', { type: 'check' });
  state = checkDown(state);
  assert.deepEqual(Object.keys(state.result!.reveals).sort(), ['p1', 'p2']);
  assert.equal(seat(state, 'p1').stack, 510, 'kings beat queens');
  assert.equal(seat(state, 'p0').stack, 500);
});

test('players eliminated at zero chips; game ends with a winner', () => {
  let state = begin(newGame(2), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'] }, BLANK_BOARD);
  state = act(state, 'p0', { type: 'allin' });
  state = act(state, 'p1', { type: 'call' });
  assert.equal(state.phase, 'gameover');
  assert.equal(state.winnerId, 'p0');
  assert.equal(seat(state, 'p1').eliminated, true);
  assert.equal(seat(state, 'p0').stack, 1000);
  assert.equal(tick(state, NOW + 10 ** 9).changed, false);
});

// ---- timers, leaving ---------------------------------------------------------------------------------------

test('turn timeout: folds when facing a bet, checks when free; nothing happens early', () => {
  let state = begin(newGame(3), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] }, BLANK_BOARD);
  assert.equal(state.deadline, NOW + 25_000);
  assert.equal(tick(state, NOW + 24_999).changed, false);
  const folded = tick(state, NOW + 25_000);
  assert.equal(folded.changed, true);
  assert.equal(seat(folded.state, 'p0').folded, true);
  assert.equal(toActId(folded.state), 'p1');
  assert.equal(folded.state.deadline, NOW + 25_000 + 25_000);

  state = act(state, 'p0', { type: 'call' });
  state = act(state, 'p1', { type: 'call' });
  assert.equal(toActId(state), 'p2');
  const checked = tick(state, NOW + 25_000);
  assert.equal(seat(checked.state, 'p2').folded, false);
  assert.equal(checked.state.phase, 'flop');
});

test('two timeouts in a row mark a player away; acting clears it', () => {
  let state = begin(newGame(3), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] }, BLANK_BOARD);
  state.seats[0].timeouts = 1;
  state = tick(state, NOW + 30_000).state;
  assert.equal(seat(state, 'p0').away, true);
  // next hand: away player gets only a short turn
  const next = tick(finishQuickly(state), NOW + 100_000_000).state;
  assert.equal(next.handNumber, 2);
  const away = next.seats.find((s) => s.away)!;
  if (toActId(next) === away.id) assert.ok(next.deadline! - NOW - 100_000_000 <= 2_000);
});

function finishQuickly(state: GameState): GameState {
  while (state.phase !== 'handover' && state.phase !== 'gameover') {
    const id = toActId(state);
    state = act(state, id, { type: 'fold' });
  }
  return state;
}

test('leaving: folds on their turn, folds out of turn, and the last player standing wins', () => {
  let state = begin(newGame(3), { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] }, BLANK_BOARD);
  state = markLeft(state, 'p2', NOW); // not their turn
  assert.equal(seat(state, 'p2').folded, true);
  assert.equal(toActId(state), 'p0');
  state = markLeft(state, 'p0', NOW); // their turn: fold goes through the normal path
  assert.equal(state.phase, 'gameover', 'only p1 remains');
  assert.equal(state.winnerId, 'p1');
  assert.equal(totalChips(state), 1500);
});

// ---- privacy ---------------------------------------------------------------------------------------------------

test('the public view never contains the deck or hidden hole cards', () => {
  const holes: Record<number, [Card, Card]> = { 0: ['As', 'Ah'], 1: ['Ks', 'Kh'], 2: ['Qs', 'Qh'] };
  let state = begin(newGame(3), holes, BLANK_BOARD);
  state = act(state, 'p0', { type: 'call' });
  const json = JSON.stringify(publicView(state));
  for (const card of Object.values(holes).flat()) assert.ok(!json.includes(`"${card}"`), `${card} leaked`);
  assert.ok(!json.includes('deck'));
  assert.ok(!('cards' in publicView(state).seats[0]));
  assert.equal(publicView(state).seats[0].hasCards, true);
  // upcoming board cards are not leaked either
  assert.deepEqual(publicView(state).community, []);
  assert.deepEqual(privateCards(state).p1, ['Ks', 'Kh']);
});

// ---- chip accounting fuzz --------------------------------------------------------------------------------------

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('fuzz: chips are conserved and every game terminates (2-6 players, random stacks and actions)', () => {
  for (let game = 0; game < 400; game++) {
    const random = mulberry32(game + 1);
    const randomInt = (max: number) => Math.floor(random() * max);
    const count = 2 + randomInt(5);
    const stacks = Array.from({ length: count }, () => 20 + randomInt(600));
    const total = stacks.reduce((a, b) => a + b, 0);
    let state = newGame(count, {}, stacks);
    let now = NOW;
    state = startHand(state, randomInt, now);

    for (let step = 0; step < 4000 && state.phase !== 'gameover'; step++) {
      assert.equal(totalChips(state), total, `game ${game} step ${step}: chips changed`);
      if (state.phase === 'handover') {
        now = state.nextHandAt!;
        state = tick(state, now, randomInt).state;
        continue;
      }
      const id = toActId(state);
      const legal = getLegalActions(bettingContext(state), id);
      const roll = random();
      let action: PlayerAction;
      if (roll < 0.1) action = { type: 'fold' };
      else if (roll < 0.15 && legal.canAllIn) action = { type: 'allin' };
      else if (roll < 0.45 && legal.canRaise) {
        const amount = legal.minRaiseTo + randomInt(legal.maxRaiseTo - legal.minRaiseTo + 1);
        action = { type: legal.raiseKind, amount };
      } else if (roll < 0.5) {
        now = state.deadline!;
        state = tick(state, now, randomInt).state;
        continue;
      } else action = legal.canCheck ? { type: 'check' } : { type: 'call' };
      state = act(state, id, action);
      assert.ok(state.seats.every((s) => s.stack >= 0 && s.bet >= 0));
    }
    assert.equal(state.phase, 'gameover', `game ${game} did not finish`);
    assert.equal(totalChips(state), total);
    assert.equal(state.seats.filter((s) => s.stack > 0).length, 1, 'exactly one player has all the chips');
  }
});

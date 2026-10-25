import { Card, RandomInt, cardLabel, createDeck, secureRandomInt, shuffle } from './cards.ts';
import { evaluateHand, HandScore } from './evaluator.ts';
import {
  EngineError,
  GameSettings,
  GameState,
  HandResult,
  PlayerAction,
  PotResult,
  PublicGameView,
  Seat,
} from './types.ts';

const RUNOUT_STEP_MS = 2200; // pause before each street is dealt when everybody is all-in
const RUNOUT_FINAL_MS = 2800; // pause on the final board before the winner is announced
const AWAY_TURN_MS = 2000; // how long an "away" player gets before their turn is played automatically
const AWAY_AFTER_TIMEOUTS = 2;
const MAX_LOG_ENTRIES = 200;

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

const inHand = (seat: Seat) => !seat.eliminated && !seat.folded;
const isBetting = (phase: GameState['phase']) =>
  phase === 'preflop' || phase === 'flop' || phase === 'turn' || phase === 'river';
const chips = (n: number) => n.toLocaleString('en-US');

function addLog(state: GameState, text: string, now: number) {
  state.log.push({ time: now, text });
  if (state.log.length > MAX_LOG_ENTRIES) state.log.splice(0, state.log.length - MAX_LOG_ENTRIES);
}

/** Move chips from a stack into the current bet. Returns the amount actually paid. */
function commit(seat: Seat, amount: number): number {
  const paid = Math.min(amount, seat.stack);
  seat.stack -= paid;
  seat.bet += paid;
  seat.totalBet += paid;
  if (seat.stack === 0) seat.allIn = true;
  return paid;
}

/** Next seat index after `from` (wrapping) that satisfies `test`, or -1. */
function nextIndex(state: GameState, from: number, test: (seat: Seat) => boolean): number {
  const count = state.seats.length;
  for (let step = 1; step <= count; step++) {
    const index = (from + step) % count;
    if (test(state.seats[index])) return index;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------
// Creating a game and starting hands
// ---------------------------------------------------------------------------------------------

export function createGame(
  players: { id: string; name: string; seatIndex: number }[],
  settings: GameSettings,
): GameState {
  if (players.length < 2) throw new EngineError('At least two players are needed');
  const seats: Seat[] = [...players]
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((player) => ({
      id: player.id,
      name: player.name,
      seatIndex: player.seatIndex,
      stack: settings.startingStack,
      bet: 0,
      totalBet: 0,
      folded: true,
      allIn: false,
      hasActed: false,
      cards: [],
      eliminated: false,
      away: false,
      timeouts: 0,
      left: false,
    }));
  return {
    settings,
    seats,
    handNumber: 0,
    phase: 'handover',
    dealerIndex: seats.length - 1, // first hand moves the button to the first seat
    deck: [],
    community: [],
    currentBet: 0,
    minRaise: settings.bigBlind,
    lastFullRaiseTo: 0,
    toActIndex: -1,
    actionSeq: 0,
    deadline: null,
    nextHandAt: null,
    runoutAt: null,
    exposed: false,
    result: null,
    winnerId: null,
    log: [],
  };
}

/**
 * Deal a new hand. `deck` can be passed in for tests (first element is dealt first);
 * otherwise a freshly shuffled deck is used.
 */
export function startHand(
  state: GameState,
  randomInt: RandomInt = secureRandomInt,
  now: number = Date.now(),
  deck?: Card[],
): GameState {
  const s = structuredClone(state);

  for (const seat of s.seats) {
    if (seat.left || seat.stack <= 0) seat.eliminated = true;
  }
  const alive = s.seats.filter((seat) => !seat.eliminated);
  if (alive.length < 2) {
    s.phase = 'gameover';
    s.winnerId = alive[0]?.id ?? null;
    s.nextHandAt = null;
    s.actionSeq++;
    return s;
  }

  s.handNumber++;
  s.result = null;
  s.community = [];
  s.currentBet = s.settings.bigBlind;
  s.lastFullRaiseTo = s.settings.bigBlind;
  s.minRaise = s.settings.bigBlind;
  s.nextHandAt = null;
  s.runoutAt = null;
  s.exposed = false;
  for (const seat of s.seats) {
    seat.bet = 0;
    seat.totalBet = 0;
    seat.allIn = false;
    seat.hasActed = false;
    seat.cards = [];
    seat.folded = seat.eliminated;
  }

  s.dealerIndex = nextIndex(s, s.dealerIndex, (seat) => !seat.eliminated);
  const headsUp = alive.length === 2;
  const smallBlindIndex = headsUp ? s.dealerIndex : nextIndex(s, s.dealerIndex, (seat) => !seat.eliminated);
  const bigBlindIndex = nextIndex(s, smallBlindIndex, (seat) => !seat.eliminated);

  addLog(s, `Hand #${s.handNumber}: ${s.seats[s.dealerIndex].name} has the dealer button.`, now);
  postBlind(s, smallBlindIndex, s.settings.smallBlind, 'small', now);
  postBlind(s, bigBlindIndex, s.settings.bigBlind, 'big', now);

  s.deck = deck ? [...deck] : shuffle(createDeck(), randomInt);
  const dealOrder: Seat[] = [];
  for (let step = 1; step <= s.seats.length; step++) {
    const seat = s.seats[(s.dealerIndex + step) % s.seats.length];
    if (!seat.eliminated) dealOrder.push(seat);
  }
  for (let round = 0; round < 2; round++) {
    for (const seat of dealOrder) seat.cards.push(s.deck.shift() as Card);
  }

  s.phase = 'preflop';
  s.actionSeq++;
  progress(s, bigBlindIndex, now);
  return s;
}

function postBlind(s: GameState, index: number, amount: number, label: string, now: number) {
  const seat = s.seats[index];
  const paid = commit(seat, amount);
  addLog(s, `${seat.name} posted the ${label} blind (${chips(paid)}).`, now);
}

// ---------------------------------------------------------------------------------------------
// Betting round progression
// ---------------------------------------------------------------------------------------------

function beginTurn(s: GameState, now: number) {
  const seat = s.seats[s.toActIndex];
  s.deadline = now + (seat.away ? AWAY_TURN_MS : s.settings.turnSeconds * 1000);
}

/**
 * Called after every change. Decides whether the hand is over, the betting round is over
 * (deal the next street), or who acts next (searching clockwise after `from`).
 */
function progress(s: GameState, from: number, now: number) {
  for (;;) {
    const live = s.seats.filter(inHand);
    if (live.length === 1) {
      endByFold(s, live[0], now);
      return;
    }
    const canAct = live.filter((seat) => !seat.allIn);
    const roundSettled =
      canAct.length <= 1
        ? canAct.every((seat) => seat.bet >= s.currentBet) // nobody left to bet against
        : canAct.every((seat) => seat.hasActed && seat.bet === s.currentBet);

    if (!roundSettled) {
      s.toActIndex = nextIndex(
        s,
        from,
        (seat) => inHand(seat) && !seat.allIn && (!seat.hasActed || seat.bet < s.currentBet),
      );
      beginTurn(s, now);
      return;
    }
    if (canAct.length <= 1) {
      // Nobody can bet any more (everyone is all-in): show the cards and deal the rest slowly.
      startRunout(s, now);
      return;
    }
    if (s.phase === 'river') {
      showdown(s, now);
      return;
    }
    collectBets(s);
    dealNextStreet(s, now);
    from = s.dealerIndex; // after the flop the first active seat left of the button acts first
  }
}

/** Chips from the finished betting round go to the pot; the next round starts fresh. */
function collectBets(s: GameState) {
  for (const seat of s.seats) {
    seat.bet = 0;
    seat.hasActed = false;
  }
  s.currentBet = 0;
  s.lastFullRaiseTo = 0;
  s.minRaise = s.settings.bigBlind;
}

/** Everybody still in is all-in: turn the cards face up and let the board come out step by step. */
function startRunout(s: GameState, now: number) {
  collectBets(s);
  s.toActIndex = -1;
  s.deadline = null;
  s.exposed = true;
  addLog(s, 'No more betting. Cards are turned face up.', now);
  for (const seat of s.seats.filter(inHand)) {
    addLog(s, `${seat.name} shows ${seat.cards.map(cardLabel).join(' ')}.`, now);
  }
  s.runoutAt = now + (s.phase === 'river' ? RUNOUT_FINAL_MS : RUNOUT_STEP_MS);
}

/** One step of the runout: deal the next street, or finally decide the winner. */
function advanceRunout(s: GameState, now: number) {
  if (s.community.length < 5) {
    dealNextStreet(s, now);
    s.runoutAt = now + (s.community.length === 5 ? RUNOUT_FINAL_MS : RUNOUT_STEP_MS);
    s.actionSeq++;
  } else {
    s.runoutAt = null;
    showdown(s, now);
  }
}

function dealNextStreet(s: GameState, now: number) {
  s.deck.shift(); // burn card
  if (s.phase === 'preflop') {
    s.community.push(s.deck.shift() as Card, s.deck.shift() as Card, s.deck.shift() as Card);
    s.phase = 'flop';
    addLog(s, 'Flop dealt.', now);
  } else if (s.phase === 'flop') {
    s.community.push(s.deck.shift() as Card);
    s.phase = 'turn';
    addLog(s, 'Turn dealt.', now);
  } else if (s.phase === 'turn') {
    s.community.push(s.deck.shift() as Card);
    s.phase = 'river';
    addLog(s, 'River dealt.', now);
  }
}

// ---------------------------------------------------------------------------------------------
// Legal actions (shared by the server and the UI)
// ---------------------------------------------------------------------------------------------

export interface BettingContext {
  currentBet: number;
  minRaise: number;
  bigBlind: number;
  pot: number;
  toActId: string | null;
  seats: { id: string; stack: number; bet: number; hasActed: boolean }[];
}

export interface LegalActions {
  isYourTurn: boolean;
  stack: number;
  toCall: number;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  /** Chips needed to call (capped at your stack). */
  callAmount: number;
  canRaise: boolean;
  /** "bet" when nobody has bet yet this round, otherwise "raise". */
  raiseKind: 'bet' | 'raise';
  /** Smallest legal "raise to" total (or your all-in if it's smaller). */
  minRaiseTo: number;
  /** Largest "raise to" total = all-in. */
  maxRaiseTo: number;
  canAllIn: boolean;
}

const NO_ACTIONS: LegalActions = {
  isYourTurn: false,
  stack: 0,
  toCall: 0,
  canFold: false,
  canCheck: false,
  canCall: false,
  callAmount: 0,
  canRaise: false,
  raiseKind: 'bet',
  minRaiseTo: 0,
  maxRaiseTo: 0,
  canAllIn: false,
};

export function getLegalActions(ctx: BettingContext, playerId: string): LegalActions {
  const seat = ctx.seats.find((candidate) => candidate.id === playerId);
  if (!seat) return NO_ACTIONS;
  if (ctx.toActId !== playerId) return { ...NO_ACTIONS, stack: seat.stack };

  const toCall = Math.max(0, ctx.currentBet - seat.bet);
  const maxRaiseTo = seat.bet + seat.stack;
  const canRaise = !seat.hasActed && seat.stack > toCall;
  const smallestRaiseTo = ctx.currentBet === 0 ? ctx.bigBlind : ctx.currentBet + ctx.minRaise;
  return {
    isYourTurn: true,
    stack: seat.stack,
    toCall,
    canFold: true,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    callAmount: Math.min(toCall, seat.stack),
    canRaise,
    raiseKind: ctx.currentBet === 0 ? 'bet' : 'raise',
    minRaiseTo: Math.min(smallestRaiseTo, maxRaiseTo),
    maxRaiseTo,
    canAllIn: seat.stack > 0 && (canRaise || seat.stack <= toCall),
  };
}

/** Pot-fraction bet sizing for the UI presets (0.5 = half pot, 1 = pot). Clamped to the legal range. */
export function presetRaiseTo(ctx: BettingContext, playerId: string, fraction: number): number {
  const legal = getLegalActions(ctx, playerId);
  const seat = ctx.seats.find((candidate) => candidate.id === playerId);
  if (!seat || !legal.canRaise) return 0;
  const target = seat.bet + legal.toCall + Math.round(fraction * (ctx.pot + legal.toCall));
  return Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, target));
}

export function bettingContext(state: GameState): BettingContext {
  return {
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    bigBlind: state.settings.bigBlind,
    pot: totalPot(state),
    toActId: isBetting(state.phase) && state.toActIndex >= 0 ? state.seats[state.toActIndex].id : null,
    seats: state.seats,
  };
}

const totalPot = (state: GameState) => state.seats.reduce((sum, seat) => sum + seat.totalBet, 0);

// ---------------------------------------------------------------------------------------------
// Applying actions
// ---------------------------------------------------------------------------------------------

export function applyAction(
  state: GameState,
  playerId: string,
  action: PlayerAction,
  now: number = Date.now(),
): GameState {
  if (!isBetting(state.phase)) throw new EngineError('No betting is in progress');
  const index = state.seats.findIndex((seat) => seat.id === playerId);
  if (index === -1) throw new EngineError('You are not seated at this table');
  if (index !== state.toActIndex) throw new EngineError('It is not your turn');

  const s = structuredClone(state);
  performAction(s, index, action, now, false);
  return s;
}

function performAction(s: GameState, index: number, action: PlayerAction, now: number, isTimeout: boolean) {
  const seat = s.seats[index];
  const toCall = Math.max(0, s.currentBet - seat.bet);

  switch (action.type) {
    case 'fold':
      seat.folded = true;
      addLog(s, isTimeout ? `${seat.name} ran out of time and folded.` : `${seat.name} folded.`, now);
      break;

    case 'check':
      if (toCall > 0) throw new EngineError(`You cannot check, you need ${chips(toCall)} to call`);
      seat.hasActed = true;
      addLog(s, isTimeout ? `${seat.name} ran out of time and checked.` : `${seat.name} checked.`, now);
      break;

    case 'call': {
      if (toCall <= 0) throw new EngineError('There is nothing to call');
      const paid = commit(seat, toCall);
      seat.hasActed = true;
      addLog(s, `${seat.name} called ${chips(paid)}${seat.allIn ? ' and is all-in' : ''}.`, now);
      break;
    }

    case 'bet':
    case 'raise':
    case 'allin': {
      const allInTotal = seat.bet + seat.stack;
      if (seat.stack <= 0) throw new EngineError('You have no chips');

      let target: number;
      if (action.type === 'allin') target = allInTotal;
      else {
        target = action.amount as number;
        if (!Number.isInteger(target) || target <= 0) throw new EngineError('Enter a whole number of chips');
        if (action.type === 'bet' && s.currentBet > 0) throw new EngineError('There is already a bet, use raise');
        if (action.type === 'raise' && s.currentBet === 0) throw new EngineError('There is no bet yet, use bet');
        if (target > allInTotal) throw new EngineError('You do not have that many chips');
      }

      // All-in for no more than the current bet is simply a (short) call.
      if (target <= s.currentBet) {
        if (action.type !== 'allin') throw new EngineError(`You must raise to at least ${chips(s.currentBet + 1)}`);
        const paid = commit(seat, seat.stack);
        seat.hasActed = true;
        addLog(s, `${seat.name} called ${chips(paid)} and is all-in.`, now);
        break;
      }

      if (seat.hasActed) throw new EngineError('Betting was not reopened, you can only call or fold');
      const isAllIn = target === allInTotal;
      const smallestTarget = s.currentBet === 0 ? s.settings.bigBlind : s.currentBet + s.minRaise;
      if (target < smallestTarget && !isAllIn) {
        throw new EngineError(`The minimum ${s.currentBet === 0 ? 'bet' : 'raise'} is to ${chips(smallestTarget)}`);
      }

      const previousBet = s.currentBet;
      commit(seat, target - seat.bet);
      seat.hasActed = true;
      // A raise reopens the betting for everyone else only if the total increase since the last
      // full raise is at least the minimum raise (this also handles several short all-ins adding up).
      if (target - s.lastFullRaiseTo >= s.minRaise) {
        s.minRaise = Math.max(s.minRaise, target - previousBet);
        s.lastFullRaiseTo = target;
        for (const other of s.seats) if (other !== seat && inHand(other) && !other.allIn) other.hasActed = false;
      }
      s.currentBet = target;

      const verb = previousBet === 0 ? 'bet' : 'raised to';
      addLog(
        s,
        action.type === 'allin' || seat.allIn
          ? `${seat.name} went all-in (${verb} ${chips(target)}).`
          : `${seat.name} ${verb} ${chips(target)}.`,
        now,
      );
      break;
    }

    default:
      throw new EngineError('Unknown action');
  }

  if (!isTimeout) {
    seat.timeouts = 0;
    seat.away = false;
  }
  s.actionSeq++;
  progress(s, index, now);
}

// ---------------------------------------------------------------------------------------------
// Ending a hand: uncalled bets, side pots, showdown
// ---------------------------------------------------------------------------------------------

function returnUncalled(s: GameState, now: number): HandResult['uncalled'] {
  const contributors = s.seats.filter((seat) => seat.totalBet > 0).sort((a, b) => b.totalBet - a.totalBet);
  if (contributors.length === 0) return undefined;
  const top = contributors[0];
  const second = contributors[1]?.totalBet ?? 0;
  if (top.totalBet <= second) return undefined;
  const amount = top.totalBet - second;
  top.totalBet -= amount;
  top.bet = Math.max(0, top.bet - amount);
  top.stack += amount;
  addLog(s, `Uncalled bet of ${chips(amount)} returned to ${top.name}.`, now);
  return { playerId: top.id, amount };
}

/** Main pot + side pots from everybody's total contribution. Folded chips stay in, folded players can't win. */
export function buildPots(seats: Pick<Seat, 'id' | 'totalBet' | 'folded' | 'eliminated'>[]): PotResultInput[] {
  const contributors = seats.filter((seat) => seat.totalBet > 0);
  const levels = [...new Set(contributors.map((seat) => seat.totalBet))].sort((a, b) => a - b);
  const pots: PotResultInput[] = [];
  let previous = 0;
  let carry = 0;
  for (const level of levels) {
    const amount = contributors.filter((seat) => seat.totalBet >= level).length * (level - previous) + carry;
    const eligibleIds = contributors
      .filter((seat) => seat.totalBet >= level && !seat.folded && !seat.eliminated)
      .map((seat) => seat.id);
    previous = level;
    if (eligibleIds.length === 0) {
      carry = amount;
      continue;
    }
    carry = 0;
    const last = pots[pots.length - 1];
    if (last && last.eligibleIds.join() === eligibleIds.join()) last.amount += amount;
    else pots.push({ amount, eligibleIds });
  }
  if (carry > 0 && pots.length > 0) pots[pots.length - 1].amount += carry;
  return pots;
}
interface PotResultInput {
  amount: number;
  eligibleIds: string[];
}

function endByFold(s: GameState, winner: Seat, now: number) {
  const uncalled = returnUncalled(s, now);
  const amount = totalPot(s);
  winner.stack += amount;
  addLog(s, `${winner.name} won ${chips(amount)} chips.`, now);
  s.result = {
    handNumber: s.handNumber,
    pots: [{ amount, eligibleIds: [winner.id], winnerIds: [winner.id] }],
    payouts: [{ playerId: winner.id, amount }],
    reveals: {},
    uncalled,
    endedByFold: true,
  };
  finishHand(s, now);
}

function showdown(s: GameState, now: number) {
  const uncalled = returnUncalled(s, now);
  const live = s.seats.filter(inHand);
  const scores = new Map<string, HandScore>();
  const reveals: HandResult['reveals'] = {};
  const alreadyShown = s.exposed; // the cards were already announced during an all-in runout
  addLog(s, 'Showdown.', now);
  for (const seat of live) {
    const hand = evaluateHand([...seat.cards, ...s.community]);
    scores.set(seat.id, hand);
    reveals[seat.id] = { cards: [...seat.cards], handName: hand.name };
    addLog(s, alreadyShown ? `${seat.name} has ${hand.name}.` : `${seat.name} shows ${seat.cards.map(cardLabel).join(' ')} (${hand.name}).`, now);
  }

  const dealerDistance = (id: string) => {
    const index = s.seats.findIndex((seat) => seat.id === id);
    return (index - s.dealerIndex + s.seats.length) % s.seats.length;
  };

  const potResults: PotResult[] = [];
  const payoutTotals = new Map<string, number>();
  for (const pot of buildPots(s.seats)) {
    const best = Math.max(...pot.eligibleIds.map((id) => (scores.get(id) as HandScore).score));
    // Winners in clockwise order from the dealer: odd chips go to the first winners in this order.
    const winners = pot.eligibleIds
      .filter((id) => (scores.get(id) as HandScore).score === best)
      .sort((a, b) => dealerDistance(a) - dealerDistance(b));
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    for (const id of winners) {
      const won = share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      payoutTotals.set(id, (payoutTotals.get(id) ?? 0) + won);
    }
    potResults.push({ amount: pot.amount, eligibleIds: pot.eligibleIds, winnerIds: winners });
  }

  const payouts: HandResult['payouts'] = [];
  for (const [playerId, amount] of payoutTotals) {
    const seat = s.seats.find((candidate) => candidate.id === playerId) as Seat;
    seat.stack += amount;
    const handName = reveals[playerId]?.handName;
    payouts.push({ playerId, amount, handName });
    addLog(s, `${seat.name} won ${chips(amount)} chips with ${handName}.`, now);
  }

  s.result = { handNumber: s.handNumber, pots: potResults, payouts, reveals, uncalled, endedByFold: false };
  finishHand(s, now);
}

function finishHand(s: GameState, now: number) {
  for (const seat of s.seats) {
    seat.bet = 0;
    seat.totalBet = 0;
  }
  s.currentBet = 0;
  s.toActIndex = -1;
  s.deadline = null;
  s.runoutAt = null;
  s.exposed = false;
  for (const seat of s.seats) {
    if (!seat.eliminated && seat.stack <= 0) {
      seat.eliminated = true;
      addLog(s, `${seat.name} is out of chips.`, now);
    }
  }
  const alive = s.seats.filter((seat) => !seat.eliminated && !seat.left);
  if (alive.length < 2) {
    s.phase = 'gameover';
    s.winnerId = alive[0]?.id ?? null;
    s.nextHandAt = null;
    if (alive[0]) addLog(s, `${alive[0].name} wins the game!`, now);
  } else {
    s.phase = 'handover';
    s.nextHandAt = now + s.settings.nextHandDelaySeconds * 1000;
  }
  s.actionSeq++;
}

// ---------------------------------------------------------------------------------------------
// Timers, leaving, sitting back in
// ---------------------------------------------------------------------------------------------

/** Apply whatever is due: a turn timeout or the start of the next hand. Safe to call at any time. */
export function tick(
  state: GameState,
  now: number = Date.now(),
  randomInt: RandomInt = secureRandomInt,
): { state: GameState; changed: boolean } {
  if (isBetting(state.phase) && state.deadline !== null && now >= state.deadline) {
    const s = structuredClone(state);
    const index = s.toActIndex;
    const seat = s.seats[index];
    seat.timeouts++;
    if (seat.timeouts >= AWAY_AFTER_TIMEOUTS && !seat.away) {
      seat.away = true;
      addLog(s, `${seat.name} is away.`, now);
    }
    const canCheck = s.currentBet - seat.bet <= 0;
    performAction(s, index, { type: canCheck ? 'check' : 'fold' }, now, true);
    return { state: s, changed: true };
  }
  if (isBetting(state.phase) && state.runoutAt !== null && now >= state.runoutAt) {
    const s = structuredClone(state);
    advanceRunout(s, now);
    return { state: s, changed: true };
  }
  if (state.phase === 'handover' && state.nextHandAt !== null && now >= state.nextHandAt) {
    return { state: startHand(state, randomInt, now), changed: true };
  }
  return { state, changed: false };
}

/** A player leaves the table: they fold and never get dealt in again. */
export function markLeft(state: GameState, playerId: string, now: number = Date.now()): GameState {
  const s = structuredClone(state);
  const index = s.seats.findIndex((seat) => seat.id === playerId);
  if (index === -1 || s.seats[index].left) return s;
  const seat = s.seats[index];
  seat.left = true;
  addLog(s, `${seat.name} left the table.`, now);

  if (isBetting(s.phase) && inHand(seat) && s.runoutAt === null) {
    if (index === s.toActIndex) {
      performAction(s, index, { type: 'fold' }, now, true);
    } else {
      seat.folded = true;
      s.actionSeq++;
      const live = s.seats.filter(inHand);
      if (live.length === 1) endByFold(s, live[0], now);
    }
  } else {
    s.actionSeq++;
    if (s.phase === 'handover' || s.phase === 'gameover') {
      const alive = s.seats.filter((candidate) => !candidate.eliminated && !candidate.left);
      if (alive.length < 2) {
        s.phase = 'gameover';
        s.winnerId = alive[0]?.id ?? null;
        s.nextHandAt = null;
      }
    }
  }
  return s;
}

export function sitIn(state: GameState, playerId: string): GameState {
  const s = structuredClone(state);
  const seat = s.seats.find((candidate) => candidate.id === playerId);
  if (!seat) throw new EngineError('You are not seated at this table');
  seat.away = false;
  seat.timeouts = 0;
  s.actionSeq++;
  return s;
}

// ---------------------------------------------------------------------------------------------
// What each browser is allowed to see
// ---------------------------------------------------------------------------------------------

/** Public table view. Contains no deck and no hole cards (showdown reveals live in `result`). */
export function publicView(state: GameState): PublicGameView {
  const midHand = isBetting(state.phase);
  const pots = midHand && state.seats.some((seat) => seat.allIn) ? buildPots(state.seats) : [];
  return {
    handNumber: state.handNumber,
    phase: state.phase,
    dealerId: state.seats[state.dealerIndex]?.id ?? null,
    toActId: midHand && state.toActIndex >= 0 ? state.seats[state.toActIndex].id : null,
    deadline: state.deadline,
    nextHandAt: state.nextHandAt,
    runoutAt: state.runoutAt,
    reveals: revealedCards(state),
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    bigBlind: state.settings.bigBlind,
    pot: totalPot(state),
    pots,
    community: [...state.community],
    actionSeq: state.actionSeq,
    seats: state.seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      seatIndex: seat.seatIndex,
      stack: seat.stack,
      bet: seat.bet,
      folded: seat.folded,
      allIn: seat.allIn,
      hasActed: seat.hasActed,
      away: seat.away,
      eliminated: seat.eliminated,
      left: seat.left,
      hasCards: seat.cards.length > 0 && !seat.folded && !seat.eliminated,
    })),
    result: state.result,
    winnerId: state.winnerId,
    settings: state.settings,
  };
}

/** During an all-in runout the remaining players' cards are public (nobody can bet any more). */
function revealedCards(state: GameState): Record<string, Card[]> {
  const cards: Record<string, Card[]> = {};
  if (!state.exposed || !isBetting(state.phase)) return cards;
  for (const seat of state.seats.filter(inHand)) cards[seat.id] = [...seat.cards];
  return cards;
}

/** Hole cards per player. Each entry may only ever be sent to that player. */
export function privateCards(state: GameState): Record<string, Card[]> {
  const cards: Record<string, Card[]> = {};
  for (const seat of state.seats) cards[seat.id] = seat.cards;
  return cards;
}

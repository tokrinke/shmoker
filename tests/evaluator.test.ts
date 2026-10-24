import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHand } from '../supabase/functions/_shared/engine/index.ts';

const hand = (text: string) => evaluateHand(text.split(' '));

test('every hand category is recognised', () => {
  assert.equal(hand('Ah Kd 9c 5s 2d').name, 'High Card');
  assert.equal(hand('Ah Ad 9c 5s 2d').name, 'One Pair');
  assert.equal(hand('Ah Ad 9c 9s 2d').name, 'Two Pair');
  assert.equal(hand('Ah Ad Ac 9s 2d').name, 'Three of a Kind');
  assert.equal(hand('5h 6d 7c 8s 9d').name, 'Straight');
  assert.equal(hand('Ah 9h 7h 5h 2h').name, 'Flush');
  assert.equal(hand('Ah Ad Ac 9s 9d').name, 'Full House');
  assert.equal(hand('Ah Ad Ac As 2d').name, 'Four of a Kind');
  assert.equal(hand('5h 6h 7h 8h 9h').name, 'Straight Flush');
  assert.equal(hand('Ah Kh Qh Jh Th').name, 'Royal Flush');
});

test('categories rank in the correct order', () => {
  const ladder = [
    'Ah Kd 9c 5s 2d',
    'Ah Ad 9c 5s 2d',
    'Ah Ad 9c 9s 2d',
    'Ah Ad Ac 9s 2d',
    '5h 6d 7c 8s 9d',
    'Ah 9h 7h 5h 2h',
    'Ah Ad Ac 9s 9d',
    'Ah Ad Ac As 2d',
    '5h 6h 7h 8h 9h',
    'Ah Kh Qh Jh Th',
  ].map((text) => hand(text).score);
  for (let i = 1; i < ladder.length; i++) assert.ok(ladder[i] > ladder[i - 1], `rank ${i} beats rank ${i - 1}`);
});

test('ace-low straight (wheel) is the lowest straight and beaten by a six-high straight', () => {
  const wheel = hand('Ah 2d 3c 4s 5d');
  assert.equal(wheel.name, 'Straight');
  assert.ok(hand('2h 3d 4c 5s 6d').score > wheel.score);
  assert.ok(wheel.score > hand('Ah Ad Ac Ks 2d').score, 'a wheel beats three of a kind');
  assert.equal(hand('Ah 2h 3h 4h 5h').name, 'Straight Flush');
  assert.ok(hand('2h 3h 4h 5h 6h').score > hand('Ah 2h 3h 4h 5h').score);
});

test('no wrap-around straights (Q-K-A-2-3 is not a straight)', () => {
  assert.equal(hand('Qh Kd Ac 2s 3d').name, 'High Card');
});

test('kickers decide between equal categories', () => {
  assert.ok(hand('Ah Ad Kc 5s 2d').score > hand('Ah Ad Qc 5s 2d').score);
  assert.ok(hand('Ah Ad Kc 5s 3d').score > hand('Ah Ad Kc 5s 2d').score);
  assert.ok(hand('Ah Ad 9c 9s Kd').score > hand('Ah Ad 9c 9s Qd').score);
  assert.ok(hand('Ah Ad 9c 9s 2d').score > hand('Kh Kd 9c 9s 2d').score);
  assert.ok(hand('9h 9d 9c Ks 2d').score < hand('9h 9d 9c As 2d').score);
  assert.ok(hand('Kh Kd Kc 2s 2d').score > hand('Qh Qd Qc As Ad').score, 'trips rank decides full houses');
  assert.ok(hand('9h 9d 9c 9s 2d').score < hand('9h 9d 9c 9s Ad').score);
});

test('flush compares card by card', () => {
  assert.ok(hand('Ah Kh 9h 5h 3h').score > hand('Ah Kh 9h 5h 2h').score);
});

test('best five of seven cards is chosen', () => {
  assert.equal(hand('Ah Kh 2c 2d 9s 9h 5c').name, 'Two Pair');
  // two pair + three of a kind among seven cards -> full house
  assert.equal(hand('Ah Ad Ac 9s 9h 2c 3d').name, 'Full House');
  // flush hidden in seven cards
  assert.equal(hand('2h 5h 9h Jh Kh 3c 3d').name, 'Flush');
  // straight flush beats the flush that also exists
  assert.equal(hand('5h 6h 7h 8h 9h Ah 2c').name, 'Straight Flush');
  // three pairs -> best two pairs with best kicker
  const threePairs = hand('Ah Ad Kc Ks 9h 9d 2c');
  assert.equal(threePairs.name, 'Two Pair');
  assert.equal(threePairs.score, hand('Ah Ad Kc Ks 9h').score);
});

test('equal hands have equal scores (board plays)', () => {
  const a = hand('As Ks Qs Js Ts 2c 3d');
  const b = hand('As Ks Qs Js Ts 4c 5d');
  assert.equal(a.score, b.score);
});

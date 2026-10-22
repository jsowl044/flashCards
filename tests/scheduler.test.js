import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundInterval, calculateSchedule, scheduleCard, projectedSchedule,
  compareByCooldown, getDueCards, computeNextDueInfo, mergeNewlyDue
} from '../js/scheduler.js';

const NOW = new Date('2026-01-15T12:00:00.000Z');
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const at = (offsetMs)=> new Date(NOW.getTime() + offsetMs).toISOString();

const card = (overrides={})=>({
  id: 'c1', question: 'q', answer: 'a',
  state: 'NEW', reps: 0, interval: 0, easeFactor: 2.5, lastEvaluation: '',
  nextReview: NOW.toISOString(), ...overrides
});
// A card that has graduated to review after its first successful day.
const review = (overrides={})=>card({ state: 'REVIEW', reps: 1, interval: 1, ...overrides });
const rate = (c, evaluation)=>calculateSchedule(c, evaluation, NOW);

describe('learning cards', ()=>{
  test('Again: back in 1 minute, reps reset, ease drops by 0.20', ()=>{
    const { card: next, minutes } = rate(card(), 'again');
    assert.equal(minutes, 1);
    assert.equal(next.state, 'LEARNING');
    assert.equal(next.reps, 0);
    assert.equal(next.easeFactor, 2.3);
    assert.equal(next.nextReview, at(1 * MIN));
    assert.equal(next.lastEvaluation, 'again');
  });

  test('Hard: back in 8 minutes, ease drops by 0.15', ()=>{
    const { card: next, minutes } = rate(card(), 'hard');
    assert.equal(minutes, 8);
    assert.equal(next.state, 'LEARNING');
    assert.equal(next.easeFactor, 2.35);
    assert.equal(next.nextReview, at(8 * MIN));
  });

  test('Good on a brand-new card is a 15-minute learning step', ()=>{
    const { card: next, minutes, days } = rate(card(), 'good');
    assert.equal(minutes, 15);
    assert.equal(days, 0);
    assert.equal(next.state, 'LEARNING');
    assert.equal(next.reps, 1);
    assert.equal(next.interval, 0);
    assert.equal(next.nextReview, at(15 * MIN));
  });

  test('Good after a learning step graduates the card to a 1-day review', ()=>{
    const { card: next, days } = rate(card({ state: 'LEARNING', reps: 1 }), 'good');
    assert.equal(days, 1);
    assert.equal(next.state, 'REVIEW');
    assert.equal(next.interval, 1);
    assert.equal(next.nextReview, at(1 * DAY));
  });

  test('Easy graduates immediately to 4 days and raises ease by 0.15', ()=>{
    const { card: next, days } = rate(card(), 'easy');
    assert.equal(days, 4);
    assert.equal(next.state, 'REVIEW');
    assert.equal(next.interval, 4);
    assert.equal(next.easeFactor, 2.65);
    assert.equal(next.nextReview, at(4 * DAY));
  });
});

describe('review cards', ()=>{
  test('Again lapses the card back into learning', ()=>{
    const { card: next, minutes } = rate(review({ interval: 15, reps: 4 }), 'again');
    assert.equal(minutes, 1);
    assert.equal(next.state, 'LEARNING');
    assert.equal(next.interval, 0);
    assert.equal(next.reps, 0);
    assert.equal(next.easeFactor, 2.3);
  });

  test('Hard multiplies the interval by 1.2 and lowers ease', ()=>{
    const { card: next, days } = rate(review({ interval: 6, reps: 2 }), 'hard');
    assert.equal(days, 7.2);
    assert.equal(next.interval, 7.2);
    assert.equal(next.easeFactor, 2.35);
    assert.equal(next.state, 'REVIEW');
  });

  test('Hard moves a first-day review past the fixed 6-day step', ()=>{
    const { card: next } = rate(review({ interval: 1, reps: 1 }), 'hard');
    assert.equal(next.reps, 2);
    // so a following Good uses interval x ease, not the fixed 6 days again
    assert.notEqual(rate(next, 'good').days, 6);
  });

  test('the second successful review is a fixed 6 days', ()=>{
    const { card: next, days } = rate(review({ interval: 1, reps: 1 }), 'good');
    assert.equal(days, 6);
    assert.equal(next.reps, 2);
  });

  test('later Good reviews multiply the interval by the ease factor', ()=>{
    const { days } = rate(review({ interval: 6, reps: 2 }), 'good');
    assert.equal(days, 15); // 6 x 2.5
  });

  test('Easy on the second review lands after the fixed 6-day Good', ()=>{
    const { card: next, days } = rate(review({ interval: 1, reps: 1 }), 'easy');
    assert.equal(days, 7.8); // 6 x 1.3
    assert.equal(next.easeFactor, 2.65);
  });

  test('Easy is always later than Good', ()=>{
    for(const c of [
      review({ interval: 1, reps: 1 }),
      review({ interval: 6, reps: 2 }),
      review({ interval: 15, reps: 3 }),
      review({ interval: 40, reps: 6, easeFactor: 1.8 })
    ]){
      assert.ok(rate(c, 'easy').days > rate(c, 'good').days, `interval ${c.interval}`);
    }
  });

  test('ease never drops below 1.3', ()=>{
    assert.equal(rate(card({ easeFactor: 1.3 }), 'again').card.easeFactor, 1.3);
    assert.equal(rate(card({ easeFactor: 1.35 }), 'again').card.easeFactor, 1.3);
    assert.equal(rate(review({ easeFactor: 1.3 }), 'hard').card.easeFactor, 1.3);
  });
});

describe('purity and helpers', ()=>{
  test('calculateSchedule does not mutate its input', ()=>{
    const original = card();
    const snapshot = structuredClone(original);
    rate(original, 'good');
    assert.deepEqual(original, snapshot);
  });

  test('scheduleCard applies the result in place', ()=>{
    const c = card();
    scheduleCard(c, 'good', NOW);
    assert.equal(c.state, 'LEARNING');
    assert.equal(c.nextReview, at(15 * MIN));
  });

  test('roundInterval keeps one decimal and never goes below one day', ()=>{
    assert.equal(roundInterval(0.2), 1);
    assert.equal(roundInterval(1.26), 1.3);
    assert.equal(roundInterval(6), 6);
  });

  test('projectedSchedule produces the labels shown under the buttons', ()=>{
    const labels = (c)=>['again', 'hard', 'good', 'easy'].map(e=>projectedSchedule(c, e, NOW).human);
    assert.deepEqual(labels(card()), ['1 min', '8 min', '15 min', '4 days']);
    assert.equal(projectedSchedule(card({ state: 'LEARNING', reps: 1 }), 'good', NOW).human, '1 day');
    assert.equal(projectedSchedule(review({ interval: 1, reps: 1 }), 'good', NOW).human, '6 days');
  });
});

describe('due cards and ordering', ()=>{
  test('longer intervals come first; ties go to the most overdue card', ()=>{
    const a = card({ id: 'a', interval: 1, nextReview: at(-1 * HOUR) });
    const b = card({ id: 'b', interval: 15, nextReview: at(-1 * MIN) });
    const c = card({ id: 'c', interval: 1, nextReview: at(-3 * HOUR) });
    assert.deepEqual([a, b, c].sort(compareByCooldown).map(x=>x.id), ['b', 'c', 'a']);
  });

  test('getDueCards keeps cards due now or earlier, sorted by cooldown', ()=>{
    const deck = { cards: [
      card({ id: 'learning', interval: 0, nextReview: at(-5 * MIN) }),
      card({ id: 'future', interval: 6, nextReview: at(1 * MIN) }),
      card({ id: 'exactly-now', interval: 3, nextReview: at(0) }),
      card({ id: 'mature', interval: 30, nextReview: at(-2 * DAY) })
    ] };
    assert.deepEqual(getDueCards(deck, NOW).map(x=>x.id), ['mature', 'exactly-now', 'learning']);
  });

  test('getDueCards tolerates a deck without cards', ()=>{
    assert.deepEqual(getDueCards({}, NOW), []);
  });
});

describe('computeNextDueInfo', ()=>{
  const deckDueIn = (...offsets)=>({ cards: offsets.map((ms, i)=>card({ id: `c${i}`, nextReview: at(ms) })) });
  const info = (...offsets)=>computeNextDueInfo(deckDueIn(...offsets), NOW);

  test('shows a dash when there is nothing to schedule', ()=>{
    assert.equal(computeNextDueInfo({ cards: [] }, NOW), '—');
    assert.equal(computeNextDueInfo({}, NOW), '—');
  });

  test('says "now" for overdue and exactly-due cards', ()=>{
    assert.equal(info(-1 * HOUR), 'now');
    assert.equal(info(0), 'now');
  });

  test('never says "now" while a card is still seconds away', ()=>{
    // regression: rounding milliseconds to minutes used to turn 20 s into "now"
    assert.equal(info(20 * 1000), 'in 1 min');
    assert.equal(info(1), 'in 1 min');
  });

  test('formats minutes, hours and days', ()=>{
    assert.equal(info(45 * MIN), 'in 45 min');
    assert.equal(info(3 * HOUR), 'in 3 h');
    assert.equal(info(1 * DAY), 'tomorrow');
    assert.equal(info(36 * HOUR), '1.5 days');
    assert.equal(info(2 * DAY), '2 days');
  });

  test('uses the earliest card in the deck', ()=>{
    assert.equal(info(3 * DAY, 10 * MIN, 1 * DAY), 'in 10 min');
  });
});

describe('mergeNewlyDue (cards that come due mid-session)', ()=>{
  const q = (id, extra={})=>card({ id, nextReview: at(-1 * MIN), ...extra });

  test('returns the very same queue when nothing new is due', ()=>{
    const queue = [q('a'), q('b')];
    const result = mergeNewlyDue(queue, 0, [...queue, q('later', { nextReview: at(1 * HOUR) })], NOW);
    assert.equal(result, queue);
  });

  test('adds a newly due card after the one on screen', ()=>{
    const queue = [q('a'), q('b')];
    const result = mergeNewlyDue(queue, 0, [...queue, q('new')], NOW);
    assert.deepEqual(result.map(x=>x.id), ['a', 'b', 'new']);
  });

  // Once rated, a card is rescheduled into the future in storage; that's what the deck looks like here.
  const rescheduled = (id)=>q(id, { nextReview: at(1 * HOUR) });

  test('never moves the card currently on screen or the ones already shown', ()=>{
    const queue = [q('done'), q('current', { interval: 0 }), q('next', { interval: 0 })];
    const veryMature = q('mature', { interval: 99 });
    const result = mergeNewlyDue(queue, 1, [rescheduled('done'), queue[1], queue[2], veryMature], NOW);
    assert.deepEqual(result.map(x=>x.id), ['done', 'current', 'mature', 'next']);
  });

  test('does not duplicate cards that are still waiting in the queue', ()=>{
    const queue = [q('a'), q('b'), q('c')];
    const result = mergeNewlyDue(queue, 1, [rescheduled('a'), { ...queue[1] }, { ...queue[2] }], NOW);
    assert.equal(result, queue);
  });

  test('re-adds a card rated earlier in the session once its short step has elapsed', ()=>{
    const queue = [q('rated-again'), q('current')];
    const result = mergeNewlyDue(queue, 1, [q('rated-again'), q('current')], NOW);
    assert.deepEqual(result.map(x=>x.id), ['rated-again', 'current', 'rated-again']);
  });
});

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, STORAGE_BACKUP_KEY,
  parseStoredDecks, normalizeDecks, loadDecks, saveDecks, onSave, findDeck
} from '../js/storage.js';
import { installFakeStorage } from './helpers.js';

const NOW = new Date('2026-01-15T12:00:00.000Z');
const goodCard = (overrides={})=>({
  id: 'c1', question: 'q', answer: 'a', state: 'REVIEW', reps: 2, interval: 6,
  easeFactor: 2.5, lastEvaluation: 'good', nextReview: '2026-01-20T00:00:00.000Z', ...overrides
});

describe('parseStoredDecks', ()=>{
  test('treats a missing value as an empty list', ()=>{
    assert.deepEqual(parseStoredDecks(null), { decks: [], normalized: false });
  });

  test('accepts the normal array format', ()=>{
    assert.deepEqual(parseStoredDecks('[{"id":"1","cards":[]}]'), { decks: [{ id: '1', cards: [] }], normalized: false });
  });

  test('accepts a single deck object and flags it for rewriting', ()=>{
    const result = parseStoredDecks('{"id":"1","name":"x","cards":[]}');
    assert.equal(result.decks.length, 1);
    assert.equal(result.normalized, true);
  });

  test('returns null for broken or unrelated JSON so the backup can be used', ()=>{
    assert.equal(parseStoredDecks('{not json'), null);
    assert.equal(parseStoredDecks('42'), null);
    assert.equal(parseStoredDecks('{"hello":"world"}'), null);
  });
});

describe('normalizeDecks', ()=>{
  test('drops entries that are not objects', ()=>{
    const { decks, changed } = normalizeDecks([null, 'oops', 7, { id: 'a', cards: [] }], NOW);
    assert.equal(decks.length, 1);
    assert.equal(changed, true);
  });

  test('guarantees string ids and a cards array', ()=>{
    const { decks } = normalizeDecks([{ cards: [] }, { id: 42, cards: [] }, { id: 'x' }], NOW);
    assert.match(decks[0].id, /^migrated-\d+-0$/);
    assert.equal(decks[1].id, '42');
    assert.deepEqual(decks[2].cards, []);
  });

  test('drops cards that are not objects', ()=>{
    const { decks } = normalizeDecks([{ id: 'a', cards: [goodCard(), null, 'x'] }], NOW);
    assert.equal(decks[0].cards.length, 1);
  });

  test('fills in every scheduling field on a bare card', ()=>{
    const { decks } = normalizeDecks([{ id: 'a', cards: [{ id: 'c', question: 'q', answer: 'a' }] }], NOW);
    assert.deepEqual(decks[0].cards[0], {
      id: 'c', question: 'q', answer: 'a', state: 'NEW', reps: 0, interval: 0,
      easeFactor: 2.5, lastEvaluation: '', nextReview: NOW.toISOString()
    });
  });

  test('migrates the early Spanish-named format', ()=>{
    const legacy = {
      id: 'c', pregunta: 'hola', respuesta: 'hello', estado: 'REPASO',
      intervalo: 5, factorFacilidad: 2.1, fechaProximaRevision: '2025-03-01T00:00:00.000Z'
    };
    const card = normalizeDecks([{ id: 'a', cards: [legacy] }], NOW).decks[0].cards[0];
    assert.equal(card.question, 'hola');
    assert.equal(card.answer, 'hello');
    assert.equal(card.state, 'REVIEW');
    assert.equal(card.interval, 5);
    assert.equal(card.easeFactor, 2.1);
    assert.equal(card.nextReview, '2025-03-01T00:00:00.000Z');
    for(const oldKey of ['pregunta', 'respuesta', 'estado', 'intervalo', 'factorFacilidad', 'fechaProximaRevision']){
      assert.equal(oldKey in card, false, `${oldKey} should be removed`);
    }
  });

  test('converts older minute-based intervals to days and goodCount to reps', ()=>{
    const card = normalizeDecks([{ id: 'a', cards: [{ id: 'c', question: 'q', answer: 'a', intervalMinutes: 2880, goodCount: 3 }] }], NOW).decks[0].cards[0];
    assert.equal(card.interval, 2);
    assert.equal(card.reps, 3);
    assert.equal('intervalMinutes' in card, false);
    assert.equal('goodCount' in card, false);
  });

  test('infers the state from the interval when it is missing', ()=>{
    const cards = normalizeDecks([{ id: 'a', cards: [
      { id: '1', question: 'q', answer: 'a', interval: 3 },
      { id: '2', question: 'q', answer: 'a', interval: 0 }
    ] }], NOW).decks[0].cards;
    assert.equal(cards[0].state, 'REVIEW');
    assert.equal(cards[1].state, 'NEW');
  });

  test('replaces an unparsable nextReview date', ()=>{
    const card = normalizeDecks([{ id: 'a', cards: [goodCard({ nextReview: 'garbage' })] }], NOW).decks[0].cards[0];
    assert.equal(card.nextReview, NOW.toISOString());
  });

  test('leaves already-valid data alone and reports no change', ()=>{
    const input = [{ id: 'a', name: 'n', cards: [goodCard()] }];
    const before = structuredClone(input);
    const { decks, changed } = normalizeDecks(input, NOW);
    assert.equal(changed, false);
    assert.deepEqual(decks, before);
  });
});

describe('loadDecks / saveDecks', ()=>{
  let store;
  beforeEach(()=>{ store = installFakeStorage(); });

  test('returns an empty list when nothing is stored', ()=>{
    assert.deepEqual(loadDecks(), []);
  });

  test('round-trips decks and writes the backup copy too', ()=>{
    const decks = [{ id: 'a', name: 'n', cards: [goodCard()] }];
    saveDecks(decks);
    assert.deepEqual(loadDecks(), decks);
    assert.equal(store.get(STORAGE_KEY), store.get(STORAGE_BACKUP_KEY));
  });

  test('recovers from the backup when the main entry is corrupted, and repairs it', (t)=>{
    const warn = t.mock.method(console, 'warn', ()=>{});
    const decks = [{ id: 'a', name: 'n', cards: [goodCard()] }];
    saveDecks(decks);
    store.set(STORAGE_KEY, '{broken');
    assert.deepEqual(loadDecks(), decks);
    assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)), decks);
    assert.equal(warn.mock.callCount(), 1);
  });

  test('returns an empty list when both copies are corrupted', ()=>{
    store.set(STORAGE_KEY, '{broken');
    store.set(STORAGE_BACKUP_KEY, 'also broken');
    assert.deepEqual(loadDecks(), []);
  });

  test('persists a migrated shape so the work is done only once', ()=>{
    store.set(STORAGE_KEY, JSON.stringify([{ id: 'a', cards: [{ id: 'c', question: 'q', answer: 'a' }] }]));
    const [deck] = loadDecks();
    assert.equal(deck.cards[0].state, 'NEW');
    assert.equal(JSON.parse(store.get(STORAGE_KEY))[0].cards[0].state, 'NEW');
  });

  test('upgrades a lone deck object to the array format on disk', ()=>{
    store.set(STORAGE_KEY, JSON.stringify({ id: 'a', name: 'solo', cards: [] }));
    assert.equal(loadDecks().length, 1);
    assert.equal(Array.isArray(JSON.parse(store.get(STORAGE_KEY))), true);
  });
});

describe('onSave listeners', ()=>{
  beforeEach(()=>{ installFakeStorage(); });

  test('are notified with the saved decks', ()=>{
    const seen = [];
    const off = onSave((decks)=>seen.push(decks));
    const decks = [{ id: 'a', cards: [] }];
    saveDecks(decks);
    assert.deepEqual(seen, [decks]);
    off();
  });

  test('are skipped by a silent save (used when applying cloud data)', ()=>{
    const seen = [];
    const off = onSave((decks)=>seen.push(decks));
    saveDecks([{ id: 'a', cards: [] }], { silent: true });
    assert.deepEqual(seen, []);
    off();
  });

  test('stop being notified after unsubscribing', ()=>{
    let calls = 0;
    onSave(()=>{ calls++; })();
    saveDecks([]);
    assert.equal(calls, 0);
  });
});

describe('findDeck', ()=>{
  test('matches ids regardless of string/number type', ()=>{
    const decks = [{ id: '123', cards: [] }];
    assert.equal(findDeck(decks, 123), decks[0]);
    assert.equal(findDeck(decks, '999'), undefined);
  });
});

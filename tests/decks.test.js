import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeck, deleteDeck, renameDeck, newCard, addCardToDeck, updateCard, deleteCard,
  loadSampleDeck, SAMPLE_DECK, importDecks
} from '../js/decks.js';
import { loadDecks } from '../js/storage.js';
import { getDueCards } from '../js/scheduler.js';
import { installFakeStorage } from './helpers.js';

beforeEach(()=>{ installFakeStorage(); });

describe('decks', ()=>{
  test('createDeck stores an empty deck with a string id', ()=>{
    const deck = createDeck('Spanish');
    assert.equal(typeof deck.id, 'string');
    assert.deepEqual(loadDecks(), [{ id: deck.id, name: 'Spanish', cards: [] }]);
  });

  test('ids stay unique even when created in the same millisecond', ()=>{
    const ids = new Set();
    for(let i = 0; i < 200; i++) ids.add(createDeck(`d${i}`).id);
    assert.equal(ids.size, 200);
  });

  test('deleteDeck removes only the requested deck', ()=>{
    const keep = createDeck('keep');
    const drop = createDeck('drop');
    deleteDeck(drop.id);
    assert.deepEqual(loadDecks().map(d=>d.id), [keep.id]);
  });

  test('renameDeck saves a new name and reports whether anything changed', ()=>{
    const deck = createDeck('old');
    assert.equal(renameDeck(deck.id, 'new'), true);
    assert.equal(loadDecks()[0].name, 'new');
    assert.equal(renameDeck(deck.id, 'new'), false);
    assert.equal(renameDeck('missing', 'x'), false);
  });
});

describe('cards', ()=>{
  test('a new card starts due now, in the NEW state, with default scheduling', ()=>{
    const card = newCard('hola', 'hello');
    assert.equal(card.question, 'hola');
    assert.equal(card.answer, 'hello');
    assert.equal(card.state, 'NEW');
    assert.equal(card.reps, 0);
    assert.equal(card.interval, 0);
    assert.equal(card.easeFactor, 2.5);
    assert.ok(new Date(card.nextReview) <= new Date());
  });

  test('addCardToDeck appends to the right deck and returns the card', ()=>{
    const deck = createDeck('d');
    const card = addCardToDeck(deck.id, 'q', 'a');
    assert.equal(loadDecks()[0].cards[0].id, card.id);
    assert.equal(addCardToDeck('missing', 'q', 'a'), null);
  });

  test('card ids stay unique when many are added at once', ()=>{
    const deck = createDeck('d');
    const ids = new Set(Array.from({ length: 200 }, ()=>addCardToDeck(deck.id, 'q', 'a').id));
    assert.equal(ids.size, 200);
  });

  test('updateCard edits the text but keeps the scheduling state', ()=>{
    const deck = createDeck('d');
    const card = addCardToDeck(deck.id, 'q', 'a');
    assert.equal(updateCard(deck.id, card.id, 'q2', 'a2'), true);
    const saved = loadDecks()[0].cards[0];
    assert.equal(saved.question, 'q2');
    assert.equal(saved.answer, 'a2');
    assert.equal(saved.nextReview, card.nextReview);
    assert.equal(updateCard(deck.id, 'missing', 'x', 'y'), false);
  });

  test('deleteCard removes only that card', ()=>{
    const deck = createDeck('d');
    const a = addCardToDeck(deck.id, 'a', '1');
    const b = addCardToDeck(deck.id, 'b', '2');
    assert.equal(deleteCard(deck.id, a.id), true);
    assert.deepEqual(loadDecks()[0].cards.map(c=>c.id), [b.id]);
    assert.equal(deleteCard('missing', a.id), false);
  });
});

describe('sample deck', ()=>{
  test('adds a ready-to-study deck', ()=>{
    loadSampleDeck();
    const [deck] = loadDecks();
    assert.equal(deck.name, SAMPLE_DECK.name);
    assert.equal(deck.cards.length, SAMPLE_DECK.cards.length);
    assert.equal(getDueCards(deck).length, deck.cards.length);
  });

  test('can be loaded more than once without clashing ids', ()=>{
    loadSampleDeck();
    loadSampleDeck();
    const decks = loadDecks();
    assert.equal(decks.length, 2);
    assert.notEqual(decks[0].id, decks[1].id);
  });
});

describe('importDecks', ()=>{
  const backup = ()=>[
    { id: 'orig-1', name: 'Imported A', cards: [
      { id: 'orig-c1', question: 'q1', answer: 'a1', state: 'REVIEW', reps: 3, interval: 15, easeFactor: 2.2, lastEvaluation: 'good', nextReview: '2030-01-01T00:00:00.000Z' }
    ] },
    { id: 'orig-2', name: 'Imported B', cards: [] }
  ];

  test('appends decks with fresh ids and keeps existing data', ()=>{
    const existing = createDeck('mine');
    const result = importDecks(backup());
    assert.deepEqual(result, { added: 2 });
    const decks = loadDecks();
    assert.equal(decks.length, 3);
    assert.equal(decks[0].id, existing.id);
    assert.deepEqual(decks.slice(1).map(d=>d.name), ['Imported A', 'Imported B']);
    assert.ok(!decks.some(d=>d.id.startsWith('orig-')), 'deck ids should be regenerated');
  });

  test('regenerates card ids but preserves their content and progress', ()=>{
    importDecks(backup());
    const card = loadDecks()[0].cards[0];
    assert.notEqual(card.id, 'orig-c1');
    assert.equal(card.question, 'q1');
    assert.equal(card.interval, 15);
    assert.equal(card.nextReview, '2030-01-01T00:00:00.000Z');
  });

  test('accepts a single exported deck object', ()=>{
    assert.deepEqual(importDecks(backup()[0]), { added: 1 });
    assert.equal(loadDecks()[0].name, 'Imported A');
  });

  test('fills in missing card fields and a default deck name', ()=>{
    importDecks([{ cards: [{ question: 'q', answer: 'a' }] }]);
    const [deck] = loadDecks();
    assert.equal(deck.name, 'Imported deck');
    assert.equal(deck.cards[0].state, 'NEW');
    assert.equal(deck.cards[0].easeFactor, 2.5);
  });

  test('rejects files that are not deck data and changes nothing', ()=>{
    createDeck('mine');
    for(const bad of ['text', 42, null, { hello: 'world' }]){
      assert.deepEqual(importDecks(bad), { error: 'format' });
    }
    assert.equal(loadDecks().length, 1);
  });

  test('reports when an array has no usable decks', ()=>{
    assert.deepEqual(importDecks([null, 5, 'x']), { error: 'empty' });
    assert.deepEqual(loadDecks(), []);
  });

  test('imported ids are unique even for large backups', ()=>{
    const many = Array.from({ length: 50 }, (_, i)=>({ name: `d${i}`, cards: Array.from({ length: 20 }, ()=>({ question: 'q', answer: 'a' })) }));
    importDecks(many);
    const decks = loadDecks();
    const ids = decks.flatMap(d=>[d.id, ...d.cards.map(c=>c.id)]);
    assert.equal(new Set(ids).size, ids.length);
  });
});

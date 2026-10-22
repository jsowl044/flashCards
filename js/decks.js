// Operations on decks and cards. Each one loads, changes and saves through the storage
// layer; none of them touch the DOM.
import { loadDecks, saveDecks, findDeck } from './storage.js';

// Timestamp plus a random suffix, so ids created in the same millisecond can't collide.
// Ids are opaque strings: older data keeps whatever format it was created with.
function newId(prefix=''){
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createDeck(name){
  const decks = loadDecks();
  const deck = { id: newId(), name, cards: [] };
  decks.push(deck);
  saveDecks(decks);
  return deck;
}

export function deleteDeck(deckId){
  saveDecks(loadDecks().filter(d=>String(d.id) !== String(deckId)));
}

// Returns true when the name actually changed (and was saved).
export function renameDeck(deckId, name){
  const decks = loadDecks();
  const deck = findDeck(decks, deckId);
  if(!deck || deck.name === name) return false;
  deck.name = name;
  saveDecks(decks);
  return true;
}

export function newCard(question, answer){
  return {
    id: newId(),
    question,
    answer,
    state: 'NEW',
    // scheduling fields
    reps: 0,
    interval: 0, // days
    easeFactor: 2.5,
    lastEvaluation: '',
    nextReview: new Date().toISOString()
  };
}

export function addCardToDeck(deckId, question, answer){
  const decks = loadDecks();
  const deck = findDeck(decks, deckId);
  if(!deck) return null;
  const card = newCard(question, answer);
  deck.cards.push(card);
  saveDecks(decks);
  return card;
}

export function updateCard(deckId, cardId, question, answer){
  const decks = loadDecks();
  const deck = findDeck(decks, deckId);
  if(!deck) return false;
  const card = deck.cards.find(c=>c.id === cardId);
  if(!card) return false;
  card.question = question;
  card.answer = answer;
  saveDecks(decks);
  return true;
}

export function deleteCard(deckId, cardId){
  const decks = loadDecks();
  const deck = findDeck(decks, deckId);
  if(!deck) return false;
  deck.cards = deck.cards.filter(c=>c.id !== cardId);
  saveDecks(decks);
  return true;
}

// Lets a first-time visitor try the study flow without typing cards or signing in.
export const SAMPLE_DECK = {
  name: 'Sample: Spanish → English',
  cards: [
    ['hola', 'hello'], ['gracias', 'thank you'], ['por favor', 'please'],
    ['buenos días', 'good morning'], ['¿cómo estás?', 'how are you?'],
    ['lo siento', "I'm sorry"], ['agua', 'water'], ['casa', 'house'],
    ['amigo', 'friend'], ['hasta luego', 'see you later']
  ]
};

export function loadSampleDeck(){
  const decks = loadDecks();
  decks.push({
    id: newId('sample-'),
    name: SAMPLE_DECK.name,
    cards: SAMPLE_DECK.cards.map(([q, a])=>newCard(q, a))
  });
  saveDecks(decks);
}

// Imports a parsed backup (an array of decks, or a single deck object). Decks and cards get
// fresh ids and are appended — existing data is never overwritten. Missing card fields are
// filled in by loadDecks() the next time decks are read.
// Returns { added } on success or { error: 'format' | 'empty' }.
export function importDecks(parsed){
  const incoming = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.cards) ? [parsed] : null);
  if(!incoming) return { error: 'format' };

  const decks = loadDecks();
  let added = 0;
  incoming.forEach(deck=>{
    if(!deck || typeof deck !== 'object') return;
    const cards = Array.isArray(deck.cards) ? deck.cards.filter(c=>c && typeof c === 'object') : [];
    decks.push({
      id: newId('imported-'),
      name: deck.name || 'Imported deck',
      cards: cards.map(c=>({ ...c, id: newId('imported-') }))
    });
    added++;
  });
  if(added === 0) return { error: 'empty' };
  saveDecks(decks);
  return { added };
}

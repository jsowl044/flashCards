// Persistence layer. localStorage is the source of truth the UI reads from, which keeps
// rendering synchronous and the app instant offline. Anything that wants to react to a
// save (e.g. cloud sync) subscribes with onSave() instead of being called from here.
//
// localStorage is looked up on every call (never at import time) so tests can swap in a fake.

export const STORAGE_KEY = 'flashcards_decks_v1';
export const STORAGE_BACKUP_KEY = 'flashcards_decks_backup_v1';

const saveListeners = new Set();

// Returns an unsubscribe function.
export function onSave(listener){
  saveListeners.add(listener);
  return ()=>saveListeners.delete(listener);
}

// Reads one stored value: { decks, normalized } on success, null when it can't be parsed
// (an incomplete manual edit is then recovered from the backup copy).
export function parseStoredDecks(value){
  if(!value) return { decks: [], normalized: false };
  try{
    const parsed = JSON.parse(value);
    if(Array.isArray(parsed)) return { decks: parsed, normalized: false };
    // DevTools often makes it convenient to save just one deck object. Accept it
    // and rewrite it in the app's normal array format on the next save.
    if(parsed && typeof parsed === 'object' && Array.isArray(parsed.cards)) return { decks: [parsed], normalized: true };
  }catch(e){ /* fall through: caller tries the backup */ }
  return null;
}

// Early versions of this app used Spanish field names and a minutes/days mix for intervals.
// Maps a card from any of those shapes onto the current model (reps, interval in days,
// easeFactor, state, nextReview). Mutates the card; returns true if anything changed.
function migrateCard(card, now){
  let changed = false;
  const touch = ()=>{ changed = true; };

  if(card.pregunta){ card.question = card.pregunta; delete card.pregunta; touch(); }
  if(card.respuesta){ card.answer = card.respuesta; delete card.respuesta; touch(); }
  if(card.estado){
    card.state = { 'NUEVA':'NEW','APRENDIZAJE':'LEARNING','REPASO':'REVIEW' }[card.estado] || card.estado;
    delete card.estado; touch();
  }
  if(card.intervalo !== undefined){ card.intervalDays = card.intervalo; delete card.intervalo; touch(); }
  if(card.intervaloMinutes !== undefined){ card.intervalMinutes = card.intervaloMinutes; delete card.intervaloMinutes; touch(); }
  if(card.factorFacilidad !== undefined){ card.easeFactor = card.factorFacilidad; delete card.factorFacilidad; touch(); }
  if(card.fechaProximaRevision){ card.nextReview = card.fechaProximaRevision; delete card.fechaProximaRevision; touch(); }

  if(card.lastEvaluation === undefined){ card.lastEvaluation = card.lastEval || ''; touch(); }
  // legacy 'goodCount' was the consecutive-correct counter -> reps
  if(card.goodCount !== undefined && card.reps === undefined){ card.reps = Number(card.goodCount||0); delete card.goodCount; touch(); }
  if(card.reps === undefined){ card.reps = 0; touch(); }
  if(card.intervalDays !== undefined && card.interval === undefined){ card.interval = Number(card.intervalDays||0); delete card.intervalDays; touch(); }
  if(card.intervalMinutes !== undefined && card.interval === undefined){ card.interval = Math.round((Number(card.intervalMinutes)||0)/1440) || 0; delete card.intervalMinutes; touch(); }
  if(card.interval === undefined){ card.interval = 0; touch(); }
  if(card.easeFactor === undefined){ card.easeFactor = 2.5; touch(); }
  if(!card.state){ card.state = card.interval > 0 ? 'REVIEW' : 'NEW'; touch(); }
  if(!card.nextReview || Number.isNaN(new Date(card.nextReview).getTime())){ card.nextReview = now.toISOString(); touch(); }
  return changed;
}

// Drops non-object entries, guarantees every deck has a string id and a cards array, and
// migrates every card. Mutates the decks it is given. Returns { decks, changed }.
export function normalizeDecks(rawDecks, now=new Date()){
  const decks = rawDecks.filter(deck=>deck && typeof deck === 'object');
  let changed = decks.length !== rawDecks.length;

  decks.forEach((deck, index)=>{
    if(deck.id === undefined || deck.id === null){ deck.id = `migrated-${now.getTime()}-${index}`; changed = true; }
    else if(typeof deck.id !== 'string'){ deck.id = String(deck.id); changed = true; }
    if(!Array.isArray(deck.cards)){ deck.cards = []; changed = true; }
    const validCards = deck.cards.filter(card=>card && typeof card === 'object');
    if(validCards.length !== deck.cards.length){ deck.cards = validCards; changed = true; }
    deck.cards.forEach(card=>{ if(migrateCard(card, now)) changed = true; });
  });
  return { decks, changed };
}

export function loadDecks(){
  let decks;
  let needsSave = false;
  try{
    const store = globalThis.localStorage;
    let stored = parseStoredDecks(store.getItem(STORAGE_KEY));
    let restoredFromBackup = false;
    if(stored === null){
      stored = parseStoredDecks(store.getItem(STORAGE_BACKUP_KEY));
      if(stored === null) return [];
      restoredFromBackup = true;
      console.warn('Flashcards: restored the last valid saved data after an invalid Local Storage edit.');
    }
    const result = normalizeDecks(stored.decks);
    decks = result.decks;
    needsSave = result.changed || stored.normalized || restoredFromBackup;
  }catch(e){
    console.error('Flashcards: could not read saved decks.', e);
    return [];
  }
  if(needsSave){
    try{ saveDecks(decks); }
    catch(e){ console.warn('Flashcards: could not persist normalized decks.', e); }
  }
  return decks;
}

// `silent` skips the onSave listeners — used when applying data that came *from* the
// cloud, which must not be pushed straight back.
export function saveDecks(decks, { silent=false }={}){
  const serialized = JSON.stringify(decks);
  const store = globalThis.localStorage;
  store.setItem(STORAGE_KEY, serialized);
  store.setItem(STORAGE_BACKUP_KEY, serialized);
  if(!silent) saveListeners.forEach(listener=>listener(decks));
}

export function findDeck(decks, deckId){ return decks.find(deck=>String(deck.id) === String(deckId)); }

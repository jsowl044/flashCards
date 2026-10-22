// A study session over one deck's due cards.
import { $, showToast } from './dom.js';
import { loadDecks, saveDecks, findDeck } from './storage.js';
import { getDueCards, scheduleCard, projectedSchedule, mergeNewlyDue } from './scheduler.js';
import { renderDecks } from './decks-view.js';

const POLL_INTERVAL_MS = 5000;

// The queue is a snapshot of the cards due when the session starts; pollForNewlyDue()
// keeps it current while the session is open.
const session = { deckId: null, deckName: '', queue: [], index: 0, timer: null };

const currentCard = ()=>session.queue[session.index];

function stopPolling(){
  if(session.timer){ window.clearInterval(session.timer); session.timer = null; }
}

// Pulls in cards whose cooldown expires while the session is still open — either cards that
// weren't due yet when it started, or ones just rated Again/Hard whose short relearning
// step has already elapsed — instead of making the user reopen the deck to see them.
function pollForNewlyDue(){
  if(!session.deckId || $('study-view').classList.contains('hidden')) return;
  const deck = findDeck(loadDecks(), session.deckId);
  if(!deck) return;
  const merged = mergeNewlyDue(session.queue, session.index, deck.cards);
  if(merged !== session.queue){
    session.queue = merged;
    updateProgress();
  }
}

function updateProgress(){
  const remaining = Math.max(0, session.queue.length - session.index);
  $('study-deck-title').textContent = `${session.deckName} — ${remaining} card${remaining === 1 ? '' : 's'} left`;
}

function leaveStudy(){
  stopPolling();
  $('study-view').classList.add('hidden');
  $('decks-view').classList.remove('hidden');
  renderDecks();
}

function showCurrentCard(){
  const card = currentCard();
  if(!card){ leaveStudy(); return; }
  updateProgress();
  $('card-question').textContent = card.question;
  $('card-answer').textContent = card.answer;
  $('card-answer').classList.add('hidden');
  // hide the rating buttons until the answer is revealed (inline style as well, to be robust)
  const evaluation = $('evaluation');
  evaluation.classList.add('hidden');
  evaluation.style.display = 'none';
  $('show-answer').classList.remove('hidden');
  const typed = $('typed-answer');
  typed.value = '';
  typed.removeAttribute('disabled');
  $('typed-answer-display').classList.add('hidden');
  // preview, under each button, when the card would come back
  evaluation.querySelectorAll('button').forEach(btn=>{
    const label = btn.querySelector('.proj');
    if(label) label.textContent = projectedSchedule(card, btn.dataset.eval).human;
  });
}

function revealAnswer(){
  if(!currentCard()) return;
  const typed = $('typed-answer');
  const typedDisplay = $('typed-answer-display');
  const guess = typed.value.trim();
  $('card-answer').classList.remove('hidden');
  if(guess){
    typedDisplay.textContent = `Your answer: ${guess}`;
    typedDisplay.classList.remove('hidden');
  } else {
    typedDisplay.classList.add('hidden');
  }
  typed.setAttribute('disabled', 'true');
  const evaluation = $('evaluation');
  evaluation.classList.remove('hidden');
  evaluation.style.display = 'flex';
  $('show-answer').classList.add('hidden');
}

function rateCurrentCard(evaluationType){
  const card = currentCard();
  if(!card) return;
  scheduleCard(card, evaluationType);
  const decks = loadDecks();
  const deck = findDeck(decks, session.deckId);
  if(deck){
    const idx = deck.cards.findIndex(c=>c.id === card.id);
    if(idx >= 0) deck.cards[idx] = card;
    saveDecks(decks);
  }
  session.index++;
  if(session.index >= session.queue.length) leaveStudy();
  else showCurrentCard();
}

export function startStudy(deckId){
  const deck = findDeck(loadDecks(), deckId);
  if(!deck) return;
  const due = getDueCards(deck);
  if(due.length === 0){ showToast('No cards due today in this deck.'); return; }
  Object.assign(session, { deckId, deckName: deck.name, queue: due, index: 0 });
  $('decks-view').classList.add('hidden');
  $('study-view').classList.remove('hidden');
  showCurrentCard();
  stopPolling();
  session.timer = window.setInterval(pollForNewlyDue, POLL_INTERVAL_MS);
}

export function initStudy(){
  $('evaluation').classList.add('hidden');
  $('back-to-decks').addEventListener('click', leaveStudy);
  $('show-answer').addEventListener('click', revealAnswer);
  $('typed-answer').addEventListener('keydown', (ev)=>{
    if(ev.key === 'Enter'){ ev.preventDefault(); revealAnswer(); }
  });
  $('evaluation').addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button');
    if(btn) rateCurrentCard(btn.dataset.eval);
  });
}

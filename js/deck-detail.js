// The "manage deck" screen: rename, search, add / edit / delete cards, delete the deck.
import { $, escapeHtml, showError, showToast } from './dom.js';
import { loadDecks, findDeck } from './storage.js';
import { addCardToDeck, updateCard, deleteCard, deleteDeck, renameDeck } from './decks.js';
import { renderDecks } from './decks-view.js';

let currentDeckId = null;

const isOpen = ()=>!$('deck-detail').classList.contains('hidden');

// A destructive button asks for a second tap within 4 seconds instead of using confirm().
function armConfirm(btn, armedLabel){
  const original = btn.textContent;
  btn.dataset.confirm = '1';
  btn.textContent = armedLabel;
  setTimeout(()=>{ btn.dataset.confirm = '0'; btn.textContent = original; }, 4000);
}

/* ---------- add / edit card form ---------- */

function focusCardForm(){
  const form = $('add-card-form');
  const question = $('new-card-question');
  requestAnimationFrame(()=>{
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(()=>{
      try{ question.focus({ preventScroll: true }); }catch(e){ question.focus(); }
    }, 250);
  });
}

// The form and the docked search+add bar occupy the same bottom area,
// so only one of them should be visible at a time.
function setAddCardFormVisible(visible){
  $('add-card-form').classList.toggle('hidden', !visible);
  const bar = $('deck-bottom-bar');
  if(bar) bar.classList.toggle('hidden', visible);
}

function clearCardForm(){
  $('new-card-question').value = '';
  $('new-card-answer').value = '';
  delete $('save-card').dataset.editId;
  $('add-card-title').textContent = 'ADD CARD';
  $('save-card').textContent = 'Add';
}

function openAddCardForm(){
  clearCardForm();
  setAddCardFormVisible(true);
  focusCardForm();
}

function openEditCardForm(cardId){
  const deck = findDeck(loadDecks(), currentDeckId);
  const card = deck && deck.cards.find(c=>c.id === cardId);
  if(!card) return;
  $('new-card-question').value = card.question;
  $('new-card-answer').value = card.answer;
  $('save-card').dataset.editId = cardId;
  $('save-card').textContent = 'Save';
  $('add-card-title').textContent = 'EDIT CARD';
  setAddCardFormVisible(true);
  focusCardForm();
}

function submitCardForm(){
  const question = $('new-card-question').value.trim();
  const answer = $('new-card-answer').value.trim();
  if(!question || !answer){ showToast('Question and answer required'); return; }
  const editId = $('save-card').dataset.editId;
  if(editId) updateCard(currentDeckId, editId, question, answer);
  else addCardToDeck(currentDeckId, question, answer);
  clearCardForm();
  setAddCardFormVisible(false);
  renderDecks();
  refreshDeckDetailIfOpen();
}

/* ---------- deck-level actions ---------- */

// Cards save as soon as you edit them; the deck name behaves the same way instead of
// needing a separate Save button the user can forget to press.
function saveDeckNameIfChanged(){
  const input = $('detail-deck-name-input');
  if(!input || input.hasAttribute('disabled')) return;
  const newName = input.value.trim();
  input.setAttribute('disabled', 'true');
  if(!currentDeckId || !newName) return;
  if(renameDeck(currentDeckId, newName)) renderDecks();
}

function closeDeckDetail(){
  saveDeckNameIfChanged();
  setAddCardFormVisible(false);
  clearCardForm();
  $('card-search').value = '';
  $('card-search-clear').classList.add('hidden');
  $('deck-detail').classList.add('hidden');
  $('decks-list').classList.remove('hidden');
  document.querySelector('#decks-view .controls').classList.remove('hidden');
  renderDecks();
}

/* ---------- rendering ---------- */

export function renderDeckDetail(deckId){
  const list = $('deck-cards-list');
  const deck = findDeck(loadDecks(), deckId);
  if(!deck){ list.innerHTML = '<div class="card">Deck not found.</div>'; return; }

  const nameInput = $('detail-deck-name-input');
  nameInput.value = deck.name;
  nameInput.setAttribute('disabled', 'true');

  const search = $('card-search').value.trim().toLocaleLowerCase();
  const visibleCards = search
    ? deck.cards.filter(card=>`${card.question || ''} ${card.answer || ''}`.toLocaleLowerCase().includes(search))
    : deck.cards;
  $('detail-deck-meta').textContent = search
    ? `${deck.cards.length} cards · ${visibleCards.length} shown`
    : `${deck.cards.length} cards`;

  list.innerHTML = '';
  if(visibleCards.length === 0){
    list.innerHTML = `<div class="card">${search ? 'No matching cards.' : 'No cards in this deck.'}</div>`;
    return;
  }
  visibleCards.forEach(card=>{
    const el = document.createElement('div');
    el.className = 'card deck-item';
    el.innerHTML = `<div style="flex:1"><strong>${escapeHtml(card.question)}</strong><div class="deck-meta">${escapeHtml(card.answer)}</div></div>
      <div style="display:flex;flex-direction:column;gap:6px"><button class="btn" data-action="edit" data-id="${escapeHtml(card.id)}">Edit</button><button class="btn" data-action="delete" data-id="${escapeHtml(card.id)}">Delete</button></div>`;
    list.appendChild(el);
  });
}

export function refreshDeckDetailIfOpen(){
  if(currentDeckId && isOpen()) renderDeckDetail(currentDeckId);
}

export function openDeckDetail(deckId){
  try{
    if(!findDeck(loadDecks(), deckId)){ showError(`Deck not found: ${deckId}`); return; }
    currentDeckId = deckId;
    renderDeckDetail(deckId);
    $('deck-detail').classList.remove('hidden');
    $('decks-list').classList.add('hidden');
    document.querySelector('#decks-view .controls').classList.add('hidden');
    $('new-deck-form').classList.add('hidden');
  }catch(e){ showError('openDeckDetail failed: ' + e.message); }
}

/* ---------- events ---------- */

export function initDeckDetail(){
  $('deck-detail-back').addEventListener('click', closeDeckDetail);
  $('detail-add-card').addEventListener('click', openAddCardForm);
  $('cancel-card').addEventListener('click', ()=>{ setAddCardFormVisible(false); clearCardForm(); });
  $('save-card').addEventListener('click', submitCardForm);

  const deleteDeckBtn = $('delete-deck');
  deleteDeckBtn.addEventListener('click', ()=>{
    if(deleteDeckBtn.dataset.confirm !== '1'){ armConfirm(deleteDeckBtn, 'Confirm delete?'); return; }
    deleteDeck(currentDeckId);
    deleteDeckBtn.dataset.confirm = '0';
    deleteDeckBtn.textContent = 'Delete Deck';
    closeDeckDetail();
    showToast('Deck deleted');
  });

  const nameInput = $('detail-deck-name-input');
  $('detail-edit-name').addEventListener('click', ()=>{ nameInput.removeAttribute('disabled'); nameInput.focus(); });
  nameInput.addEventListener('blur', saveDeckNameIfChanged);
  nameInput.addEventListener('keydown', (ev)=>{ if(ev.key === 'Enter'){ ev.preventDefault(); nameInput.blur(); } });

  const searchInput = $('card-search');
  const searchClearBtn = $('card-search-clear');
  searchInput.addEventListener('input', ()=>{
    searchClearBtn.classList.toggle('hidden', !searchInput.value);
    refreshDeckDetailIfOpen();
  });
  searchClearBtn.addEventListener('click', ()=>{
    searchInput.value = '';
    searchClearBtn.classList.add('hidden');
    searchInput.focus();
    refreshDeckDetailIfOpen();
  });

  // Delegated: the card buttons are re-created on every render.
  $('deck-cards-list').addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button');
    if(!btn) return;
    const { action, id } = btn.dataset;
    if(action === 'edit'){ openEditCardForm(id); return; }
    if(action === 'delete'){
      if(btn.dataset.confirm !== '1'){ armConfirm(btn, 'Confirm?'); return; }
      deleteCard(currentDeckId, id);
      renderDeckDetail(currentDeckId);
      renderDecks();
    }
  });
}

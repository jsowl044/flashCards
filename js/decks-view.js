// The deck list (home screen).
import { $, escapeHtml, showError, showToast } from './dom.js';
import { loadDecks, STORAGE_KEY } from './storage.js';
import { createDeck, loadSampleDeck } from './decks.js';
import { getDueCards, computeNextDueInfo } from './scheduler.js';

export function renderDecks(){
  const list = $('decks-list');
  list.innerHTML = '';
  const decks = loadDecks();
  if(decks.length === 0){
    list.innerHTML = '<div class="card empty-state"><p>No decks yet. Create one, or try the app with a ready-made deck.</p><button class="btn primary" data-action="load-sample">Load sample deck</button></div>';
    return;
  }

  decks.forEach(deck=>{
    const due = getDueCards(deck).length;
    const el = document.createElement('div');
    el.className = 'card deck-item';
    el.innerHTML = `<div class="deck-info"><strong>${escapeHtml(deck.name)}</strong><div class="deck-meta">Due today: ${due} · Total: ${deck.cards.length} · ${escapeHtml(computeNextDueInfo(deck))}</div></div>
      <div class="deck-actions"><button class="btn primary" data-action="study" data-id="${escapeHtml(deck.id)}" ${due === 0 ? 'disabled' : ''}>Study</button> <button class="btn icon" aria-label="Manage" data-action="manage" data-id="${escapeHtml(deck.id)}">⚙️</button></div>`;
    list.appendChild(el);
  });
}

// Re-render only when nothing else is open, so a background refresh (timer, another tab,
// a cloud update) never replaces the DOM while the user is typing or managing a deck.
export function refreshDecksIfIdle(){
  const decksView = $('decks-view');
  const detail = $('deck-detail');
  const newDeckForm = $('new-deck-form');
  if(decksView && !decksView.classList.contains('hidden') && detail.classList.contains('hidden') && newDeckForm.classList.contains('hidden')){
    renderDecks();
  }
}

export function initDecksView({ onStudy, onManage }){
  renderDecks();
  window.setInterval(refreshDecksIfIdle, 30000);
  window.addEventListener('storage', (event)=>{ if(event.key === STORAGE_KEY) refreshDecksIfIdle(); });

  $('new-deck-btn').addEventListener('click', ()=>$('new-deck-form').classList.remove('hidden'));
  $('cancel-deck').addEventListener('click', ()=>$('new-deck-form').classList.add('hidden'));
  $('create-deck').addEventListener('click', ()=>{
    const name = $('deck-name').value.trim();
    if(!name){ showToast('Name required'); return; }
    createDeck(name);
    $('deck-name').value = '';
    $('new-deck-form').classList.add('hidden');
    renderDecks();
  });

  // One delegated listener: the buttons are re-created on every render.
  $('decks-list').addEventListener('click', (ev)=>{
    try{
      const btn = ev.target.closest('button');
      if(!btn) return;
      const { action, id } = btn.dataset;
      if(action === 'study') onStudy(id);
      if(action === 'manage') onManage(id);
      if(action === 'load-sample'){ loadSampleDeck(); renderDecks(); }
    }catch(e){ showError('Error handling deck action: ' + e.message); }
  });
}

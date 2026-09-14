// Flashcards PWA — app.js
const STORAGE_KEY = 'flashcards_decks_v1';
const STORAGE_BACKUP_KEY = 'flashcards_decks_backup_v1';

/* Utility */
const $ = (id)=>document.getElementById(id);
const todayISO = (offsetDays=0)=>{
  const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+offsetDays); return d.toISOString();
}

/* Data layer */
function parseStoredDecks(value){
  if(!value) return { decks: [], normalized: false };
  try{
    const parsed = JSON.parse(value);
    if(Array.isArray(parsed)) return { decks: parsed, normalized: false };
    // DevTools often makes it convenient to save just one deck object. Accept it
    // and rewrite it in the app's normal array format on the next save.
    if(parsed && typeof parsed === 'object' && Array.isArray(parsed.cards)) return { decks: [parsed], normalized: true };
  }catch(e){ /* An incomplete manual JSON edit can be recovered from the backup. */ }
  return null;
}

function loadDecks(){
  try{
    let stored = parseStoredDecks(localStorage.getItem(STORAGE_KEY));
    let restoredFromBackup = false;
    if(stored === null){
      stored = parseStoredDecks(localStorage.getItem(STORAGE_BACKUP_KEY));
      if(stored === null) return [];
      restoredFromBackup = true;
      console.warn('Flashcards: restored the last valid saved data after an invalid Local Storage edit.');
    }
    const data = stored.decks.filter(deck=>deck && typeof deck === 'object');
    let changed = stored.normalized || restoredFromBackup || data.length !== stored.decks.length;
    // migrate older Spanish field names to English keys
    data.forEach((deck, index)=>{
      if(deck){
        if(deck.id === undefined || deck.id === null){ deck.id = `migrated-${Date.now()}-${index}`; changed = true; }
        else if(typeof deck.id !== 'string'){ deck.id = String(deck.id); changed = true; }
        if(!Array.isArray(deck.cards)){ deck.cards = []; changed = true; }
        const validCards = deck.cards.filter(card=>card && typeof card === 'object');
        if(validCards.length !== deck.cards.length){ deck.cards = validCards; changed = true; }
        deck.cards.forEach(card=>{
          if(card.pregunta){ card.question = card.pregunta; delete card.pregunta; changed = true; }
          if(card.respuesta){ card.answer = card.respuesta; delete card.respuesta; changed = true; }
          if(card.estado){
            const m = { 'NUEVA':'NEW','APRENDIZAJE':'LEARNING','REPASO':'REVIEW' }[card.estado] || card.estado;
            card.state = m; delete card.estado; changed = true;
          }
            if(card.intervalo !== undefined){ card.intervalDays = card.intervalo; delete card.intervalo; changed = true; }
            if(card.intervaloMinutes !== undefined){ card.intervalMinutes = card.intervaloMinutes; delete card.intervaloMinutes; changed = true; }
            if(card.factorFacilidad !== undefined){ card.easeFactor = card.factorFacilidad; delete card.factorFacilidad; changed = true; }
            if(card.fechaProximaRevision){ card.nextReview = card.fechaProximaRevision; delete card.fechaProximaRevision; changed = true; }
            // normalize legacy fields into the SM-2 model: reps, interval (days), easeFactor
            if(card.lastEvaluation === undefined){ card.lastEvaluation = card.lastEval || ''; changed = true; }
            // legacy 'goodCount' used previously as consecutive correct count -> map to reps
            if(card.goodCount !== undefined && card.reps === undefined){ card.reps = Number(card.goodCount||0); delete card.goodCount; changed = true; }
            if(card.reps === undefined){ card.reps = 0; changed = true; }
            // map intervalDays/intervalo -> interval (days)
            if(card.intervalDays !== undefined && card.interval === undefined){ card.interval = Number(card.intervalDays||0); delete card.intervalDays; changed = true; }
            if(card.intervalMinutes !== undefined && card.interval === undefined){ card.interval = Math.round((Number(card.intervalMinutes)||0)/1440) || 0; delete card.intervalMinutes; changed = true; }
            if(card.interval === undefined){ card.interval = 0; changed = true; }
            if(card.easeFactor === undefined){ card.easeFactor = 2.5; changed = true; }
            if(!card.state){ card.state = card.interval > 0 ? 'REVIEW' : 'NEW'; changed = true; }
            if(!card.nextReview || Number.isNaN(new Date(card.nextReview).getTime())){ card.nextReview = new Date().toISOString(); changed = true; }
        });
      }
    });
    if(changed) saveDecks(data);
    return data;
  }catch(e){return []}
}
function saveDecks(decks){
  const serialized = JSON.stringify(decks);
  localStorage.setItem(STORAGE_KEY, serialized);
  localStorage.setItem(STORAGE_BACKUP_KEY, serialized);
}
function findDeck(decks, deckId){ return decks.find(deck=>String(deck.id) === String(deckId)); }

/* Export / Import (JSON backup) */
function exportDecks(){
  const decks = loadDecks();
  const blob = new Blob([JSON.stringify(decks, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0,10);
  const a = document.createElement('a');
  a.href = url; a.download = `flashcards-backup-${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

// Imported decks/cards get fresh ids and are appended (never overwrite existing data).
// loadDecks() will normalize any missing/legacy fields on the next read.
function importDecksFromFile(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    let parsed;
    try{ parsed = JSON.parse(reader.result); }
    catch(e){ showToast('Import failed: invalid JSON file'); return; }
    const importedDecks = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.cards) ? [parsed] : null);
    if(!importedDecks){ showToast('Import failed: unrecognized file format'); return; }
    const decks = loadDecks();
    let addedDecks = 0;
    importedDecks.forEach(deck=>{
      if(!deck || typeof deck !== 'object') return;
      const cards = Array.isArray(deck.cards) ? deck.cards.filter(c=>c && typeof c==='object') : [];
      decks.push({
        id: `imported-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        name: deck.name || 'Imported deck',
        cards: cards.map(c=>({ ...c, id: `imported-${Date.now()}-${Math.random().toString(36).slice(2,8)}` }))
      });
      addedDecks++;
    });
    if(addedDecks === 0){ showToast('Import failed: no valid decks found'); return; }
    saveDecks(decks);
    renderDecks();
    showToast(`Imported ${addedDecks} deck${addedDecks===1?'':'s'}`);
  };
  reader.onerror = ()=> showToast('Import failed: could not read file');
  reader.readAsText(file);
}

function createDeck(name){
  const decks=loadDecks();
  const deck={id:Date.now().toString(),name,cards:[]};
  decks.push(deck); saveDecks(decks); return deck;
}

function deleteDeck(deckId){
  const decks=loadDecks();
  const next=decks.filter(d=>String(d.id)!==String(deckId));
  saveDecks(next);
}

function addCardToDeck(deckId, question, answer){
  const decks=loadDecks();
  const deck=findDeck(decks, deckId); if(!deck) return null;
  const card={
    id:Date.now().toString()+Math.random().toString(36).slice(2,6),
    question:question,
    answer:answer,
    state:'NEW',
    // SM-2 fields
    reps:0,
    interval:0, // days
    easeFactor:2.5,
    lastEvaluation:'',
    nextReview: new Date().toISOString()
  };
  deck.cards.push(card); saveDecks(decks); return card;
}

// Longer-interval (more mature) cards first, descending down to the shortest-cooldown
// learning cards; ties broken by how long a card has been overdue (most overdue first).
function compareByCooldown(a, b){
  const diff = Number(b.interval || 0) - Number(a.interval || 0);
  if(diff !== 0) return diff;
  return (a.nextReview || '').localeCompare(b.nextReview || '');
}

function getDueCards(deck){
  const nowISO = new Date().toISOString();
  return (deck.cards || []).filter(c=>c && c.nextReview <= nowISO).sort(compareByCooldown);
}

/* Scheduling. The same calculation powers the buttons and the saved card. */
function roundInterval(days){ return Math.max(1, Math.round(days * 10) / 10); }

function calculateSchedule(card, evaluation, now=new Date()){
  const nextCard = {
    ...card,
    easeFactor: Number(card.easeFactor || 2.5),
    reps: Number(card.reps || 0),
    interval: Number(card.interval || 0)
  };
  const next = new Date(now);
  let minutes = null;
  let days = null;
  const inLearning = nextCard.state !== 'REVIEW';

  if(inLearning){
    if(evaluation === 'again'){
      minutes = 1; nextCard.reps = 0; nextCard.easeFactor = Math.max(1.3, +(nextCard.easeFactor - 0.20).toFixed(2)); nextCard.state = 'LEARNING';
    } else if(evaluation === 'hard'){
      minutes = 8; nextCard.reps = 0; nextCard.easeFactor = Math.max(1.3, +(nextCard.easeFactor - 0.15).toFixed(2)); nextCard.state = 'LEARNING';
    } else if(evaluation === 'good'){
      if(nextCard.reps >= 1){
        days = 1; nextCard.reps = 1; nextCard.interval = 1; nextCard.state = 'REVIEW';
      } else {
        minutes = 15; nextCard.reps = 1; nextCard.interval = 0; nextCard.state = 'LEARNING';
      }
    } else if(evaluation === 'easy'){
      days = 4; nextCard.reps = 1; nextCard.interval = 4; nextCard.easeFactor = +(nextCard.easeFactor + 0.15).toFixed(2); nextCard.state = 'REVIEW';
    }
  } else {
    if(evaluation === 'again'){
      minutes = 1; nextCard.reps = 0; nextCard.interval = 0; nextCard.easeFactor = Math.max(1.3, +(nextCard.easeFactor - 0.20).toFixed(2)); nextCard.state = 'LEARNING';
    } else if(evaluation === 'hard'){
      days = roundInterval(nextCard.interval * 1.2);
      nextCard.easeFactor = Math.max(1.3, +(nextCard.easeFactor - 0.15).toFixed(2));
      // A Hard review has already moved the card beyond its first 1-day review.
      // Without this, later Good/Easy evaluations would keep using the fixed 6-day step.
      nextCard.reps = Math.max(2, nextCard.reps);
      nextCard.interval = days;
    } else if(evaluation === 'good'){
      nextCard.reps += 1;
      days = nextCard.reps === 2 ? 6 : roundInterval(nextCard.interval * nextCard.easeFactor);
      nextCard.interval = days;
    } else if(evaluation === 'easy'){
      const nextReps = nextCard.reps + 1;
      // The second successful review has a fixed 6-day Good interval. Easy must
      // be later than that too, rather than being calculated from the old 1-day interval.
      const goodDays = nextReps === 2
        ? 6
        : roundInterval(nextCard.interval * nextCard.easeFactor);
      nextCard.reps = nextReps;
      nextCard.easeFactor = +(nextCard.easeFactor + 0.15).toFixed(2);
      // Easy is meaningfully later than Good, including on the initial 6-day review.
      days = Math.max(roundInterval(goodDays * 1.3), roundInterval(nextCard.interval * nextCard.easeFactor * 1.3));
      nextCard.interval = days;
    }
  }

  if(minutes !== null) next.setTime(now.getTime() + minutes * 60 * 1000);
  else next.setTime(now.getTime() + days * 24 * 60 * 60 * 1000);
  nextCard.lastEvaluation = evaluation;
  nextCard.nextReview = next.toISOString();
  return { card: nextCard, minutes: minutes === null ? days * 1440 : minutes, days: days === null ? Math.round(minutes / 1440) : days };
}

function scheduleCard(card, evaluation){ Object.assign(card, calculateSchedule(card, evaluation).card); }

/* UI */
let currentDeckId = null;
let studyQueue = [];
let currentIndex = 0;
let studyDeckName = '';
let studyPollTimer = null;

function showError(msg){ try{ const el=$('app-errors'); if(el){ el.textContent = msg; el.classList.remove('hidden'); } }catch(e){} console.error(msg); }
window.addEventListener('error', (e)=>{ showError(`${e.message} at ${e.filename||e.fileName}:${e.lineno||e.lineNumber}`); });
window.addEventListener('unhandledrejection', (e)=>{ showError('Unhandled Rejection: '+String(e.reason)); });

function showToast(msg, timeout=3000){ try{ const t = $('app-toast'); if(t){ t.textContent = msg; t.classList.remove('hidden'); setTimeout(()=>{ t.classList.add('hidden'); t.textContent=''; }, timeout); } }catch(e){} }

function renderDecks(){
  const list = $("decks-list"); list.innerHTML='';
  const decks = loadDecks();
    if(decks.length===0){
      list.innerHTML = '<div class="card">No decks yet. Create one.</div>';
    return;
  }

  decks.forEach(deck=>{
    const due = getDueCards(deck).length;
    const total = deck.cards.length;
    const nextDueInfo = computeNextDueInfo(deck);
    const el = document.createElement('div'); el.className='card deck-item';
      el.innerHTML = `<div class="deck-info"><strong>${escapeHtml(deck.name)}</strong><div class="deck-meta">Due today: ${due} · Total: ${total} · ${escapeHtml(nextDueInfo)}</div></div>
      <div class="deck-actions"><button class="btn primary" data-action="study" data-id="${deck.id}" ${due===0? 'disabled':''}>Study</button> <button class="btn icon" aria-label="Manage" data-action="manage" data-id="${deck.id}">⚙️</button></div>`
    list.appendChild(el);
    // attach direct handler to Manage button as fallback
    try{
      const m = el.querySelector('button[aria-label="Manage"]'); if(m){ m.addEventListener('click', (ev)=>{ ev.stopPropagation(); try{ openDeckDetail(deck.id); }catch(e){ showError('openDeckDetail error: '+e.message); } }); }
    }catch(e){/* ignore */}
  });
}

function computeNextDueInfo(deck){
  if(!deck.cards || deck.cards.length===0) return '—';
  const dates = deck.cards.map(c=>c.nextReview).filter(Boolean);
  if(dates.length===0) return '—';
  const minDate = dates.reduce((a,b)=> a < b ? a : b);
  const now = new Date(); const d = new Date(minDate);
  const diffMs = d - now;
  // Match getDueCards' exact comparison so this label never says "now" before a card is actually due.
  if(diffMs <= 0) return 'now';
  const diffMinutes = Math.ceil(diffMs / (1000*60));
  if(diffMinutes < 60) return `in ${diffMinutes} min`;
  if(diffMinutes < 1440){ const hrs = Math.round(diffMinutes/60); return `in ${hrs} h`; }
  const days = Math.round(diffMinutes / 144) / 10;
  if(days===1) return 'tomorrow';
  return `${days} days`;
}

function projectedSchedule(card, evaluation){
  const schedule = calculateSchedule(card, evaluation);
  const displayDays = Math.round(schedule.minutes / 144) / 10;
  const human = schedule.minutes < 60
    ? `${schedule.minutes} min`
    : schedule.minutes < 1440
      ? `${Math.round(schedule.minutes / 60)} h`
      : `${displayDays} day${displayDays === 1 ? '' : 's'}`;
  return {...schedule, human};
}

function escapeHtml(s){ return (s||'').toString().replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])) }

function refreshDecksIfIdle(){
  const decksView = $('decks-view');
  const detail = $('deck-detail');
  const newDeckForm = $('new-deck-form');
  // Avoid replacing the DOM while the user is typing or managing a deck.
  if(decksView && !decksView.classList.contains('hidden') && detail.classList.contains('hidden') && newDeckForm.classList.contains('hidden')){
    renderDecks();
  }
}

/* Events */
document.addEventListener('DOMContentLoaded', ()=>{
  renderDecks();
  window.setInterval(refreshDecksIfIdle, 30000);
  window.addEventListener('storage', (event)=>{ if(event.key === STORAGE_KEY) refreshDecksIfIdle(); });
  // apply theme according to OS preference (light/dark)
  try{
    const applyTheme = (dark)=> document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if(mq){ applyTheme(mq.matches); mq.addEventListener('change', e=> applyTheme(e.matches)); }
    else applyTheme(true);
  }catch(e){/* ignore */}
  // ensure evaluation buttons are hidden initially
  const evalEl = $('evaluation'); if(evalEl) evalEl.classList.add('hidden');
  // quick check: ensure style.css loads; if not, show instruction
  // remove previous cache helper; rely on SW activation to manage caches
  // buttons
  $('new-deck-btn').addEventListener('click', ()=>$('new-deck-form').classList.remove('hidden'));
  $('cancel-deck').addEventListener('click', ()=>$('new-deck-form').classList.add('hidden'));
  $('create-deck').addEventListener('click', ()=>{
    const name=$('deck-name').value.trim(); if(!name){ showToast('Name required'); return; }
    createDeck(name); $('deck-name').value=''; $('new-deck-form').classList.add('hidden'); renderDecks();
  });

  // export / import
  $('export-btn').addEventListener('click', ()=>{
    if(loadDecks().length===0){ showToast('No decks to export'); return; }
    exportDecks();
  });
  const importInput = $('import-file-input');
  $('import-btn').addEventListener('click', ()=> importInput.click());
  importInput.addEventListener('change', ()=>{
    const file = importInput.files && importInput.files[0];
    if(file) importDecksFromFile(file);
    importInput.value = '';
  });


  // deck actions (delegation) with error surface
  document.getElementById('decks-list').addEventListener('click', (ev)=>{
    try{
      const btn = ev.target.closest('button'); if(!btn) return;
      const action = btn.dataset.action; const id=btn.dataset.id;
      if(action==='study') startStudy(id);
      if(action==='manage') openDeckDetail(id);
    }catch(e){ showError('Error handling deck action: '+e.message); }
  });

  // add / edit card form
  $('cancel-card').addEventListener('click', ()=>{ $('add-card-form').classList.add('hidden'); clearCardForm(); });
  $('save-card').addEventListener('click', ()=>{
    const q=$('new-card-question').value.trim(); const a=$('new-card-answer').value.trim(); if(!q||!a){ showToast('Question and answer required'); return; }
    const editId = $('save-card').dataset.editId;
    if(editId){
      updateCard(currentDeckId, editId, q, a);
    } else {
      addCardToDeck(currentDeckId,q,a);
    }
    clearCardForm(); $('add-card-form').classList.add('hidden'); renderDecks(); if(document.getElementById('deck-detail') && !document.getElementById('deck-detail').classList.contains('hidden')) renderDeckDetail(currentDeckId);
  });

  // deck detail controls
  $('close-detail').addEventListener('click', closeDeckDetail);
  $('detail-add-card').addEventListener('click', ()=>{ openAddCardForm(currentDeckId); });
  const deleteDeckBtn = $('delete-deck');
  if(deleteDeckBtn){
    deleteDeckBtn.addEventListener('click', ()=>{
      if(deleteDeckBtn.dataset.confirm==='1'){
        deleteDeck(currentDeckId);
        deleteDeckBtn.dataset.confirm='0';
        deleteDeckBtn.textContent='Delete Deck';
        closeDeckDetail();
        showToast('Deck deleted');
      } else {
        deleteDeckBtn.dataset.confirm='1';
        deleteDeckBtn.textContent='Confirm delete?';
        setTimeout(()=>{ deleteDeckBtn.dataset.confirm='0'; deleteDeckBtn.textContent='Delete Deck'; }, 4000);
      }
    });
  }
  $('detail-edit-name').addEventListener('click', ()=>{ const input = $('detail-deck-name-input'); input.removeAttribute('disabled'); input.focus(); });
  $('card-search').addEventListener('input', ()=>{ if(currentDeckId && !$('deck-detail').classList.contains('hidden')) renderDeckDetail(currentDeckId); });
  // save deck metadata
  const saveDeckBtn = $('save-deck'); if(saveDeckBtn){ saveDeckBtn.addEventListener('click', ()=>{
    const nameInput = $('detail-deck-name-input'); if(!nameInput) return; const newName = nameInput.value.trim(); if(!newName){ showToast('Deck name required'); return; }
    const decks = loadDecks(); const deck = findDeck(decks, currentDeckId); if(!deck) return; deck.name = newName; saveDecks(decks); renderDeckDetail(currentDeckId); renderDecks(); showToast('Deck saved');
    // close detail view after saving (save implies close)
    closeDeckDetail();
  }); }

  // study view
  $('back-to-decks').addEventListener('click', ()=>{ stopStudyPolling(); $('study-view').classList.add('hidden'); $('decks-view').classList.remove('hidden'); renderDecks(); });
  $('show-answer').addEventListener('click', ()=>{ revealAnswer(); });

  const ta = $('typed-answer');
  if(ta){
    ta.addEventListener('keydown', (ev)=>{
      if(ev.key === 'Enter'){
        ev.preventDefault(); revealAnswer();
      }
    });
  }

  $('evaluation').addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button'); if(!btn) return; const evType = btn.dataset.eval; handleEvaluation(evType);
  });
});

function focusCardForm(){
  const form = $('add-card-form');
  const question = $('new-card-question');
  requestAnimationFrame(()=>{
    form.scrollIntoView({behavior:'smooth', block:'center'});
    setTimeout(()=>{
      try{ question.focus({preventScroll:true}); }catch(e){ question.focus(); }
    }, 250);
  });
}

function openAddCardForm(deckId){ currentDeckId = deckId; clearCardForm(); $('add-card-form').classList.remove('hidden'); focusCardForm(); }

function closeDeckDetail(){
  $('add-card-form').classList.add('hidden');
  clearCardForm();
  $('card-search').value = '';
  $('deck-detail').classList.add('hidden');
  $('decks-list').classList.remove('hidden');
  document.querySelector('#decks-view .controls').classList.remove('hidden');
  renderDecks();
}

function clearCardForm(){
  $('new-card-question').value=''; $('new-card-answer').value=''; delete $('save-card').dataset.editId; $('add-card-title').textContent='ADD CARD';
  const saveBtn = $('save-card'); if(saveBtn) saveBtn.textContent = 'Add';
}

function openDeckDetail(deckId){
  try{
    currentDeckId = deckId;
    // debug info to help diagnose missing deck rendering
    const decks = loadDecks();
    if(!Array.isArray(decks) || decks.length===0){ showError('No decks loaded from storage.'); }
    const deckExists = Boolean(findDeck(decks, deckId));
    renderDeckDetail(deckId);
    if(!deckExists){ const ids = decks.map(d=>d.id).slice(0,10).join(','); showError(`Deck not found: ${deckId}. Loaded decks: ${ids}`); }
       $('deck-detail').classList.remove('hidden');
       $('decks-list').classList.add('hidden');
       document.querySelector('#decks-view .controls').classList.add('hidden');
       $('new-deck-form').classList.add('hidden');
  }catch(e){ showError('openDeckDetail failed: '+e.message); }
}

function renderDeckDetail(deckId){
  const decks = loadDecks(); const deck = findDeck(decks, deckId);
  const list = $('deck-cards-list');
  if(!deck){ if(list) list.innerHTML = '<div class="card">Deck not found.</div>'; return; }
  // populate editable name input and show deck-only details
  const nameInput = $('detail-deck-name-input'); if(nameInput){ nameInput.value = deck.name; nameInput.setAttribute('disabled','true'); }
  const search = $('card-search').value.trim().toLocaleLowerCase();
  const visibleCards = search
    ? deck.cards.filter(card=>`${card.question || ''} ${card.answer || ''}`.toLocaleLowerCase().includes(search))
    : deck.cards;
  const meta = $('detail-deck-meta'); if(meta) meta.textContent = search ? `${deck.cards.length} cards · ${visibleCards.length} shown` : `${deck.cards.length} cards`;
  const closeBtn = $('close-detail'); if(closeBtn){ closeBtn.classList.remove('hidden'); }
  list.innerHTML='';
  if(visibleCards.length===0){ list.innerHTML=`<div class="card">${search ? 'No matching cards.' : 'No cards in this deck.'}</div>`; return; }
  visibleCards.forEach(card=>{
    const el = document.createElement('div'); el.className='card deck-item';
    el.innerHTML = `<div style="flex:1"><strong>${escapeHtml(card.question)}</strong><div class="deck-meta">${escapeHtml(card.answer)}</div></div>
      <div style="display:flex;flex-direction:column;gap:6px"><button class="btn" data-action="edit" data-id="${card.id}">Edit</button><button class="btn" data-action="delete" data-id="${card.id}">Delete</button></div>`;
    list.appendChild(el);
  });
  // actions inside detail
  // attach handlers with non-blocking confirm for delete
  list.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const action = btn.dataset.action; const id = btn.dataset.id;
      if(action==='edit') return openEditCardForm(id);
      if(action==='delete'){
        // two-step confirm: first click asks for confirmation by toggling state
        if(btn.dataset.confirm==='1'){
          deleteCard(deckId,id); renderDeckDetail(deckId); renderDecks();
        } else {
          btn.dataset.confirm='1'; const original = btn.textContent; btn.textContent='Confirm?';
          setTimeout(()=>{ btn.dataset.confirm='0'; btn.textContent=original; }, 4000);
        }
      }
    });
  });
}

function openEditCardForm(cardId){
  const decks = loadDecks(); const deck = findDeck(decks, currentDeckId); if(!deck) return;
  const card = deck.cards.find(c=>c.id===cardId); if(!card) return;
  $('new-card-question').value = card.question; $('new-card-answer').value = card.answer; $('save-card').dataset.editId = cardId; $('add-card-title').textContent='EDIT CARD'; $('add-card-form').classList.remove('hidden'); focusCardForm();
  const saveBtn = $('save-card'); if(saveBtn) saveBtn.textContent = 'Save';
}

function updateCard(deckId, cardId, question, answer){
  const decks = loadDecks(); const deck = findDeck(decks, deckId); if(!deck) return;
  const idx = deck.cards.findIndex(c=>c.id===cardId); if(idx<0) return;
  deck.cards[idx].question = question; deck.cards[idx].answer = answer; saveDecks(decks);
}

function deleteCard(deckId, cardId){
  const decks = loadDecks(); const deck = findDeck(decks, deckId); if(!deck) return;
  deck.cards = deck.cards.filter(c=>c.id!==cardId); saveDecks(decks);
}

function startStudy(deckId){
  const decks = loadDecks(); const deck = findDeck(decks, deckId); if(!deck) return;
  const due = getDueCards(deck);
  if(due.length===0){ showToast('No cards due today in this deck.'); return; }
  currentDeckId = deckId; studyQueue = due; currentIndex = 0; studyDeckName = deck.name;
  $('decks-view').classList.add('hidden'); $('study-view').classList.remove('hidden'); showCurrentCard();
  startStudyPolling();
}

// Pulls in cards whose cooldown expires while the session is still open — either
// cards that weren't due yet when the session started, or ones just evaluated
// Again/Hard whose short relearning step has already elapsed — instead of making
// the user reopen the deck to see them.
function startStudyPolling(){
  stopStudyPolling();
  studyPollTimer = window.setInterval(pollForNewlyDueCards, 5000);
}

function stopStudyPolling(){
  if(studyPollTimer){ window.clearInterval(studyPollTimer); studyPollTimer = null; }
}

function pollForNewlyDueCards(){
  if(!currentDeckId || $('study-view').classList.contains('hidden')) return;
  const decks = loadDecks(); const deck = findDeck(decks, currentDeckId); if(!deck) return;
  const nowISO = new Date().toISOString();
  // Never touches index <= currentIndex, so the card currently on screen can't be swapped
  // out from under an in-progress answer.
  const remainingIds = new Set(studyQueue.slice(currentIndex).map(c=>c.id));
  const newlyDue = (deck.cards || []).filter(c=>c && c.nextReview <= nowISO && !remainingIds.has(c.id));
  if(newlyDue.length === 0) return;
  const tail = studyQueue.slice(currentIndex + 1).concat(newlyDue).sort(compareByCooldown);
  studyQueue = studyQueue.slice(0, currentIndex + 1).concat(tail);
  updateStudyProgress();
}

function updateStudyProgress(){
  const remaining = Math.max(0, studyQueue.length - currentIndex);
  $('study-deck-title').textContent = `${studyDeckName} — ${remaining} card${remaining === 1 ? '' : 's'} left`;
}

function showCurrentCard(){
  const card = studyQueue[currentIndex]; if(!card) return finishStudy();
  updateStudyProgress();
  $('card-question').textContent = card.question;
  $('card-answer').textContent = card.answer;
  $('card-answer').classList.add('hidden');
  // ensure evaluation buttons are hidden until reveal (use inline style to be robust)
  const evalEl = $('evaluation'); if(evalEl){ evalEl.classList.add('hidden'); evalEl.style.display = 'none'; }
  const showBtn = $('show-answer'); if(showBtn) showBtn.classList.remove('hidden');
  // reset typed answer field
  const ta = $('typed-answer'); if(ta){ ta.value=''; ta.removeAttribute('disabled'); }
  const td = $('typed-answer-display'); if(td) td.classList.add('hidden');
  // update projection labels on buttons
  try{
    const btns = document.querySelectorAll('#evaluation button');
    btns.forEach(b=>{
      const ev = b.dataset.eval; const proj = projectedSchedule(card, ev);
      const span = b.querySelector('.proj'); if(span) span.textContent = `${proj.human}`;
    });
  }catch(e){}
}

function revealAnswer(){
  const card = studyQueue[currentIndex]; if(!card) return;
  // reveal answer; show typed-answer display if user typed something
  const ta = $('typed-answer'); const display = $('typed-answer-display');
  const val = ta ? ta.value.trim() : '';
  $('card-answer').classList.remove('hidden');
  if(display){
    if(val){ display.textContent = `Your answer: ${val}`; display.classList.remove('hidden'); }
    else { display.classList.add('hidden'); }
  }
  if(ta) ta.setAttribute('disabled','true');
  const evalEl = $('evaluation'); if(evalEl){ evalEl.classList.remove('hidden'); evalEl.style.display = 'flex'; }
  $('show-answer').classList.add('hidden');
}

function handleEvaluation(evType){
  const card = studyQueue[currentIndex]; if(!card) return;
  scheduleCard(card, evType);
  // persist update
  const decks = loadDecks(); const deck = findDeck(decks, currentDeckId); if(deck){
    const idx = deck.cards.findIndex(c=>c.id===card.id); if(idx>=0) deck.cards[idx]=card; saveDecks(decks);
  }
  // next
  currentIndex++; if(currentIndex>=studyQueue.length) return finishStudy(); showCurrentCard();
}

function finishStudy(){
  stopStudyPolling();
  $('study-view').classList.add('hidden'); $('decks-view').classList.remove('hidden'); renderDecks();
}

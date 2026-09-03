// Flashcards PWA — app.js
const STORAGE_KEY = 'flashcards_decks_v1';

/* Utility */
const $ = (id)=>document.getElementById(id);
const todayISO = (offsetDays=0)=>{
  const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+offsetDays); return d.toISOString();
}

/* Data layer */
function loadDecks(){
  try{
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]') || [];
    // migrate older Spanish field names to English keys
    data.forEach(deck=>{
      if(deck && Array.isArray(deck.cards)){
        deck.cards.forEach(card=>{
          if(!card) return;
          if(card.pregunta){ card.question = card.pregunta; delete card.pregunta; }
          if(card.respuesta){ card.answer = card.respuesta; delete card.respuesta; }
          if(card.estado){
            const m = { 'NUEVA':'NEW','APRENDIZAJE':'LEARNING','REPASO':'REVIEW' }[card.estado] || card.estado;
            card.state = m; delete card.estado;
          }
            if(card.intervalo !== undefined){ card.intervalDays = card.intervalo; delete card.intervalo; }
            if(card.intervaloMinutes !== undefined){ card.intervalMinutes = card.intervaloMinutes; delete card.intervaloMinutes; }
            if(card.factorFacilidad !== undefined){ card.easeFactor = card.factorFacilidad; delete card.factorFacilidad; }
            if(card.fechaProximaRevision){ card.nextReview = card.fechaProximaRevision; delete card.fechaProximaRevision; }
            // normalize legacy fields into the SM-2 model: reps, interval (days), easeFactor
            if(card.lastEvaluation === undefined) card.lastEvaluation = card.lastEval || '';
            // legacy 'goodCount' used previously as consecutive correct count -> map to reps
            if(card.goodCount !== undefined && card.reps === undefined){ card.reps = Number(card.goodCount||0); delete card.goodCount; }
            if(card.reps === undefined) card.reps = Number(card.reps||0);
            // map intervalDays/intervalo -> interval (days)
            if(card.intervalDays !== undefined && card.interval === undefined){ card.interval = Number(card.intervalDays||0); delete card.intervalDays; }
            if(card.intervalMinutes !== undefined && card.interval === undefined){ card.interval = Math.round((Number(card.intervalMinutes)||0)/1440) || 0; delete card.intervalMinutes; }
            if(card.interval === undefined) card.interval = Number(card.interval||0);
            if(card.easeFactor === undefined) card.easeFactor = Number(card.easeFactor||2.5);
        });
      }
    });
    return data;
  }catch(e){return []}
}
function saveDecks(decks){ localStorage.setItem(STORAGE_KEY, JSON.stringify(decks)); }

function createDeck(name){
  const decks=loadDecks();
  const deck={id:Date.now().toString(),name,cards:[]};
  decks.push(deck); saveDecks(decks); return deck;
}

function addCardToDeck(deckId, question, answer){
  const decks=loadDecks();
  const deck=decks.find(d=>d.id===deckId); if(!deck) return null;
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

function getDueCards(deck){
  const nowISO = new Date().toISOString();
  return deck.cards.filter(c=>c.nextReview <= nowISO).sort((a,b)=>a.nextReview.localeCompare(b.nextReview));
}

/* SM-2 simplified scheduler */
function scheduleCard(card, evaluation){
  // Implement SM-2 algorithm (days-based intervals)
  // Fields used: card.reps (consecutive correct), card.interval (days), card.easeFactor
  card.easeFactor = Number(card.easeFactor || 2.5);
  card.reps = Number(card.reps || 0);
  card.interval = Number(card.interval || 0);
  const next = new Date();
  // Decide if card is in learning mode (use minute-level scheduling) or review mode (days)
  const inLearning = (card.state === 'LEARNING' || !card.state) || (card.interval === 0);

  if(inLearning){
    // minute-based learning schedule (preserve prior behavior)
    let minutes = 0;
    if(evaluation === 'again'){
      minutes = 1;
      card.reps = 0;
      card.easeFactor = Math.max(1.3, +(card.easeFactor - 0.20).toFixed(2));
      card.state = 'LEARNING';
    } else if(evaluation === 'hard'){
      minutes = 8;
      card.reps = 0;
      card.easeFactor = Math.max(1.3, +(card.easeFactor - 0.15).toFixed(2));
      card.state = 'LEARNING';
    } else if(evaluation === 'good'){
      if(card.reps >= 1){
        // second good -> 1 day
        minutes = 1440;
        card.reps = card.reps + 1;
        card.state = 'REVIEW';
      } else {
        minutes = 15;
        card.reps = card.reps + 1;
        card.state = 'LEARNING';
      }
    } else if(evaluation === 'easy'){
      minutes = 1440 * 4;
      card.reps = 0;
      card.easeFactor = +(card.easeFactor + 0.15).toFixed(2);
      card.state = 'REVIEW';
    }

    // update interval in days (rounded down) but keep precise nextReview in minutes
    card.interval = Math.round(minutes / 1440);
    next.setTime(Date.now() + minutes * 60 * 1000);
  }
  else {
    // Review mode: use SM-2 days-based updates
    if(evaluation === 'again'){
    card.reps = 0;
    card.interval = 0;
    card.easeFactor = Math.max(1.3, +(card.easeFactor - 0.20).toFixed(2));
    card.state = 'LEARNING';
  } else if(evaluation === 'hard'){
    card.easeFactor = Math.max(1.3, +(card.easeFactor - 0.15).toFixed(2));
    card.interval = Math.max(1, Math.round(card.interval * 1.2));
    card.state = 'REVIEW';
  } else if(evaluation === 'good'){
    card.reps = card.reps + 1;
    if(card.reps === 1){
      card.interval = 1;
    } else if(card.reps === 2){
      card.interval = 6;
    } else {
      card.interval = Math.max(1, Math.round(card.interval * card.easeFactor));
    }
    card.state = 'REVIEW';
  } else if(evaluation === 'easy'){
    card.reps = card.reps + 1;
    card.easeFactor = +(card.easeFactor + 0.15).toFixed(2);
    card.interval = Math.max(1, Math.round(card.interval * card.easeFactor * 1.3));
    card.state = 'REVIEW';
  }
  next.setHours(0,0,0,0); next.setDate(next.getDate() + Number(card.interval || 0));
}
  card.lastEvaluation = evaluation;
  card.nextReview = next.toISOString();
}

/* UI */
let currentDeckId = null;
let studyQueue = [];
let currentIndex = 0;

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
  const diffMinutes = Math.round(diffMs / (1000*60));
  if(diffMinutes <= 0) return 'now';
  if(diffMinutes < 60) return `in ${diffMinutes} min`;
  if(diffMinutes < 1440){ const hrs = Math.round(diffMinutes/60); return `in ${hrs} h`; }
  const days = Math.round(diffMinutes/1440);
  if(days===1) return 'tomorrow';
  return `${days} days`;
}

function projectedSchedule(card, evaluation){
  // Decide learning (minute) projections vs days
  const reps = Number(card.reps||0);
  const ease = Number(card.easeFactor||2.5);
  const current = Number(card.interval||0);
  const inLearning = (reps === 0) || (card.state === 'LEARNING') || (current === 0);
  if(inLearning){
    // minute-based projection
    let minutes = 0;
    if(evaluation === 'again') minutes = 1;
    else if(evaluation === 'hard') minutes = (reps>=1 || card.lastEvaluation==='good') ? 15 : 8;
    else if(evaluation === 'good') minutes = (reps>=1) ? 1440 : 15;
    else if(evaluation === 'easy') minutes = 1440*4;
    const human = minutes < 60 ? `${minutes} min` : (minutes % 1440 === 0 ? `${minutes/1440} day${minutes/1440===1?'':'s'}` : `${Math.round(minutes/60)} h`);
    return {minutes, human, days: Math.round(minutes/1440)};
  }
  // days-based projection
  let days = 0;
  if(evaluation === 'again') days = 1;
  else if(evaluation === 'hard') days = Math.max(1, Math.round((current || 1) * 1.2));
  else if(evaluation === 'good'){
    if(reps === 0) days = 1;
    else if(reps === 1) days = 6;
    else days = Math.max(1, Math.round((current || 1) * ease));
  } else if(evaluation === 'easy'){
    const newEase = +(ease + 0.15).toFixed(2);
    const base = Math.max(1, current || 1);
    days = Math.max(1, Math.round(base * newEase * 1.3));
  }
  const human = days === 0 ? 'today' : (days === 1 ? 'in 1 day' : `in ${days} days`);
  return {minutes: days*1440, human, days};
}

function escapeHtml(s){ return (s||'').toString().replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])) }

/* Events */
document.addEventListener('DOMContentLoaded', ()=>{
  renderDecks();
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
  $('close-detail').addEventListener('click', ()=>{ $('deck-detail').classList.add('hidden'); $('decks-view').classList.remove('hidden'); renderDecks(); });
  $('detail-add-card').addEventListener('click', ()=>{ openAddCardForm(currentDeckId); });
  // save deck metadata
  const saveDeckBtn = $('save-deck'); if(saveDeckBtn){ saveDeckBtn.addEventListener('click', ()=>{
    const nameInput = $('detail-deck-name-input'); if(!nameInput) return; const newName = nameInput.value.trim(); if(!newName){ showToast('Deck name required'); return; }
    const decks = loadDecks(); const deck = decks.find(d=>d.id===currentDeckId); if(!deck) return; deck.name = newName; saveDecks(decks); renderDeckDetail(currentDeckId); renderDecks(); showToast('Deck saved');
    // close detail view after saving (save implies close)
    const dd = $('deck-detail'); if(dd){ dd.classList.add('hidden'); }
    $('decks-view').classList.remove('hidden');
  }); }

  // study view
  $('back-to-decks').addEventListener('click', ()=>{ $('study-view').classList.add('hidden'); $('decks-view').classList.remove('hidden'); renderDecks(); });
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

function openAddCardForm(deckId){ currentDeckId = deckId; $('add-card-form').classList.remove('hidden'); }

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
    const deckExists = decks.some(d=>d.id===deckId);
    renderDeckDetail(deckId);
    if(!deckExists){ const ids = decks.map(d=>d.id).slice(0,10).join(','); showError(`Deck not found: ${deckId}. Loaded decks: ${ids}`); }
       $('deck-detail').classList.remove('hidden');
       $('decks-view').classList.remove('hidden');
  }catch(e){ showError('openDeckDetail failed: '+e.message); }
}

function renderDeckDetail(deckId){
  const decks = loadDecks(); const deck = decks.find(d=>d.id===deckId);
  const list = $('deck-cards-list');
  if(!deck){ if(list) list.innerHTML = '<div class="card">Deck not found.</div>'; return; }
  // populate editable name input and show deck-only details
  const nameInput = $('detail-deck-name-input'); if(nameInput){ nameInput.value = deck.name; nameInput.setAttribute('disabled','true'); }
  // wire up the existing pencil button (now in HTML) to enable editing
  const pencil = $('detail-edit-name'); if(pencil && nameInput){ pencil.addEventListener('click', ()=>{ nameInput.removeAttribute('disabled'); nameInput.focus(); }); }
  const meta = $('detail-deck-meta'); if(meta) meta.textContent = `${deck.cards.length} cards`;
  // hide close button (save will close)
  const closeBtn = $('close-detail'); if(closeBtn){ closeBtn.classList.add('hidden'); }
  list.innerHTML='';
  if(deck.cards.length===0){ list.innerHTML='<div class="card">No cards in this deck.</div>'; return; }
  deck.cards.forEach(card=>{
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
  const decks = loadDecks(); const deck = decks.find(d=>d.id===currentDeckId); if(!deck) return;
  const card = deck.cards.find(c=>c.id===cardId); if(!card) return;
  $('new-card-question').value = card.question; $('new-card-answer').value = card.answer; $('save-card').dataset.editId = cardId; $('add-card-title').textContent='EDIT CARD'; $('add-card-form').classList.remove('hidden');
  const saveBtn = $('save-card'); if(saveBtn) saveBtn.textContent = 'Save';
}

function updateCard(deckId, cardId, question, answer){
  const decks = loadDecks(); const deck = decks.find(d=>d.id===deckId); if(!deck) return;
  const idx = deck.cards.findIndex(c=>c.id===cardId); if(idx<0) return;
  deck.cards[idx].question = question; deck.cards[idx].answer = answer; saveDecks(decks);
}

function deleteCard(deckId, cardId){
  const decks = loadDecks(); const deck = decks.find(d=>d.id===deckId); if(!deck) return;
  deck.cards = deck.cards.filter(c=>c.id!==cardId); saveDecks(decks);
}

function startStudy(deckId){
  const decks = loadDecks(); const deck = decks.find(d=>d.id===deckId); if(!deck) return;
  const due = getDueCards(deck);
  if(due.length===0){ showToast('No cards due today in this deck.'); return; }
  currentDeckId = deckId; studyQueue = due; currentIndex = 0;
  $('study-deck-title').textContent = deck.name + ` — ${due.length} due`;
  $('decks-view').classList.add('hidden'); $('study-view').classList.remove('hidden'); showCurrentCard();
}

function showCurrentCard(){
  const card = studyQueue[currentIndex]; if(!card) return finishStudy();
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
  const decks = loadDecks(); const deck = decks.find(d=>d.id===currentDeckId); if(deck){
    const idx = deck.cards.findIndex(c=>c.id===card.id); if(idx>=0) deck.cards[idx]=card; saveDecks(decks);
  }
  // next
  currentIndex++; if(currentIndex>=studyQueue.length) return finishStudy(); showCurrentCard();
}

function finishStudy(){
  $('study-view').classList.add('hidden'); $('decks-view').classList.remove('hidden'); renderDecks();
}

// JSON backup: download every deck as a file, or append decks from a previously exported one.
import { $, showToast } from './dom.js';
import { loadDecks } from './storage.js';
import { importDecks } from './decks.js';
import { renderDecks } from './decks-view.js';

function exportDecks(){
  const decks = loadDecks();
  const blob = new Blob([JSON.stringify(decks, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flashcards-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function importFromFile(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    let parsed;
    try{ parsed = JSON.parse(reader.result); }
    catch(e){ showToast('Import failed: invalid JSON file'); return; }

    const result = importDecks(parsed);
    if(result.error === 'format'){ showToast('Import failed: unrecognized file format'); return; }
    if(result.error === 'empty'){ showToast('Import failed: no valid decks found'); return; }
    renderDecks();
    showToast(`Imported ${result.added} deck${result.added === 1 ? '' : 's'}`);
  };
  reader.onerror = ()=> showToast('Import failed: could not read file');
  reader.readAsText(file);
}

export function initBackup(){
  $('export-btn').addEventListener('click', ()=>{
    if(loadDecks().length === 0){ showToast('No decks to export'); return; }
    exportDecks();
  });
  const importInput = $('import-file-input');
  $('import-btn').addEventListener('click', ()=> importInput.click());
  importInput.addEventListener('change', ()=>{
    const file = importInput.files && importInput.files[0];
    if(file) importFromFile(file);
    importInput.value = '';
  });
}

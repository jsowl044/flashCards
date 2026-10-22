// Entry point: wires the modules together once the DOM is ready.
import { $, showError, showToast } from './dom.js';
import { loadDecks } from './storage.js';
import { initTheme, initKeyboardAwareBar } from './platform.js';
import { initDecksView, refreshDecksIfIdle } from './decks-view.js';
import { initDeckDetail, openDeckDetail, refreshDeckDetailIfOpen } from './deck-detail.js';
import { initStudy, startStudy } from './study.js';
import { initBackup } from './backup.js';
import { initSync, isSignedIn, signIn, signOut } from './sync.js';

window.addEventListener('error', (e)=>{ showError(`${e.message} at ${e.filename || e.fileName}:${e.lineno || e.lineNumber}`); });
window.addEventListener('unhandledrejection', (e)=>{ showError('Unhandled Rejection: ' + String(e.reason)); });

// The sync button only appears once cloud sync turns out to be available (a Firebase
// project is configured and its SDK loaded); until then the app is purely local.
async function setupSyncButton(){
  const button = $('sync-btn');
  const available = await initSync({
    onRemoteChange: ()=>{ refreshDecksIfIdle(); refreshDeckDetailIfOpen(); },
    onAuthChange: (user)=>{
      button.classList.toggle('synced', Boolean(user));
      button.title = user ? `Synced as ${user.email} — tap to sign out` : 'Sign in with Google to sync across devices';
    }
  });
  if(!available) return;

  button.classList.remove('hidden');
  button.addEventListener('click', ()=>{
    if(isSignedIn()){ signOut(); return; }
    const hasLocalCards = loadDecks().some(d=>d.cards && d.cards.length);
    if(hasLocalCards && !confirm('Signing in syncs this device with your cloud data. If you already synced from another device, this device\'s local cards may get replaced by the cloud copy. Continue?')) return;
    signIn().catch((e)=>{
      if(e && e.code === 'auth/popup-closed-by-user') return;
      showToast('Sign-in failed: ' + (e && e.message ? e.message : e));
      console.warn('Sign-in error:', e);
    });
  });
}

function boot(){
  initTheme();
  initKeyboardAwareBar();
  initDecksView({ onStudy: startStudy, onManage: openDeckDetail });
  initDeckDetail();
  initStudy();
  initBackup();
  setupSyncButton();
}

// Module scripts run before DOMContentLoaded, but check anyway in case this is ever loaded late.
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

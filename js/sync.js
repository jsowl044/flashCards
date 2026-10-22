// Optional cloud sync. Everything else in the app works without this module doing
// anything: if Firebase isn't configured, or can't load (e.g. offline), initSync()
// resolves to false and the app stays purely local.
//
// One Firestore document per signed-in user holds the whole decks array. Local saves are
// pushed through the storage layer's onSave hook; remote changes are applied with a
// "silent" save so they never bounce straight back to the cloud.
import { loadDecks, saveDecks, onSave } from './storage.js';

let cloud = null;
let user = null;
let unsubscribeSnapshot = null;
let detachSaveHook = null;
let notifyRemoteChange = ()=>{};

export function isSignedIn(){ return Boolean(user); }

function pushDecksToCloud(decks){
  if(!user || !cloud) return;
  cloud.setDoc(cloud.userDocRef(user.uid), { decks, updatedAt: Date.now() })
    .catch(e=>console.warn('Cloud sync failed:', e));
}

function startListening(signedInUser){
  user = signedInUser;
  if(unsubscribeSnapshot) unsubscribeSnapshot();
  unsubscribeSnapshot = cloud.onSnapshot(cloud.userDocRef(signedInUser.uid), (snap)=>{
    if(!snap.exists()){
      // First device ever to sign into this account: seed the cloud with what's local.
      pushDecksToCloud(loadDecks());
      return;
    }
    if(snap.metadata.hasPendingWrites) return; // local echo of our own write, already applied
    const remoteDecks = snap.data().decks;
    if(!Array.isArray(remoteDecks)) return;
    saveDecks(remoteDecks, { silent: true });
    notifyRemoteChange();
  }, (e)=>console.warn('Cloud listener error:', e));
}

function stopListening(){
  if(unsubscribeSnapshot){ unsubscribeSnapshot(); unsubscribeSnapshot = null; }
  user = null;
}

// `cloudApi` exists so tests can provide a fake; in the app it's loaded lazily from
// firebase-init.js. That import is dynamic on purpose: the Firebase SDK comes from a CDN, and a
// static import would stop the whole app from starting whenever the CDN is unreachable.
// Resolves to true when sync is available.
export async function initSync({ onRemoteChange=()=>{}, onAuthChange=()=>{}, cloudApi }={}){
  stopListening();
  if(detachSaveHook){ detachSaveHook(); detachSaveHook = null; }
  notifyRemoteChange = onRemoteChange;

  try{
    cloud = cloudApi !== undefined ? cloudApi : (await import('../firebase-init.js')).cloud;
  }catch(e){
    console.warn('Cloud sync unavailable:', e);
    cloud = null;
  }
  if(!cloud) return false;

  detachSaveHook = onSave(pushDecksToCloud);
  cloud.getRedirectResult().catch(e=>console.warn('Sign-in redirect error:', e));
  cloud.onAuthStateChanged((authUser)=>{
    if(authUser) startListening(authUser); else stopListening();
    onAuthChange(authUser);
  });
  return true;
}

export function signIn(){ return cloud.signIn(); }
export function signOut(){ return cloud.signOut(); }

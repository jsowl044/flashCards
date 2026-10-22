// Optional cloud sync for the Flashcards PWA — fill in your own Firebase project
// config below to enable it. Without a real config, `cloud` is null and the app runs
// exactly as before: fully local, no sign-in button, no network calls.
//
// Where to get these values: https://console.firebase.google.com
//   Project settings -> General -> Your apps -> Web app (</> icon) -> SDK setup
// These values are meant to be public/client-visible — Firebase access control
// comes from the Firestore security rules (see firestore.rules), not from hiding this config.
//
// This module is only ever loaded through a dynamic import() from js/sync.js, so a CDN
// failure here can't prevent the rest of the app from starting.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDpwMDyhhQcJeJRl7FIj3I15FORcMipJGk",
  authDomain: "carddeck-ee1fb.firebaseapp.com",
  projectId: "carddeck-ee1fb",
  storageBucket: "carddeck-ee1fb.firebasestorage.app",
  messagingSenderId: "277552338375",
  appId: "1:277552338375:web:8dd994bb53e2c29fe3f5e2"
};

const isConfigured = Boolean(firebaseConfig.apiKey) && !firebaseConfig.apiKey.startsWith('YOUR_');

function createCloud(){
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();

  return {
    // Prefer signInWithPopup: the whole exchange happens within one page load, so it
    // doesn't depend on storage surviving a full navigation away and back — which is
    // exactly what iOS Safari's tracking prevention tends to break for
    // signInWithRedirect. Fall back to redirect only if the popup itself can't open.
    signIn: ()=>signInWithPopup(auth, provider).catch(e=>{
      // Only fall back when the popup mechanism itself isn't usable — not when the
      // user just closed it (that should stay a no-op they can retry).
      if(e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')){
        return signInWithRedirect(auth, provider);
      }
      throw e;
    }),
    getRedirectResult: ()=>getRedirectResult(auth),
    onAuthStateChanged: (callback)=>onAuthStateChanged(auth, callback),
    signOut: ()=>signOut(auth),
    userDocRef: (uid)=>doc(db, 'users', uid),
    setDoc: (ref, data)=>setDoc(ref, data),
    onSnapshot: (ref, onNext, onError)=>onSnapshot(ref, onNext, onError)
  };
}

export const cloud = isConfigured ? createCloud() : null;

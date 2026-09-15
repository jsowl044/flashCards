// Optional cloud sync for the Flashcards PWA — fill in your own Firebase project
// config below to enable it. Without a real config, the app runs exactly as
// before: fully local, no sign-in button, no network calls.
//
// Where to get these values: https://console.firebase.google.com
//   Project settings -> General -> Your apps -> Web app (</> icon) -> SDK setup
// These values are meant to be public/client-visible — Firebase access control
// comes from the Firestore security rules, not from hiding this config.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult,
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
window.firebaseCloudConfigured = isConfigured;

if(isConfigured){
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();

  window.firebaseAuth = auth;
  window.firebaseSignInWithRedirect = () => signInWithRedirect(auth, provider);
  window.firebaseGetRedirectResult = () => getRedirectResult(auth);
  window.firebaseOnAuthStateChanged = (cb) => onAuthStateChanged(auth, cb);
  window.firebaseSignOut = () => signOut(auth);
  window.firebaseUserDocRef = (uid) => doc(db, 'users', uid);
  window.firebaseSetDoc = (ref, data) => setDoc(ref, data);
  window.firebaseOnSnapshot = (ref, onNext, onError) => onSnapshot(ref, onNext, onError);
}

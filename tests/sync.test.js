import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initSync, isSignedIn, signIn, signOut } from '../js/sync.js';
import { loadDecks, saveDecks } from '../js/storage.js';
import { installFakeStorage } from './helpers.js';

const USER = { uid: 'u1', email: 'me@example.com' };
const localDecks = ()=>[{ id: 'local', name: 'Local deck', cards: [] }];
const remoteDecks = ()=>[{ id: 'remote', name: 'From another device', cards: [] }];

// A Firestore document snapshot, as the app sees it.
const snapshot = (data, { pending=false }={})=>({
  exists: ()=>data !== undefined,
  data: ()=>data,
  metadata: { hasPendingWrites: pending }
});

// An in-memory stand-in for the object exported by firebase-init.js.
function fakeCloud(){
  const handlers = { auth: null, snapshot: null };
  const writes = [];
  const calls = { signIn: 0, signOut: 0 };
  const cloud = {
    getRedirectResult: ()=>Promise.resolve(null),
    onAuthStateChanged: (callback)=>{ handlers.auth = callback; },
    userDocRef: (uid)=>({ path: `users/${uid}` }),
    setDoc: (ref, data)=>{ writes.push({ path: ref.path, data }); return Promise.resolve(); },
    onSnapshot: (ref, onNext)=>{ handlers.snapshot = onNext; return ()=>{ handlers.snapshot = null; }; },
    signIn: async ()=>{ calls.signIn++; },
    signOut: async ()=>{ calls.signOut++; handlers.auth(null); }
  };
  return { cloud, handlers, writes, calls };
}

// Starts sync against a fake cloud and signs the user in.
async function signedIn(options={}){
  const fake = fakeCloud();
  const events = { remoteChanges: 0, authChanges: [] };
  await initSync({
    cloudApi: fake.cloud,
    onRemoteChange: ()=>{ events.remoteChanges++; },
    onAuthChange: (user)=>{ events.authChanges.push(user); },
    ...options
  });
  fake.handlers.auth(USER);
  return { ...fake, events };
}

beforeEach(()=>{ installFakeStorage(); });
// sync.js keeps module-level state; detach whatever a test left connected.
afterEach(async ()=>{ await initSync({ cloudApi: null }); });

describe('availability', ()=>{
  test('is unavailable when no cloud is configured', async ()=>{
    assert.equal(await initSync({ cloudApi: null }), false);
  });

  test('is unavailable (not an error) when the Firebase module cannot load', async (t)=>{
    // In Node the CDN imports inside firebase-init.js fail, like they would offline.
    const warn = t.mock.method(console, 'warn', ()=>{});
    assert.equal(await initSync(), false);
    assert.equal(warn.mock.callCount(), 1);
  });

  test('is available with a working cloud', async ()=>{
    assert.equal(await initSync({ cloudApi: fakeCloud().cloud }), true);
  });
});

describe('signing in', ()=>{
  test('reports auth changes and the signed-in state', async ()=>{
    const { handlers, events } = await signedIn();
    assert.equal(isSignedIn(), true);
    handlers.auth(null);
    assert.equal(isSignedIn(), false);
    assert.deepEqual(events.authChanges, [USER, null]);
  });

  test('seeds an empty cloud account with the local decks', async ()=>{
    saveDecks(localDecks());
    const { handlers, writes } = await signedIn();
    handlers.snapshot(snapshot(undefined));
    assert.equal(writes.length, 1);
    assert.equal(writes[0].path, 'users/u1');
    assert.deepEqual(writes[0].data.decks, localDecks());
    assert.equal(typeof writes[0].data.updatedAt, 'number');
  });

  test('delegates signIn / signOut to the cloud', async ()=>{
    const { calls } = await signedIn();
    await signIn();
    await signOut();
    assert.deepEqual(calls, { signIn: 1, signOut: 1 });
  });
});

describe('pushing local changes', ()=>{
  test('does not push while signed out', async ()=>{
    const fake = fakeCloud();
    await initSync({ cloudApi: fake.cloud });
    saveDecks(localDecks());
    assert.equal(fake.writes.length, 0);
  });

  test('pushes every save while signed in', async ()=>{
    const { writes } = await signedIn();
    saveDecks(localDecks());
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].data.decks, localDecks());
  });

  test('stops pushing after signing out', async ()=>{
    const { handlers, writes } = await signedIn();
    handlers.auth(null);
    saveDecks(localDecks());
    assert.equal(writes.length, 0);
  });

  test('a failed write is logged, not thrown', async (t)=>{
    const warn = t.mock.method(console, 'warn', ()=>{});
    const { cloud } = await signedIn();
    cloud.setDoc = ()=>Promise.reject(new Error('offline'));
    assert.doesNotThrow(()=>saveDecks(localDecks()));
    await new Promise((resolve)=>setImmediate(resolve));
    assert.equal(warn.mock.callCount(), 1);
  });
});

describe('applying remote changes', ()=>{
  test('replaces local data and notifies the UI', async ()=>{
    saveDecks(localDecks());
    const { handlers, events } = await signedIn();
    handlers.snapshot(snapshot({ decks: remoteDecks() }));
    assert.deepEqual(loadDecks(), remoteDecks());
    assert.equal(events.remoteChanges, 1);
  });

  test('does not push the remote data straight back (no ping-pong)', async ()=>{
    const { handlers, writes } = await signedIn();
    handlers.snapshot(snapshot({ decks: remoteDecks() }));
    assert.equal(writes.length, 0);
  });

  test('ignores the local echo of our own pending write', async ()=>{
    saveDecks(localDecks());
    const { handlers, events } = await signedIn();
    handlers.snapshot(snapshot({ decks: remoteDecks() }, { pending: true }));
    assert.deepEqual(loadDecks(), localDecks());
    assert.equal(events.remoteChanges, 0);
  });

  test('ignores a cloud document that has no decks array', async ()=>{
    saveDecks(localDecks());
    const { handlers, events } = await signedIn();
    handlers.snapshot(snapshot({ updatedAt: 1 }));
    assert.deepEqual(loadDecks(), localDecks());
    assert.equal(events.remoteChanges, 0);
  });
});

describe('re-initialising', ()=>{
  test('detaches the previous cloud so saves are pushed only once', async ()=>{
    const first = await signedIn();
    const second = await signedIn();
    saveDecks(localDecks());
    assert.equal(first.writes.length, 0);
    assert.equal(second.writes.length, 1);
  });
});

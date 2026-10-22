# Flashcards — an offline-first spaced-repetition PWA

[![Tests](https://github.com/jsowl044/flashCards/actions/workflows/test.yml/badge.svg)](https://github.com/jsowl044/flashCards/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A small Anki-style flashcards app that installs on your phone, works with no connection, and can optionally sync your decks across devices. Built with **vanilla JavaScript, no framework and no build step**.

**[Live demo →](https://flash-cards-theta-steel.vercel.app/)** (works without an account: tap *Load sample deck* on the empty screen)

<table>
  <tr>
    <td><img src="docs/screenshots/decks.png" alt="Deck list" width="200"></td>
    <td><img src="docs/screenshots/study.png" alt="Study view with Again / Hard / Good / Easy buttons" width="200"></td>
    <td><img src="docs/screenshots/manage.png" alt="Deck management with docked search bar" width="200"></td>
    <td><img src="docs/screenshots/decks-light.png" alt="Light theme" width="200"></td>
  </tr>
  <tr>
    <td align="center">Decks</td>
    <td align="center">Study</td>
    <td align="center">Manage</td>
    <td align="center">Light theme</td>
  </tr>
</table>

## Why I built it

I wanted my own vocabulary on my iPhone, PC and iPad without depending on a store app. It doubled as a way to practice the parts of the web platform that usually get skipped in tutorials: service workers, installable PWAs, iOS Safari quirks, and syncing local-first data without writing a backend.

## Features

- **Spaced repetition** with four ratings (*Again / Hard / Good / Easy*). Each button previews when the card will come back.
- **Learning steps in minutes**, then day-scale review intervals with a per-card ease factor (details below).
- **Live study queue:** cards whose cooldown expires *during* a session are pulled into it automatically, like Anki's relearning steps.
- **Offline-first PWA:** installable, fully usable with no network.
- **Optional cloud sync** across devices with Google sign-in (Firebase). If you never sign in, nothing leaves your device.
- **JSON export / import** as a backup that doesn't depend on any cloud.
- Create, rename, search, edit and delete decks and cards; dark and light themes that follow the OS.
- Type-your-answer mode: type a guess before revealing the answer.

## How scheduling works

A card is either in **learning** or in **review**.

| State | Again | Hard | Good | Easy |
|---|---|---|---|---|
| Learning | 1 min | 8 min | 15 min, then 1 day (graduates) | 4 days (graduates) |
| Review | 1 min (relearn) | interval × 1.2 | 6 days on the 2nd success, then interval × ease | ~1.3 × the *Good* interval |

The ease factor starts at 2.5, drops on *Again*/*Hard*, rises on *Easy*, and never goes below 1.3. When a session starts, due cards are ordered from the longest interval to the shortest, so short learning steps land at the end and have time to come due again within the same session.

## Technical notes

The decisions that were most interesting to work through:

- **Plain ES modules, no build step.** The code is split by responsibility (below) and loaded with `<script type="module">`. The scheduler and the sync logic are free of DOM access, which is what makes them unit-testable.
- **Local-first data flow.** `localStorage` is always the source of truth the UI reads from, so rendering is synchronous and the app is instant offline. Every mutation goes through one function (`saveDecks`), and anything that cares about saves (cloud sync) subscribes to it with `onSave()`. Sync was added without touching any call site.
- **Sync as an optional layer.** One Firestore document per user holds the decks array; a snapshot listener applies remote changes with a *silent* save so they never bounce back to the cloud. With no Firebase config the sign-in button never appears and no network calls are made.
- **The Firebase SDK is loaded with a dynamic `import()`.** It comes from a CDN, and a static import would stop the whole app from starting whenever that CDN is unreachable (offline, blocked). Loading it lazily inside a `try/catch` means the app simply runs without sync.
- **iOS Safari and Firebase Auth.** `signInWithRedirect` silently failed on iPhone: tracking prevention blocks the storage the redirect round-trip depends on. Switching to `signInWithPopup` (with a redirect fallback) fixed it.
- **Service worker strategy.** Same-origin requests are network-first with the cache as the offline fallback, so a deploy shows up on the next load with no manual cache-busting. Cross-origin requests are never intercepted: an earlier version cached Firebase traffic, which would have broken auth and made real-time sync serve stale data.
- **Live study queue.** A session's queue is a snapshot, so cards whose cooldown expires mid-session are merged in by a pure function (`mergeNewlyDue`) that never touches the card currently on screen.
- **Keyboard-aware docked search bar.** iOS Safari doesn't reflow `position: fixed` elements when the on-screen keyboard opens, so the bar listens to `window.visualViewport` and translates itself above the keyboard.
- **Data migration.** Stored data is normalised on load (missing fields, legacy shapes), with an automatic backup copy restored if the main entry is corrupted.

## Tests

```bash
npm test
```

It uses Node's built-in test runner, so there is nothing to install. The suite (90 tests, run on Node 20 and 22 in CI) covers:

- **Scheduler:** every rating in both card states, the ease-factor floor, Easy always landing after Good, due ordering, the "due in…" labels, and the mid-session queue merge.
- **Storage:** migration of legacy data, recovery from the backup copy, and save listeners.
- **Sync:** against an in-memory fake of Firebase: seeding an empty account, applying remote changes without pushing them back, ignoring the echo of the app's own writes, and the app starting normally when Firebase can't load.
- **Decks and import:** id uniqueness, import validation, and that import never overwrites existing data.

As a sanity check on the tests themselves, I injected eleven deliberate bugs (a wrong multiplier, a dropped ease floor, reversed ordering, a missing backup write, and so on) into a throwaway copy, and the suite caught every one.

## Project structure

```
index.html            app shell and markup
style.css             theming (CSS variables) and layout
sw.js                 service worker
manifest.json         PWA manifest
firebase-init.js      optional Firebase config; exports `cloud`, or null when unconfigured
firestore.rules       security rules for the sync document
js/
  app.js              entry point: wires the modules together
  scheduler.js        spaced-repetition rules and due-card logic (pure)
  storage.js          localStorage persistence, migration, save hooks
  decks.js            create / rename / delete decks and cards, import, sample deck
  sync.js             optional Firestore sync (no DOM access)
  decks-view.js       deck list screen
  deck-detail.js      manage-deck screen
  study.js            study session
  backup.js           JSON export / import UI
  platform.js         theme and keyboard-aware search bar
  dom.js              small DOM helpers
tests/                unit tests (node:test)
icons/                SVG + PNG icons (iOS touch icon, maskable)
docs/screenshots/     images used in this README
```

## Run locally

No install or build is needed; any static file server works.

```bash
python -m http.server 8000
# or
npx serve .
```

Open `http://localhost:8000`. Service workers need `localhost` or HTTPS. To try it on a phone, serve it over HTTPS (for example through a tunnel, or by deploying to a static host such as Vercel or GitHub Pages) and use *Share → Add to Home Screen* on iOS.

## Enable cloud sync (optional)

`firebase-init.js` ships with the author's project config. To use your own project:

1. Create a project at the [Firebase console](https://console.firebase.google.com/).
2. **Authentication → Sign-in method:** enable **Google**.
3. **Firestore Database:** create a database (Standard edition, production mode).
4. Publish the rules in [`firestore.rules`](firestore.rules) (Firestore → Rules tab, or `firebase deploy --only firestore:rules`).
5. **Project settings → Your apps → Web app:** copy the config object into `firebase-init.js`.
6. **Authentication → Settings → Authorized domains:** add the domain where you host the app.
7. Recommended: in Google Cloud Console, restrict the browser API key to your domains.

Firebase web config values identify the project, they are not secrets; access is enforced by the security rules.

## Data model

```json
[
  {
    "id": "mgz4k2f1a8xq",
    "name": "Spanish → English",
    "cards": [
      {
        "id": "mgz4k2f1c9ptm",
        "question": "hola",
        "answer": "hello",
        "state": "NEW",
        "reps": 0,
        "interval": 0,
        "easeFactor": 2.5,
        "lastEvaluation": "",
        "nextReview": "2026-09-15T13:18:30.909Z"
      }
    ]
  }
]
```

The same array is what the JSON export produces and what is stored in Firestore.

## Known limitations and roadmap

I'd rather be upfront about what this is: a personal project, not a polished product.

- **Sync is last-write-wins** on the whole decks array. Editing offline on two devices and then syncing can overwrite one set of changes. Merging per card (by id and timestamp) is the natural next step.
- **The UI layer has no automated tests in the repo.** The logic modules are unit-tested; I verified the screens with a throwaway browser script, and turning that into a committed end-to-end test is a good next step.
- **No linter or formatter yet.**
- The viewport disables pinch-zoom on purpose, to feel like a native iOS app; that is a trade-off against accessibility.

## License

[MIT](LICENSE) © Julian Agudelo

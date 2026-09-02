# Flashcards PWA — Quick test & deployment

Quick steps to serve and test the app on an iPhone (covers HTTP and HTTPS options):

1) Simple local server (fast; SW may not register when using IP over HTTP):

   - Open a terminal in the project folder (`c:\Users\agude\Desktop\cards`).

```bash
# Python 3
python -m http.server 8000

# or on Windows with py
py -3 -m http.server 8000
```

   - Find your PC local IP (Windows):

```powershell
ipconfig
```

   - On your iPhone (same Wi‑Fi) open Safari and visit `http://<PC_IP>:8000/`.

   Note: Service Workers require a secure context (HTTPS) to register when accessing from a different device. You can still test the UI over HTTP.

2) Full PWA test (Service Worker + cache) — use an HTTPS tunnel (recommended):

   - Use `localtunnel` (no account) or `ngrok` (may require an account):

```bash
# with npx (no global install)
npx localtunnel --port 8000

# localtunnel returns a public HTTPS URL, e.g. https://abcd.loca.lt
```

   - Open the HTTPS URL in Safari on the iPhone, Add to Home Screen (Share → Add to Home Screen). The Service Worker will be able to register and the app will work offline after opening it at least once while online.

3) Network / Firewall notes (Windows):

   - If Windows shows a Firewall prompt when starting the server, allow access on Private networks.
   - If the iPhone can't reach the app, ensure both devices are on the same network and no VPN or AP isolation is active.

4) iPhone test recommendations:

   - Use Safari → Develop → [device] → [page] to inspect console errors while testing.
   - Open the app from the Home Screen icon to see `standalone` mode.
   - Turn off network and open the app from the Home Screen to verify offline behavior (resources cached by `sw.js`).

5) Alternative commands (Node):

```bash
# http-server (use npx)
npx http-server -p 8000

# serve
npx serve -s . -p 8000
```

If you want, I can:

- Add a `start` script to `package.json` for convenience.
- Add import/export for decks (JSON sharing).
- Add instructions for local HTTPS with `mkcert`.

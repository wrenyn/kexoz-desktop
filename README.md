# Kexoz Desktop

**Share your local apps, terminals and files securely.**

Kexoz Desktop is the graphical client for [Kexoz](https://kexoz.dev). Pick something on your
machine — a dev server, a database, a shell or a folder — and get a link you can send to anyone,
with access control, expiry and live traffic built in. Built and maintained by
[Wrenyn](https://github.com/wrenyn).

## What you can share

| Share | What visitors get |
| --- | --- |
| **Web apps** | A stable `https://<name>.kexoz.dev` URL for any local port, with path routing (`/api` → `:7000`) |
| **Private (E2E) links** | TLS terminates on your machine; the gateway only relays encrypted bytes |
| **TCP / UDP** | A public port for Postgres, SSH, game servers, DNS and other raw protocols |
| **Terminals** | A browser terminal for pairing or support — always behind Google sign-in, optionally view-only |
| **Folders** | A file browser for a local folder: read-only or read & write, zip download, uploads, secret files excluded by default |

## Control who gets in

- **Private or public** — private shares require Google sign-in or a password; public warnings are explicit.
- **Permissions** — read-only shares accept only safe requests; read-only terminals are view-only.
- **Pause, resume and expiry** — stop traffic instantly, set an expiry or make a link one-time.
- **Custom domains** — use your own domain instead of a `kexoz.dev` subdomain (Pro).

## Built-in tools

- **Request inspector** — every request with method, path, status, latency and headers; replay with one click.
- **Dashboard** — bandwidth, requests and uptime per share, QR codes for mobile testing.
- **Local port detection** — running dev servers are detected and offered as one-click shares.
- **Tray and auto-start** — keep shares running in the background.

## Tech stack

- **Shell:** Electron (Electron Forge), plain JavaScript in `electron/`
- **Agent:** WebSocket + [yamux](https://github.com/hashicorp/yamux) multiplexing, a jailed loopback file server for folder shares
- **UI:** React + Vite + TypeScript in `frontend/`, plain CSS with the Kexoz design tokens

## Development

```bash
npm --prefix frontend install
npm --prefix electron install

npm run dev          # Vite dev server + Electron
npm run make         # build installers for the current platform
```

Checks:

```bash
npm --prefix frontend run lint && npm --prefix frontend run build
npm --prefix electron run lint && npm --prefix electron test
npm --prefix electron run e2e    # end-to-end share checks against a local server
```

Point the app at a self-hosted gateway with `VITE_KEXOZ_API_BASE` and `VITE_KEXOZ_ROOT_DOMAIN`
(see `frontend/.env.example`). See [ARCHITECTURE.md](./ARCHITECTURE.md),
[CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © [Wrenyn](https://github.com/wrenyn)

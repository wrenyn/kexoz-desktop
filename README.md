# Kexoz Desktop

**Share your local apps, terminals and files securely.**

Kexoz Desktop is the graphical client for [Kexoz](https://kexoz.dev). Pick something on your
machine — a dev server, a database, a shell or a folder — and get a link you can send to anyone,
with access control, expiry and live traffic built in. Built and maintained by
[Wrenyn](https://wrenyn.com).

## What you can share

| Share | What visitors get |
| --- | --- |
| **Web apps** | A stable `https://<name>.kexoz.dev` URL for any local port, with path routing (`/api` → `:7000`) |
| **Private (E2E) links** | TLS terminates on your machine; the gateway only relays encrypted bytes |
| **TCP / UDP** | A public port for Postgres, SSH, game servers, DNS and other raw protocols |
| **Terminals** | A browser terminal for pairing or support — always behind a password, optionally view-only |
| **Folders** | A file browser for a local folder: read-only or read & write, zip download, uploads, secret files excluded by default |

## Control who gets in

- **Private or public** — private shares ask visitors for the password you set; public warnings are explicit.
- **Guest links** — let someone into a private share without the password, for a set time or number of visits, with a QR code; revoke any time.
- **Permissions** — read-only shares accept only safe requests; read-only terminals are view-only.
- **Pause, resume and expiry** — stop traffic instantly, set an expiry or make a link one-time.
- **Custom domains** — use your own domain instead of a `kexoz.dev` subdomain (Pro).

## Built-in tools

- **Request inspector** — every request with method, path, status, latency, headers and bodies; search bodies, edit a request (webhooks included) and resend it to your app, export HAR or JSON.
- **Interactive preview** — turn it on for a web share and visitors can pin notes anywhere on the page; read, resolve and delete them on the Feedback page.
- **Projects** — group the shares one app needs and start them together, or run `kexoz start <name>` from the CLI.
- **Connection dashboard** — status, 24-hour uptime, reconnects and the reason for each drop, plus one-click diagnostics (internet, DNS, Kexoz servers, local ports).
- **Local port detection** — every app listening on this computer, Docker containers included, is offered when you share a port.
- **Folder download limits** — a folder share can stop serving downloads after a set number.
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

Point the app at a different gateway (for example a local one) with `VITE_KEXOZ_API_BASE` and `VITE_KEXOZ_ROOT_DOMAIN`
(see `frontend/.env.example`). See [ARCHITECTURE.md](./ARCHITECTURE.md),
[CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md).

## License

Proprietary. © [Wrenyn](https://wrenyn.com), all rights reserved; see [LICENSE](./LICENSE)

# Kexoz Desktop

**The easiest way to share a local app, get feedback, fix it, and share the updated version.**

Kexoz Desktop is the graphical client for [Kexoz](https://kexoz.dev). Create a project for the app
you're building, add the ports it runs on, and get a link you can send to anyone, with access
control, expiry and live traffic built in. Built and maintained by [Wrenyn](https://wrenyn.com).

## How it works

1. **Create a project** for your app.
2. **Add shares** to it. Either give the frontend and backend their own links, or put the whole
   app on one link and route paths: `/api` → `localhost:8080`, everything else → `localhost:3000`.
3. **Start the project** with one click (or `kexoz start <name>` from the CLI) and send the link.

| Share | What visitors get |
| --- | --- |
| **Web apps** | A stable `https://<name>.kexoz.dev` URL for any local port, with path routing to other local ports |
| **Private (E2E) links** | TLS terminates on your machine; the gateway only relays encrypted bytes |
| **TCP / UDP** | A public port for Postgres, SSH, game servers, DNS and other raw protocols |

## Control who gets in

- **Private or public** — private shares ask visitors for the password you set; public warnings are explicit.
- **Permissions** — read-only shares accept only safe requests.
- **Pause, resume and expiry** — stop traffic instantly, set an expiry or make a link one-time.
- **Custom domains** — use your own domain instead of a `kexoz.dev` subdomain (Pro).

## Built-in tools

- **Request inspector** — every request with method, path, status, latency, headers and bodies; search bodies, edit a request (webhooks included) and resend it to your app, export HAR or JSON.
- **Visual review** — turn it on for a web share and visitors can pin notes anywhere on the page; read, resolve and delete them from the share's panel.
- **Connection dashboard** — status, 24-hour uptime, reconnects and the reason for each drop, plus one-click diagnostics (internet, DNS, Kexoz servers, and every local port a running share or route uses).
- **Local port detection** — every app listening on this computer, Docker containers included, is offered when you share a port.
- **Tray** — keep shares running in the background.

## Tech stack

- **Shell:** Electron (Electron Forge), plain JavaScript in `electron/`
- **Agent:** WebSocket + [yamux](https://github.com/hashicorp/yamux) multiplexing; the gateway prefixes each stream with the local port picked by the share's path routes
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

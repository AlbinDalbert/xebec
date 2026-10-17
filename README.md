# Xebec

A slim web chat client for [meridian](../meridian). Meridian owns the whole chat lifecycle
(threads, runs, streaming, resume), so xebec is just a view onto its native API: list threads,
send a message, follow the run's event stream.

Svelte 5 + TypeScript + Vite, built to static files. The only runtime dependencies are `marked`
and `DOMPurify` for rendering model output. The look comes from mosaic's design mocks (Ember
palette, mono chrome, serif prose).

## Development

Run meridian on `localhost:4000`, then:

```sh
npm install
npm run dev      # http://localhost:5173
```

The dev server proxies `/api` to meridian, so no CORS setup is needed. `example.env` lists the
variables; copy it to `.env.local` to change them (or set them in the shell). Log in with an API key minted in meridian's admin console (kept in `localStorage`), or
sign in if meridian has sign-in set up (see below).

`npm run check` type-checks; `npm run build` writes `dist/`.

## Deploying

The image is `ghcr.io/albindalbert/xebec`, multi-arch (amd64 + arm64), built by
`.github/workflows/image.yml`. Tags: `main`, `sha-<commit>`, and `X.Y.Z` / `X.Y` for `vX.Y.Z` git
tags.

It is unprivileged nginx (uid 101) on port **8080**, serving the app and proxying `/api` to
meridian, so the browser sees one origin and meridian needs no CORS setup. One setting:

| Variable       | Default            | |
|----------------|--------------------|-|
| `MERIDIAN_URL` | `http://meridian`  | Meridian's address from inside the cluster, e.g. `http://meridian.meridian.svc`. No trailing slash or path. It must resolve when the container starts. |

`/healthz` answers 200 for probes. Run event streams (SSE) are passed through unbuffered.

```sh
docker run -p 8080:8080 -e MERIDIAN_URL=http://host.docker.internal:4000 ghcr.io/albindalbert/xebec:main
```

Without the image: `dist/` is static. Serve it behind a reverse proxy that routes `/api` to
meridian (see `nginx.conf.template`), or build with `VITE_MERIDIAN_URL=https://meridian.example`
and add xebec's origin to meridian's `CORS_ALLOWED_ORIGINS`.

## Signing in

Meridian runs sign-in; xebec only links to it. With `USER_OIDC_CLIENT_ID` set in meridian (see
meridian's README, "Signing in"), the login screen shows **Sign in**, which goes to
`/api/auth/login`. Meridian sends the browser to its provider (e.g. WorkOS AuthKit), takes the
callback at `/api/auth/callback`, and comes back to xebec with a session cookie. Xebec has no
provider settings of its own.

This needs xebec and meridian on one origin, which the dev proxy and the image's nginx provide.
Register `http://localhost:5173/api/auth/callback` (dev) and `https://<xebec host>/api/auth/callback`
as redirect URIs at the provider. Both proxies pass on `X-Forwarded-Host` and `X-Forwarded-Proto`
so meridian builds the callback URL for xebec's address, not its own. With a cross-origin build
(`VITE_MERIDIAN_URL`) only API keys work.

## Layout

- `src/lib/api.ts`: the meridian API client and types.
- `src/App.svelte`: shell, thread list, login gate. The open thread is the URL hash.
- `src/lib/Chat.svelte`: messages, composer, run streaming, status line.
- `src/lib/MessageView.svelte`: one message; markdown for assistant replies.

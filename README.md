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
variables; copy it to `.env.local` to change them (or set them in the shell). Log in with an API key minted in meridian's admin console. The key is kept in
`localStorage`.

`npm run check` type-checks; `npm run build` writes `dist/`.

## Deploying

`dist/` is static. Either serve it from the same origin as meridian (a reverse proxy routing
`/api` to meridian), or build with `VITE_MERIDIAN_URL=https://meridian.example` and add xebec's
origin to meridian's `CORS_ALLOWED_ORIGINS`.

## Layout

- `src/lib/api.ts`: the meridian API client and types.
- `src/App.svelte`: shell, thread list, login gate. The open thread is the URL hash.
- `src/lib/Chat.svelte`: messages, composer, run streaming, status line.
- `src/lib/MessageView.svelte`: one message; markdown for assistant replies.

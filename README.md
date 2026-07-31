# Vision Pharma Plus: Frontend

Next.js 15 (App Router) UI for a wholesale pharmacy (*pharmacie de gros*) in
Burundi. TypeScript, Tailwind, Radix primitives, Zustand for client state.
Bilingual: French by default, English switchable.

The Django API lives in a separate repository. This app talks to it over
REST/JSON with JWT auth.

- [Architecture](docs/architecture.md)
- [User guide](docs/user-guide.md)

---

## Requirements

- Node.js 20 (matches the Docker image)
- A running backend API (see the backend repository's README)

---

## Quick start

```bash
npm install

cp .env.local.example .env.local   # then edit if your API is elsewhere

npm run dev
```

The app is then at <http://localhost:3000>.

Start the backend first, or every request will fail. With the backend running on
its default port, the shipped `.env.local.example` needs no changes.

### Signing in

If the backend was seeded with `python manage.py seed_demo`:

```
admin@pharmagros.bi / Demo!2026#Pharma
```

---

## Environment

One variable, read at build time by Next:

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` | Must be reachable **from the browser**, not from inside a container |

The fallback is baked into [src/lib/api/client.ts](src/lib/api/client.ts#L21), so
the app runs without `.env.local` when the backend is on localhost. `NEXT_PUBLIC_`
variables are inlined into the client bundle, so never put a secret in one.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload on :3000 |
| `npm run build` | Production build (`standalone` output) |
| `npm start` | Serve a build; run `build` first |
| `npm run lint` | ESLint (`eslint-config-next`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run i18n:scan` | Report UI text that won't follow the locale switch |
| `npm run i18n:fix` | Same, plus scaffold missing dictionary keys |

`i18n:scan` exits non-zero when it finds anything, so it works as a CI gate. It
catches hardcoded JSX strings, keys missing from `en`, untranslated values
identical to the French, and leftover `TODO` markers. See
[scripts/README.md](scripts/README.md).

---

## Production build

```bash
npm run build
npm start
```

`next.config.mjs` sets `output: "standalone"`, so the build traces only the
modules reachable at runtime. The server entrypoint is `.next/standalone/server.js`
and that is what the Docker image runs, not `npm start`.

---

## Docker

```bash
docker build -t pharmagros-frontend .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1 pharmagros-frontend
```

The full stack (PostgreSQL, Redis, backend, Celery, nginx, this app) is composed
from the **backend** repository's `docker-compose.yml`. It consumes this app as a
pre-built image and expects two variables pointing here:

- `FRONTEND_IMAGE`: a tag published from this repo
- `NGINX_CONF_DIR`: path to this repo's [docker/nginx](docker/nginx/) directory,
  which owns the edge routing and TLS certificates

---

## Layout

```
src/
  app/
    login/            unauthenticated route
    (app)/            authenticated shell; everything below requires a session
      dashboard/  catalog/  inventory/  sales/  invoicing/
      purchasing/ partners/ reports/    admin/  notifications/  profile/
  components/
    ui/               Radix-based primitives
    app-shell.tsx     nav, layout chrome
    data-table.tsx    shared table with sorting and pagination
  lib/
    api/              typed fetch client, JWT refresh
    i18n/             fr / en dictionaries
    stores/           Zustand stores
    format.ts         money, dates, quantities
    money via decimal.js, never floats
docs/                 architecture and user guide
```

Money is handled with `decimal.js` throughout. The backend computes at 4 decimal
places and rounds once at the document boundary; the UI must display what the API
returns rather than recomputing totals.

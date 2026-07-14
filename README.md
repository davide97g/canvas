# Canvas — self-hostable tldraw whiteboard

A single-user, self-hostable [tldraw](https://tldraw.dev) whiteboard with real-time
multiplayer sync, built on the official tldraw sync Node server template. Personal
project for Davide Ghiotto — intended domain: `canvas.davideghiotto.it`, deployed on a
Hetzner VPS via Dokploy behind Traefik.

## What it is

- **tldraw sync** multiplayer whiteboard. One `TLSocketRoom` per room, held in memory on
  the server; documents are persisted to SQLite via `@tldraw/sync-core`'s
  `SQLiteSyncStorage`.
- **Fastify** backend that also serves the built React/Vite SPA in production.
- **Better Auth** email+password authentication, **single admin user**, signups disabled.
  Everything except the SPA shell, the login page, and the auth API is behind auth —
  including the multiplayer WebSocket upgrade.
- **Cloudflare R2** (S3-compatible) for uploaded assets, proxied through the authenticated
  server. Falls back to local disk automatically when R2 env vars are absent (dev).
- Rate limiting, upload size caps, room-slug validation, and `trustProxy` for running
  behind Traefik.

### Architecture

```
Browser ──► Traefik (TLS) ──► Node/Fastify (single replica, :3000)
                                 ├─ /                SPA (static, public)
                                 ├─ /api/auth/*      Better Auth (public)
                                 ├─ /api/rooms       room list/create (auth)
                                 ├─ /connect/:room   sync WebSocket (auth)
                                 ├─ /uploads/:id     asset PUT/GET (auth) ─► R2 or disk
                                 └─ /unfurl          bookmark unfurl (auth)
                              persistent state in $DATA_DIR:
                                 rooms/<slug>.db  (one SQLite DB per room)
                                 auth.db          (Better Auth)
                                 app.db           (room metadata)
                                 assets/          (only when R2 is not configured)
```

> **Single replica only.** There is one in-memory `TLSocketRoom` per room globally, so the
> service must never be scaled beyond one instance.

## Local development

```bash
npm install
cp .env.example .env      # optional in dev; sensible defaults are built in
npm run dev
```

- Client (Vite): http://localhost:5757  ← open this
- Server (Fastify): http://localhost:3000 (the Vite dev server proxies
  `/api`, `/connect`, `/uploads`, `/unfurl` to it, keeping everything same-origin so the
  session cookie works).

In dev you don't need any env vars: a static dev secret is used, `DATA_DIR` defaults to
`./data`, assets go to local disk, and the admin user defaults to
`admin@example.com` / `changeme-please-01`. Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` to seed
your own. The admin user is created once on first startup and skipped thereafter.

Other scripts:

```bash
npm run typecheck     # tsc --noEmit
npm run build-client  # build the SPA to dist/client
npm start             # run the production server (serves dist/client)
```

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | no | `3000` | Port the Node server listens on / Docker exposes. |
| `NODE_ENV` | prod | — | `production` enables secure cookies and requires `BETTER_AUTH_SECRET`. |
| `DATA_DIR` | no | `./data` (`/data` in Docker) | Root for all persistent data (room DBs, auth DB, app DB, local assets). |
| `BETTER_AUTH_SECRET` | **prod** | dev fallback | Signing secret. Generate: `openssl rand -base64 32`. Required in production. |
| `BETTER_AUTH_URL` | prod | `http://localhost:5757` | Public origin of the app (cookies / CSRF), e.g. `https://canvas.davideghiotto.it`. |
| `TRUSTED_ORIGINS` | no | — | Extra trusted origins, comma-separated. |
| `ADMIN_EMAIL` | yes | `admin@example.com` | Email of the single seeded admin user. |
| `ADMIN_PASSWORD` | yes | `changeme-please-01` | Password of the seeded admin user. |
| `R2_ENDPOINT` | no | — | `https://<account-id>.r2.cloudflarestorage.com`. |
| `R2_ACCESS_KEY_ID` | no | — | R2 access key. |
| `R2_SECRET_ACCESS_KEY` | no | — | R2 secret key. |
| `R2_BUCKET` | no | — | R2 bucket name. |
| `VITE_TLDRAW_LICENSE_KEY` | no | — | tldraw license key. **Build-time** (client) var — must be present when the client is built. |

If **all four** `R2_*` vars are set, assets use R2; otherwise they fall back to local disk
under `$DATA_DIR/assets` (fine for dev, not recommended for production).

## tldraw hobby license

- tldraw is free to self-host under the hobby license, but the **"made with tldraw"
  watermark must stay visible**. This app does not touch or hide it.
- Apply for a license at **https://tldraw.dev** for the domain
  `canvas.davideghiotto.it`. You'll receive a license key.
- Put the key in `VITE_TLDRAW_LICENSE_KEY`. It is a **build-time** variable: pass it as a
  Docker `--build-arg` / compose build arg so it is baked into the client bundle. It is a
  public client-side key, not a secret.
- **Development needs no key** — leave it undefined. The watermark shows regardless of
  whether a key is present.

## Cloudflare R2 bucket setup

1. Cloudflare dashboard → **R2** → create a bucket, e.g. `canvas-assets`.
2. **R2 → Manage API Tokens** → create an API token with Object Read & Write on that
   bucket. Note the Access Key ID and Secret Access Key.
3. Your endpoint is `https://<account-id>.r2.cloudflarestorage.com` (account ID is shown on
   the R2 overview page).
4. Set `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

Assets are never public: uploads are streamed to R2 through the authenticated server, and
downloads are streamed back from R2 through the server, so everything stays behind auth.
The client uses `region: "auto"` and `forcePathStyle: true` for R2.

## Docker

```bash
# Build (optionally bake the tldraw license key into the client bundle)
docker build --build-arg VITE_TLDRAW_LICENSE_KEY=... -t canvas .

# Run
docker run -d -p 3000:3000 -v canvas-data:/data \
  -e BETTER_AUTH_SECRET=... \
  -e BETTER_AUTH_URL=https://canvas.davideghiotto.it \
  -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD=... \
  -e R2_ENDPOINT=... -e R2_ACCESS_KEY_ID=... -e R2_SECRET_ACCESS_KEY=... -e R2_BUCKET=... \
  canvas
```

Or with compose (`.env` next to `compose.yaml`, based on `.env.example`):

```bash
docker compose up -d --build
```

The image is multi-stage (build client + prod deps + slim runtime), runs as the non-root
`node` user, exposes `3000`, and mounts a volume at `/data` (`DATA_DIR=/data`). The server
serves the built SPA statics directly. `better-sqlite3` is rebuilt in the prod-deps stage.

## Dokploy deployment

1. **Create app** in Dokploy as a **git-based application** pointing at this repo.
2. **Build type: Dockerfile** (Dokploy builds from the `Dockerfile` in the repo root).
3. **Environment variables** — set at minimum:
   - `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`)
   - `BETTER_AUTH_URL=https://canvas.davideghiotto.it`
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`
   - `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
   - Build arg / build-time env `VITE_TLDRAW_LICENSE_KEY` (once you have a key)
   - `PORT=3000` (default)
4. **Replicas MUST stay at 1.** One `TLSocketRoom` per room lives in memory in a single
   process; multiple replicas would split-brain the document state.
5. **Volume**: attach a persistent volume to **`/data`** so rooms, auth, and metadata
   survive redeploys.
6. **Domain**: add `canvas.davideghiotto.it`, enable **Let's Encrypt** (Traefik handles
   TLS). Traefik proxies to container port **3000**. WebSockets pass through by default —
   no extra Traefik config needed for `/connect`.
7. Deploy. The admin user is seeded on first boot.

### DNS

Create an **A record** for `canvas` (i.e. `canvas.davideghiotto.it`) pointing to your
Hetzner VPS public IPv4 address (and optionally an **AAAA** record for IPv6). Wait for
propagation, then trigger the deploy so Let's Encrypt can issue the certificate via the
HTTP-01 challenge.

## Backups

All state is under the `/data` volume:

- `rooms/*.db` — whiteboard documents (one SQLite DB per room)
- `auth.db` — users / sessions
- `app.db` — room metadata

Options:

- **Dokploy volume backups** — configure scheduled backups of the `/data` volume in
  Dokploy.
- **Cron snapshot to R2** — a nightly job that copies the SQLite files to R2, e.g.:

  ```bash
  # run on the host; adjust the volume path Dokploy exposes
  tar czf /tmp/canvas-$(date +%F).tgz -C /var/lib/docker/volumes/<vol>/_data .
  aws s3 cp /tmp/canvas-*.tgz s3://canvas-backups/ \
    --endpoint-url "$R2_ENDPOINT"
  ```

  SQLite runs in WAL mode; for a guaranteed-consistent snapshot prefer
  `sqlite3 rooms/<slug>.db ".backup '/tmp/<slug>.db'"` per DB, or back up while the room is
  idle. For a personal single-user instance, a file-level `tar` of `/data` is normally
  sufficient.

## License

The application code derives from tldraw's `simple-server-example` (MIT). The tldraw SDK is
provided under the [tldraw license](https://github.com/tldraw/tldraw/blob/main/LICENSE.md);
the "made with tldraw" watermark must remain visible under the hobby license.

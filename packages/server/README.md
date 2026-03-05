# Sequoia Server

Self-hostable AT Protocol OAuth and subscription server. Handles Bluesky login and manages `site.standard.graph.subscription` records on behalf of users. Built with Bun, Hono, and Redis.

## Quickstart

### Docker (recommended)

```bash
cp .env.example .env
# Edit .env — at minimum set CLIENT_URL to your public URL
docker compose up
```

### Local development

Requires [Bun](https://bun.sh) and a running Redis instance.

```bash
bun install
CLIENT_URL=http://localhost:3000 bun run dev
```

## How it works

1. A user visits `/subscribe?publicationUri=at://...` and enters their Bluesky handle
2. The server initiates an AT Protocol OAuth flow — the user authorizes on Bluesky
3. After callback, the server creates a `site.standard.graph.subscription` record in the user's repo
4. The [sequoia-subscribe](https://github.com/standard-schema/sequoia) web component can point to this server for the full flow

### Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/health` | GET | Health check |
| `/oauth/client-metadata.json` | GET | OAuth client metadata |
| `/oauth/login?handle=` | GET | Start OAuth flow |
| `/oauth/callback` | GET | OAuth callback |
| `/oauth/logout` | POST | Revoke session |
| `/oauth/status` | GET | Check auth status |
| `/subscribe` | GET | Subscribe page (HTML) |
| `/subscribe` | POST | Subscribe via API (JSON) |
| `/subscribe/check` | GET | Check subscription status |
| `/subscribe/login` | POST | Handle form submission |

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLIENT_URL` | Yes | — | Public URL of this server (used for OAuth redirects) |
| `CLIENT_NAME` | No | `Sequoia` | Name shown on Bluesky OAuth consent screen |
| `PORT` | No | `3000` | Server port |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection URL |

### Theming

The subscribe pages use CSS custom properties that can be overridden via environment variables:

| Variable | Default |
|----------|---------|
| `THEME_ACCENT_COLOR` | `#3A5A40` |
| `THEME_BG_COLOR` | `#F5F3EF` |
| `THEME_FG_COLOR` | `#2C2C2C` |
| `THEME_BORDER_COLOR` | `#D5D1C8` |
| `THEME_ERROR_COLOR` | `#8B3A3A` |
| `THEME_BORDER_RADIUS` | `6px` |
| `THEME_FONT_FAMILY` | `system-ui, sans-serif` |
| `THEME_DARK_BG_COLOR` | `#1A1A1A` |
| `THEME_DARK_FG_COLOR` | `#E5E5E5` |
| `THEME_DARK_BORDER_COLOR` | `#3A3A3A` |
| `THEME_DARK_ERROR_COLOR` | `#E57373` |

For full control, set `THEME_CSS_PATH` to a CSS file path (e.g. `/app/theme.css` mounted via Docker volume). It will be injected after the default styles.

## Deployment

The included `Dockerfile` produces a minimal image:

```bash
docker build -t sequoia-server .
docker run -p 3000:3000 \
  -e CLIENT_URL=https://your-domain.com \
  -e REDIS_URL=redis://your-redis:6379 \
  sequoia-server
```

Or use `docker-compose.yml` which bundles Redis:

```bash
docker compose up -d
```

Place behind a reverse proxy (Caddy, nginx, Traefik) for TLS.

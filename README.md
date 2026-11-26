# Förderstrecke

Plan and practise water relay over long distances for fire brigade training. The water source,
pumps and hose line are laid out on an OpenStreetMap map; the tool calculates friction and height
losses, pump spacing and hose demand, and shows where the line does not hold. A learning part
poses relay calculations to solve by hand and checks the answers.

The results are training values, not an operational tool. How the line is calculated, and where
every value comes from, is in [docs/hydraulics.md](docs/hydraulics.md).

The interface is German throughout; it is meant for German fire services.

## Running it

The image is `ghcr.io/ember-tools/foerderstrecke`. `compose.yml` builds and starts it locally on
port 8082; `compose.dev.yml` runs the backend with reload and Vite on port 5177.

```sh
./toolchain.sh verify      # backend tests, frontend tests, type check and build
./toolchain.sh be-serve    # build the frontend and serve everything on port 8000
```

### Behind Traefik

`compose.prod.yml` is a template for running the image behind an existing Traefik (v3.1 or later)
with TLS. Set the variables in an `.env` file beside it or in the environment:

| Variable | Default | Meaning |
|---|---|---|
| `FOERDERSTRECKE_HOST` | required | Public host name, e.g. `foerderstrecke.example.org`; also sets `CORS_ORIGINS` |
| `PROXY_NETWORK` | `proxy` | External Docker network Traefik is attached to |
| `TRAEFIK_ENTRYPOINT` | `websecure` | Traefik entrypoint for HTTPS |
| `TRAEFIK_CERT_RESOLVER` | `letsencrypt` | Traefik certificate resolver |

The template turns off Traefik's access log for this router, since shared links carry their token
in the path. Anything specific to one server, such as automatic updates or wildcard certificates,
belongs in that server's own copy, not in the template.

### Volume

Everything the server keeps lives under `/data`:

| Path | Content |
|---|---|
| `/data/tiles` | OpenStreetMap tiles fetched on demand, with `index.sqlite` recording when each was last read. Tiles unread for `TILE_RETENTION_DAYS` are deleted, and beyond `TILE_MAX_BYTES` the ones read longest ago |

### Environment

| Variable | Default | Meaning |
|---|---|---|
| `DATA_DIR` | `/data` in the image | Where tiles are kept |
| `CORS_ORIGINS` | `*` | Comma separated allowed origins; `https://foerderstrecke.emberbox.app` in production |
| `TILE_RETENTION_DAYS` | `30` | Days after its last read until a map tile is deleted |
| `TILE_MAX_BYTES` | `2147483648` | Upper limit of the tile cache in bytes |
| `TILE_SWEEP_SECONDS` | `3600` | How often unread tiles are evicted |
| `LOG_FORMAT` | `json` in the image | `json` writes ECS JSON lines to stdout |
| `LOG_LEVEL` | `INFO` | Log level when `LOG_FORMAT=json` |

The container listens on port 8000 and expects a reverse proxy that sets `X-Forwarded-*` headers.
Requests are not logged: the image runs uvicorn without an access log, and the proxy in front
should not log them either.

## License

AGPL-3.0-or-later

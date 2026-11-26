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
port 8082 and needs the elevation data from Git LFS (see below); `compose.dev.yml` runs the
backend with reload and Vite on port 5177, and mounts the elevation data if it is there.

```sh
./toolchain.sh verify      # backend tests, frontend tests, type check, build and lint
./toolchain.sh fe-audit    # every linter of @emberbox/lint, reporting without failing
./toolchain.sh be-serve    # build the frontend and serve everything on port 8000
```

### Elevation data

Heights come from [Sonny's LiDAR Digital Terrain Model of Germany](https://sonny.4lima.de) at one
arc second (about 30 by 20 m), compiled from the terrain models of the federal states. It is a
terrain model: it gives the ground without buildings and trees, which is where a hose line lies.
The server answers height and profile requests from its own copy, so no third party sees where a
line runs. Outside Germany's tiles there are no heights; they can be entered by hand.

The converted data lives in the repository through Git LFS: `elevation/tiles/*.dem`, 70 tiles in
whole metres in a compact grid format (`backend/src/elevation/grid.py`), about 230 MB. Clone with
Git LFS installed, or run `git lfs pull`, before building the image. The image carries the data in
a layer of its own at `/elevation`, built with fixed file times: an update that leaves the data
alone leaves that layer alone, so a server pulling the new image does not download the heights
again. CI caches the LFS objects, so the data is fetched from GitHub only when it changes.

To update the data, download the zips of the 1″ model from the project's site by hand (Google
Drive asks for a sign-in) into `elevation/sonny/`, then:

```sh
python tools/elevation.py pin       # record the checksums of the zips in tools/elevation-sources.txt
./toolchain.sh elevation            # check the zips and write elevation/tiles
```

Credit: Digitales Geländemodell Deutschland 1″ by Sonny (sonny.4lima.de), CC BY 4.0, based on the
terrain models of the surveying authorities of the federal states.

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
| `/data/shares.sqlite` | Shared lines and tasks: the snapshot, its kind and the two tokens that open and delete it. Kept until deleted with the delete token |
| `/data/tiles` | OpenStreetMap tiles fetched on demand, with `index.sqlite` recording when each was last read. Tiles unread for `TILE_RETENTION_DAYS` are deleted, and beyond `TILE_MAX_BYTES` the ones read longest ago |

### Environment

| Variable | Default | Meaning |
|---|---|---|
| `DATA_DIR` | `/data` in the image | Where shares and tiles are kept |
| `ELEVATION_DIR` | `/elevation` in the image | Where the prepared elevation data is read from |
| `CORS_ORIGINS` | `*` | Comma separated allowed origins; `https://foerderstrecke.emberbox.app` in production |
| `SHARE_MAX_BYTES` | `200000` | Largest line or task accepted for sharing, as JSON |
| `SHARE_CREATIONS_PER_HOUR` | `30` | Links one client address may create per hour |
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

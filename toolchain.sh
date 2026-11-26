#!/usr/bin/env bash
#
# Common build and verification commands for this repository.
#
# Every command runs from the repository root's sub-directories regardless of the caller's working
# directory, and inside the project's nix environment via `direnv exec`.
#
# Usage: ./toolchain.sh <command> [args...]
#        ./toolchain.sh help

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$ROOT/frontend"
BACKEND="$ROOT/backend"
PORT_BACKEND="${PORT_BACKEND:-8000}"

run() {
    if [ -f "$ROOT/.envrc" ] && command -v direnv >/dev/null 2>&1; then
        if ! direnv exec "$ROOT" true >/dev/null 2>&1; then
            echo "The nix environment is not allowed yet. Allow it once with:" >&2
            echo "    direnv allow $ROOT" >&2
            exit 2
        fi
        direnv exec "$ROOT" "$@"
    else
        "$@"
    fi
}

usage() {
    cat <<'USAGE'
Usage: ./toolchain.sh <command> [args...]

Frontend
  fe-build              Type-check with vue-tsc, then build
  fe-typecheck          vue-tsc only
  fe-dev                Vite dev server, proxying /api and /tiles to the backend
  fe-install            npm install
  fe-test               Unit tests with vitest
  fe-lint [name] [args] Every linter of @emberbox/lint, as frontend/emberbox-lint.config.mjs sets
                        them up, failing when one does; with a name only that one
  fe-audit              All linters, non-gating; prints everything they find
  fe-deploy             Build and copy the result to backend/static, so the backend serves the
                        whole app from one port as the image does

Backend
  be-test [args]        All tests
  be-test1 <pattern>    One module or test, e.g. `be-test1 test_static`
  be-dev                uvicorn with --reload on port 8000 (PORT_BACKEND overrides)
  be-serve              fe-deploy, then serve everything

Elevation data
  elevation             Write the grid files the server reads into elevation/tiles from the
                        terrain model zips in elevation/sonny (checked against their checksums)

Docker
  docker-build [args]   Build the production image; needs the elevation data from Git LFS
  docker-app            Build and start it detached on port 8082; needs the elevation data
  docker-app-down       Stop it again
  docker-dev            Start the dev stack: backend with --reload, Vite on 5177; uses the
                        elevation data when prepared

Combined
  verify                be-test, fe-test, fe-build and fe-lint, what CI runs
USAGE
}

fe() { cd "$FRONTEND"; }
be() { cd "$BACKEND/src"; }

need_elevation() {
    if head -c 40 "$ROOT/elevation/tiles/N52E013.dem" 2>/dev/null | grep -q "git-lfs"; then
        echo "The image carries the elevation data, which Git LFS has not fetched yet. Run once:" >&2
        echo "    git lfs pull" >&2
        exit 2
    fi
    touch -d @0 "$ROOT"/elevation/tiles/* "$ROOT/elevation/tiles"
}

cmd="${1:-help}"
shift || true

case "$cmd" in
    fe-build)      fe; run npm run build "$@" ;;
    fe-typecheck)  fe; run npx vue-tsc -b "$@" ;;
    fe-dev)        fe; run npm run dev -- "$@" ;;
    fe-install)    fe; run npm install "$@" ;;
    fe-test)       fe; run npm test -- "$@" ;;
    fe-lint)       fe; run npx emberbox-lint "$@" ;;
    fe-audit)      fe; run npx emberbox-lint --audit ;;
    fe-deploy)
        fe; run npm run build
        rm -rf "$BACKEND/static"
        cp -r "$FRONTEND/dist" "$BACKEND/static"
        echo "backend/static updated"
        ;;

    be-test)       be; run python -m unittest discover -s services -t . "$@" ;;
    be-test1)
        [ $# -ge 1 ] || { echo "be-test1 needs a module or test, e.g. test_static" >&2; exit 2; }
        pattern="$1"; shift
        be; run python -m unittest "services.$pattern" -v "$@"
        ;;
    be-dev)        be; run uvicorn main:app --reload --port "$PORT_BACKEND" "$@" ;;
    be-serve)
        "$ROOT/toolchain.sh" fe-deploy
        be; run uvicorn main:app --port "$PORT_BACKEND" "$@"
        ;;

    elevation)
        cd "$ROOT"
        run python tools/elevation.py build
        ;;

    docker-build)     need_elevation; cd "$ROOT"; docker build -t foerderstrecke:dev . "$@" ;;
    docker-app)       need_elevation; cd "$ROOT"; docker compose up -d --build "$@" ;;
    docker-app-down)  cd "$ROOT"; docker compose down "$@" ;;
    docker-dev)       cd "$ROOT"; docker compose -f compose.dev.yml up --build "$@" ;;

    verify)
        "$ROOT/toolchain.sh" be-test
        "$ROOT/toolchain.sh" fe-test
        "$ROOT/toolchain.sh" fe-build
        "$ROOT/toolchain.sh" fe-lint
        ;;

    help|-h|--help) usage ;;
    *) echo "Unknown command: $cmd" >&2; echo >&2; usage >&2; exit 2 ;;
esac

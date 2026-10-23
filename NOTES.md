# Notes

## Decisions

### 2026-10-23 — Slice 1: environment

- **Node.js 22** (v22.21.0 installed via nvm; maintenance LTS until April 2027). Docker image `node:22-slim`.
- **TypeScript 7.0.2.** If Phaser or Colyseus types break with it, ask before falling back to 6.0.3.
- **Docker runs with `sudo`** (the user isn't in the `docker` group; no system change).
- **Exact version pins** (no `^`/`~`): Phaser 4.2.1, @colyseus/core 0.18.23, @colyseus/schema 5.0.42, @colyseus/sdk 0.18.6, @colyseus/testing 0.18.6, Vite 8.3.5, Vitest 5.0.5.
- **Room tests use `@colyseus/testing` with Vitest.** The Colyseus docs say it works with Vitest.
- We use Colyseus 0.18 (current); `docs/design.md` mentions 0.17 "at time of writing".

### 2026-10-23 — Slice 2: project skeleton

- **npm workspaces**, packages `@sink-or-sail/shared`, `@sink-or-sail/server`, `@sink-or-sail/client`.
- **The skeleton starts an empty Colyseus server** (no rooms), so problems with Colyseus types under TypeScript 7 or with Docker show up early.
- **Only the Colyseus parts we need**: `@colyseus/core` 0.18.23, `@colyseus/ws-transport` 0.18.4, `@colyseus/tools` 0.18.10, instead of the all-in-one `colyseus` package. The all-in-one package brings in `@colyseus/auth`, whose dependencies have 15 low/moderate advisories (via `grant` → `elliptic`, `uuid`); the smaller set has 0.
- **One container, one port (2567).** Vite builds the client; the game server serves `client/dist` with **Express 5.3.0** (+ `@types/express` 5.0.6, dev only).
- **The server runs `.ts` directly with Node 22's built-in type stripping** — no build step. `erasableSyntaxOnly` is on, so the compiler blocks syntax Node can't strip (enums, parameter properties, namespaces).
- **`@types/node` 22.20.5** (dev) for Node type definitions.

## Later

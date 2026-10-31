# JOBENPAY-1.0

## Overview
JOBENPAY is a sandbox-only governance layer for AI-driven payout requests. The server and initial web UI are built as separate packages.

## Quick start
1. Use Node.js 22.
2. Copy `.env.example` to `.env` and fill any required values.
3. Install dependencies:
   ```bash
   npm install
   npm --prefix web install
   ```
4. Start the app:
   ```bash
   npm start
   ```
5. In another terminal, start the web development server:
   ```bash
   npm --prefix web run dev
   ```
6. Check health endpoints:
   ```bash
   curl http://localhost:3000/healthz
   curl http://localhost:3000/readyz
   ```

## Architecture
- `app.cjs` is the entrypoint bootstrapping the server.
- `server/src/server.js` starts the API and serves `web/dist` when it is built.
- `server/src/config.js` validates runtime configuration using Zod.
- `web/` contains the Vite + React application and shared design tokens.

## Setup
- Use Node.js 22 via `.nvmrc` or `.replit`.
- Install dependencies with the local Node 22 toolchain.
- Run guard and lint before submitting changes.

## Development
- `npm run guard` checks repo safety constraints.
- `npm run lint` enforces JavaScript style.
- `npm test` runs the server health checks.
- `npm --prefix web run lint:css` checks CSS and rejects literal colors or pixel sizes outside the token file.
- `npm --prefix web run build` builds the production web assets.
- `npm --prefix web run test:geometry` is CI-only; it uses the pinned Playwright Chromium image and currently reports placeholder geometry until F02.

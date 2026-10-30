# JOBENPAY-1.0

## Overview
JOBENPAY is a sandbox-only governance layer for AI-driven payout requests. This repository provides the initial skeleton required by the S00 roadmap step.

## Quick start
1. Use Node.js 22.
2. Copy `.env.example` to `.env` and fill any required values.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the app:
   ```bash
   npm start
   ```
5. Check health endpoints:
   ```bash
   curl http://localhost:3000/healthz
   curl http://localhost:3000/readyz
   ```

## Architecture
- `app.cjs` is the entrypoint bootstrapping the server.
- `server/src/server.js` exposes the HTTP health surface.
- `server/src/config.js` validates runtime configuration using Zod.

## Setup
- Use Node.js 22 via `.nvmrc` or `.replit`.
- Install dependencies with the local Node 22 toolchain.
- Run guard and lint before submitting changes.

## Development
- `npm run guard` checks repo safety constraints.
- `npm run lint` enforces JavaScript style.
- `npm test` runs the server health checks.

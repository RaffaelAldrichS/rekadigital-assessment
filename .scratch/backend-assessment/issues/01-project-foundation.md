# 01 — Project foundation

**What to build:** Scaffold Node.js + TypeScript + Express backend foundation with environment management, raw PostgreSQL connection pool (`pg`), SQL migration runner baseline, Zod validation middleware, centralized error handling middleware, and `/health` endpoint with tests.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Node.js, Express, TypeScript, Zod, Vitest, and `pg` driver set up with `tsconfig.json` and package scripts (`dev`, `build`, `test`, `migrate`).
- [x] Environment variable validation using Zod (`NODE_ENV`, `PORT`, `DATABASE_URL`).
- [x] PostgreSQL connection pool module in `src/db/pool.ts` with error logging and connection test.
- [x] Simple SQL migration runner in `src/db/migrations` that executes unapplied `.sql` migration files in sequence.
- [x] Request validation middleware wrapping Zod schemas for `params`, `query`, and `body`.
- [x] Centralized Error handling middleware in `src/middleware/error-handler.ts` mapping validation errors (400), not found (404), domain conflicts (409), and unexpected errors (500) into standard response envelope `{ error: { code, message, details } }`.
- [x] `GET /health` endpoint returning server status and DB connection health.
- [x] Integration test for `/health` endpoint and error handling middleware passing.

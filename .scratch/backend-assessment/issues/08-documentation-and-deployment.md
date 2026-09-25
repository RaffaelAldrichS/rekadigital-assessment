# 08 — Documentation and deployment

**What to build:** Complete OpenAPI 3.x specification, dbdiagram.io ERD file/link, comprehensive `README.md` containing all required setup/architecture/decisions sections, verified `.env.example`, public platform deployment setup, and live endpoint smoke tests.

**Blocked by:** 07 — Seed script and query verification

**Status:** ready-for-agent

- [ ] Complete OpenAPI 3.x specification file in `docs/openapi.json` or `docs/openapi.yaml` documenting all API endpoints, parameters, request/response models, and error responses.
- [ ] dbdiagram.io schema file or link (`docs/schema.dbml` / `docs/erd.png`) reflecting the exact implemented database tables, keys, and relationships.
- [ ] Verified `.env.example` containing required configuration variables without real secrets.
- [ ] Comprehensive `README.md` covering: project overview, architecture, stack, prerequisites, env vars, local setup, migration, seed, run, test, API docs, ERD, indexing strategy, category strategy, dynamic filter strategy, pagination strategy, search strategy, live URL, trade-offs, and future improvements.
- [ ] Deployment configuration (e.g. Render/Railway/Fly.io) verified with database connection and applied migrations.
- [ ] Live API smoke test verifying `/health` and core read/search endpoints against deployed instance.

# 07 — Seed script and query verification

**What to build:** Deterministic database seed command (`npm run seed`) populating at least 500 listings across multiple makes, models, categories, cities, years, price points, and dynamic attribute combinations, along with query plan analysis (`EXPLAIN ANALYZE`) verifying indexing performance.

**Blocked by:** 06 — Full-text search, suggestions, and facets

**Status:** ready-for-agent

- [ ] Deterministic seed script `src/db/seeds/index.ts` creating >= 500 listings in proper dependency order (makes -> models -> categories -> closure -> filter attributes -> filter options -> category-filter mappings -> listings -> images -> attribute values).
- [ ] Seed script configurable and repeatable via `npm run seed`.
- [ ] Integration tests verifying seed execution against clean migration database.
- [ ] Verification script running `EXPLAIN (ANALYZE, BUFFERS)` on representative queries (cursor pagination, category subtree listing, full-text search with combined filters, dynamic attribute filter) ensuring index hits.
- [ ] Fix any performance or query plan issues identified during seed verification.

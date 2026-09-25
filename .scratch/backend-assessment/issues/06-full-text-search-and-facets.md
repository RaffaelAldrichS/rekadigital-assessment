# 06 — Full-text search, suggestions, and facets

**What to build:** Search module (`GET /api/v1/listings/search`, `GET /api/v1/listings/search/suggest`, `GET /api/v1/filters`) integrating PostgreSQL full-text search over `search_vector`, combined standard/dynamic filters, context-aware faceted counts, bounded autocomplete suggestions, and cursor pagination.

**Blocked by:** 05 — Dynamic category-specific filters

**Status:** resolved

- [x] Search repository, service, controller, and Zod schemas implemented under `src/modules/search/`.
- [x] `GET /api/v1/listings/search` combining full-text search queries (`websearch_to_tsquery`) with standard filters (category subtree, make, model, price range, year range, fuel, transmission) and dynamic filters, ordered deterministically with cursor pagination.
- [x] `GET /api/v1/listings/search/suggest` returning fast, bounded autocomplete suggestions for make, model, and city names.
- [x] `GET /api/v1/filters` returning available filter definitions along with context-aware facet counts for the active search/filter scope.
- [x] Integration tests verifying full-text matching, combined query filtering, suggestion limits, facet count consistency, and cursor pagination under search conditions.

## Answer

Implemented search, bounded make/model/city suggestions, and single-snapshot scalar/dynamic facet counts using existing PostgreSQL search, cursor, category-closure, and dynamic-predicate infrastructure.

Facet counts use the complete current filter context, including the facet's own selection. Metadata options outside the current result retain a zero count, and scalar facets expose only filters accepted by the search endpoint.

Verification passed: migrations, 102 tests including PostgreSQL integration, TypeScript typecheck, and representative `EXPLAIN (ANALYZE, BUFFERS)` probes. The GIN path was observed with `Bitmap Index Scan on idx_listings_search_vector`; no additional index was added because the current assessment-scale suggestion plans did not justify one.

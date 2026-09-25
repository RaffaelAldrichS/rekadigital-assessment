# 06 — Full-text search, suggestions, and facets

**What to build:** Search module (`GET /api/v1/listings/search`, `GET /api/v1/listings/search/suggest`, `GET /api/v1/filters`) integrating PostgreSQL full-text search over `search_vector`, combined standard/dynamic filters, context-aware faceted counts, bounded autocomplete suggestions, and cursor pagination.

**Blocked by:** 05 — Dynamic category-specific filters

**Status:** ready-for-agent

- [ ] Search repository, service, controller, and Zod schemas implemented under `src/modules/search/`.
- [ ] `GET /api/v1/listings/search` combining full-text search queries (`websearch_to_tsquery`) with standard filters (category subtree, make, model, price range, year range, fuel, transmission) and dynamic filters, ordered deterministically with cursor pagination.
- [ ] `GET /api/v1/listings/search/suggest` returning fast, bounded autocomplete suggestions for make, model, and city names.
- [ ] `GET /api/v1/filters` returning available filter definitions along with context-aware facet counts for the active search/filter scope.
- [ ] Integration tests verifying full-text matching, combined query filtering, suggestion limits, facet count consistency, and cursor pagination under search conditions.

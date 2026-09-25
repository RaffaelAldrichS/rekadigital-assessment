# 05 — Dynamic category-specific filters

**What to build:** Metadata-driven dynamic filter module with endpoints (`GET /api/v1/filters/:categoryId`, `GET /api/v1/filters`), supporting category-specific attribute configuration, typed EAV validation (`enum`, `range`, `boolean`), dynamic SQL query predicate generation for listing filters, and basic option counts.

**Blocked by:** 04 — Listing CRUD and pagination

**Status:** resolved

- [x] Filter repository, service, controller, and Zod validation schemas implemented under `src/modules/filters/`.
- [x] `GET /api/v1/filters/:categoryId` returns dynamic filter attribute definitions and enum options associated with the category.
- [x] Typed EAV validator ensuring submitted filter attributes match category configuration and type rules (`enum` value in options, `range` numeric min/max, `boolean` flag).
- [x] Safe, parameterized SQL predicate builder converting dynamic filter parameters into parameterized SQL queries against `listing_attribute_values`.
- [x] Validation rejecting filter attributes not enabled for the selected category.
- [x] Integration tests verifying category filter configuration retrieval, valid dynamic filter queries, and invalid attribute rejection.

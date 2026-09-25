# 03 — Category hierarchy

**What to build:** Category module providing category management endpoints (`POST /api/v1/categories`, `GET /api/v1/categories`, `GET /api/v1/categories/:id`, `PATCH /api/v1/categories/:id`, `GET /api/v1/categories/:id/listings`), supporting arbitrary depth category trees with transactional closure table maintenance, and category subtree listing queries.

**Blocked by:** 02 — Relational schema and migrations

**Status:** ready-for-agent

- [ ] Category repository, service, controller, and Zod schemas implemented under `src/modules/categories/`.
- [ ] `POST /api/v1/categories` creates category and transactionally inserts self-link and parent ancestor links into `category_closure`.
- [ ] `GET /api/v1/categories` returns full category tree structure.
- [ ] `GET /api/v1/categories/:id` returns single category detail with direct children.
- [ ] `PATCH /api/v1/categories/:id` updates category metadata and transactionally updates/rebuilds closure table rows if `parent_id` changes.
- [ ] `GET /api/v1/categories/:id/listings` resolves all descendant category IDs via `category_closure` and returns matching listings.
- [ ] Integration tests covering root category creation, child creation, category tree retrieval, parent updating, and subtree listing querying.

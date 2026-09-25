# 04 — Listing CRUD and pagination

**What to build:** Core listing management endpoints (`POST /api/v1/listings`, `GET /api/v1/listings`, `GET /api/v1/listings/:id`, `PATCH /api/v1/listings/:id`, `DELETE /api/v1/listings/:id`) with transactional creation/update of listing details, images, and attribute values, soft deletion (`status = 'removed'`), and deterministic base64url keyset/cursor pagination (`created_at DESC, id DESC`).

**Blocked by:** 03 — Category hierarchy

**Status:** ready-for-agent

- [ ] Listing repository, service, controller, and Zod schemas implemented under `src/modules/listings/`.
- [ ] `POST /api/v1/listings` creates a listing with model/category validation, images, and dynamic attribute values in a single SQL transaction.
- [ ] `GET /api/v1/listings` browses available listings with deterministic cursor pagination (`WHERE (created_at, id) < ($cursorCreatedAt, $cursorId)`), bounded page limits (default 20, max 50), and standard envelope `{ data, pagination: { nextCursor, hasNextPage } }`.
- [ ] Public browse/get queries strictly exclude soft-deleted `status = 'removed'` listings.
- [ ] `GET /api/v1/listings/:id` retrieves single listing with model, make, category details, images, and dynamic attributes.
- [ ] `PATCH /api/v1/listings/:id` partial update revalidating attributes and updating images transactionally.
- [ ] `DELETE /api/v1/listings/:id` performs soft deletion by updating `status = 'removed'` and returning `204 No Content`.
- [ ] Integration tests verifying create, read, update, soft delete, cursor pagination uniqueness across adjacent pages, and malformed cursor rejection.

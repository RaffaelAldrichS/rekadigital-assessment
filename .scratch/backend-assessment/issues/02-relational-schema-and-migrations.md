# 02 — Relational schema and migrations

**What to build:** Complete SQL DDL migrations defining tables (`makes`, `models`, `categories`, `category_closure`, `listings`, `listing_images`, `filter_attributes`, `category_filter_attributes`, `filter_attribute_options`, `listing_attribute_values`), constraints, check expressions, foreign keys, `search_vector` tsvector column with auto-update trigger, and performance indexes.

**Blocked by:** 01 — Project foundation

**Status:** resolved

- [x] SQL DDL migration files created in `src/db/migrations/` covering all 10 core tables specified in TECHNICAL_SPEC.md.
- [x] Foreign keys, `UUID` primary keys (`gen_random_uuid()`), unique constraints, and check constraints (`year > 1885`, `mileage >= 0`, `price >= 0`, `status IN ('available', 'pending', 'sold', 'removed')`) applied.
- [x] `category_closure` table created with primary key `(ancestor_id, descendant_id)` and depth check.
- [x] `listing_attribute_values` created for typed EAV storage (`value_text`, `value_numeric`, `value_boolean`).
- [x] All primary and secondary indexes created: `categories(parent_id)`, `category_closure(ancestor_id, descendant_id)`, `models(make_id)`, `listings(model_id, category_id, status, year, price)`, `listings(created_at DESC, id DESC)`, `listing_images(listing_id, sort_order)`, EAV value indexes, and GIN index on `listings.search_vector`.
- [x] Postgres trigger or column computation configured to update `listings.search_vector` from title, model, make, city, and description on insert/update.
- [x] Migration runner test verifying clean database migration execution and rollback/idempotency.

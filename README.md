# Automotive Marketplace API

## Project Overview

A production-oriented RESTful API for an automotive marketplace built for browsing, searching, filtering, and managing vehicle listings with multi-level category hierarchies and dynamic category-specific filters.

## Architecture

Modular layered architecture separating HTTP routing, request validation, business logic, and database operations:

```
Controller → Service → Repository → PostgreSQL (raw SQL via pg driver)
```

- **Controller** — HTTP request parsing, response mapping
- **Service** — Business logic, query orchestration, validation rules
- **Repository** — Raw SQL query execution via PostgreSQL connection pool
- **Middleware** — Centralized Zod request validation and error handling

## Technology Stack

| Layer         | Technology                                     |
|---------------|------------------------------------------------|
| Runtime       | Node.js (≥18)                                  |
| Framework     | Express 5                                      |
| Language      | TypeScript 7 (strict mode)                     |
| Database      | PostgreSQL (raw SQL via `pg` driver, no ORM)   |
| Validation    | Zod                                            |
| Testing       | Vitest + Supertest                             |
| Documentation | OpenAPI 3.0 (YAML)                             |
| ERD           | dbdiagram.io / DBML                            |

## Project Structure

```
src/
├── config/               # Environment configuration (Zod-validated)
├── db/
│   ├── migrations/       # Raw SQL migration files + runner
│   ├── migrate.ts        # CLI migration runner
│   ├── pool.ts           # pg Pool singleton
│   ├── seed.ts           # Deterministic seed (550 listings)
│   └── verify.ts         # EXPLAIN ANALYZE query verification
├── middleware/
│   ├── error-handler.ts  # Centralized error → JSON response
│   └── validation.ts     # Zod schema → req parsing middleware
├── modules/
│   ├── categories/       # Category hierarchy module
│   ├── filters/          # Dynamic category filters & facets module
│   ├── listings/         # Vehicle listings CRUD module
│   └── search/           # Full-text search & autocomplete module
├── shared/
│   ├── errors/           # AppError, NotFoundError, ConflictError
│   └── pagination/       # Base64url cursor encode/decode
├── app.ts                # Express application setup
└── server.ts             # HTTP server entrypoint
```

## Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** ≥ 14 (local or hosted)
- **npm** ≥ 9

## Environment Variables

Copy the example file:

```bash
cp .env.example .env
```

Required variables (see `.env.example`):

| Variable      | Description                                  | Example                                              |
|---------------|----------------------------------------------|------------------------------------------------------|
| `NODE_ENV`    | `development`, `production`, or `test`       | `development`                                        |
| `PORT`        | Server listen port                           | `3000`                                               |
| `DATABASE_URL`| PostgreSQL connection string                 | `postgresql://postgres:postgres@localhost:5432/automotive_marketplace` |

Never commit `.env` or real credentials to source control.

## Local Setup

```bash
git clone https://github.com/RaffaelAldrichS/rekadigital-assessment.git
cd rekadigital-assessment
npm install
cp .env.example .env
# Edit .env with your local PostgreSQL credentials
```

## Database Migration

Apply all schema migrations from a clean database:

```bash
npm run migrate
```

Creates the following tables: `makes`, `models`, `categories`, `category_closure`, `listings`, `listing_images`, `filter_attributes`, `category_filter_attributes`, `filter_attribute_options`, `listing_attribute_values`.

## Database Seed

Seed the database with 550 realistic vehicle listings, 3 makes, 12 models, 5 categories, and dynamic filter attributes:

```bash
npm run seed
```

> **Note:** The seed truncates and replaces all data in the target database.

## Run Application

**Development** (hot-reload):

```bash
npm run dev
```

**Production**:

```bash
npm run build
npm start
```

The server starts at `http://localhost:3000` (configurable via `PORT`).

## Run Tests

```bash
npm test
```

Unit and integration tests cover all modules: categories, listings, search, filters, validation middleware, migrations, seed verification, and cursor pagination.

## API Documentation

Full OpenAPI 3.0 specification: [`docs/openapi.yaml`](docs/openapi.yaml)

### Endpoints Summary

| Method | Path                                     | Description                              |
|--------|------------------------------------------|------------------------------------------|
| `GET`  | `/health`                                | Health check with DB connectivity status |
| `GET`  | `/api/v1/categories`                     | Fetch full category tree                 |
| `POST` | `/api/v1/categories`                     | Create category                          |
| `GET`  | `/api/v1/categories/:id`                 | Fetch category with direct children      |
| `PATCH`| `/api/v1/categories/:id`                 | Update category                          |
| `GET`  | `/api/v1/categories/:id/listings`        | Paginated listings in category subtree   |
| `GET`  | `/api/v1/listings`                       | Browse listings (pagination, filters)    |
| `POST` | `/api/v1/listings`                       | Create listing                           |
| `GET`  | `/api/v1/listings/:id`                   | Listing detail (with images/attributes)  |
| `PATCH`| `/api/v1/listings/:id`                   | Partial update listing                   |
| `DELETE`| `/api/v1/listings/:id`                  | Soft-delete listing (status=removed)     |
| `GET`  | `/api/v1/listings/search`                | Full-text search + filters               |
| `GET`  | `/api/v1/listings/search/suggest`        | Autocomplete suggestions                 |
| `GET`  | `/api/v1/filters`                        | Search facets (scalar + dynamic counts)  |
| `GET`  | `/api/v1/filters/:categoryId`            | Dynamic filter definitions for category  |

### Error Response Shape

All errors use a consistent envelope:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

Validation errors include field-level details:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "year", "message": "Year must be greater than 1885" }]
  }
}
```

## ERD / Schema Diagram

Full DBML definition: [`docs/schema.dbml`](docs/schema.dbml)

[View ERD in dbdiagram.io](https://dbdiagram.io/d/automotive-marketplace-erd)

### Tables

| Table                          | Purpose                                         |
|--------------------------------|-------------------------------------------------|
| `makes`                        | Vehicle manufacturer names                       |
| `models`                       | Vehicle models (FK → makes)                      |
| `categories`                   | Hierarchical category tree (adjacency list)      |
| `category_closure`             | Closure table for O(1) subtree lookups           |
| `listings`                     | Vehicle listings with full-text search vector    |
| `listing_images`               | Listing images (sorted by `sort_order`)          |
| `filter_attributes`            | Dynamic filter definitions (enum/range/boolean)  |
| `category_filter_attributes`   | Maps filter attributes to categories             |
| `filter_attribute_options`     | Allowed values for enum-type filters             |
| `listing_attribute_values`     | Typed EAV store for dynamic filter values        |

## Indexing Strategy

All indexes support specific query patterns validated via `EXPLAIN (ANALYZE, BUFFERS)`:

| Index | Query Pattern |
|-------|---------------|
| `categories(parent_id)` | Adjacency list parent lookups |
| `category_closure(ancestor_id, descendant_id)` | Subtree membership via closure |
| `category_closure(descendant_id, ancestor_id)` | Reverse closure path lookups |
| `listings(category_id, created_at DESC, id DESC)` | Category-filtered cursor pagination |
| `listings(model_id)` | Make/model listing lookups |
| `listings(status)` | Status-based filtering |
| `listings(year DESC, id DESC)` | Year-sorted pagination |
| `listings(price DESC, id DESC)` | Price-sorted pagination |
| `listings(mileage DESC, id DESC)` | Mileage-sorted pagination |
| `listings(created_at DESC, id DESC)` | Default cursor pagination |
| `listings(model_id, category_id, status, year, price)` | Composite filter index |
| `listings USING GIN (search_vector)` | Full-text search (GIN) |
| `listing_attribute_values(attribute_id, value_text)` | Dynamic text filter |
| `listing_attribute_values(attribute_id, value_numeric)` | Dynamic numeric filter |
| `listing_attribute_values(attribute_id, value_boolean)` | Dynamic boolean filter |
| `filter_attribute_options(attribute_id, value)` | Option lookup for enum filters |

## Category Hierarchy Strategy

**Adjacency List + Closure Table**: The `categories` table maintains a standard `parent_id` adjacency-list pointer. The `category_closure` table records every ancestor-descendant pair with depth, enabling O(1) subtree queries via a simple `JOIN category_closure` without recursive CTEs. This trades minimal write overhead (closure rows inserted on category creation) for consistently fast read performance on the most frequent category browsing path.

## Dynamic Filter Strategy

**Typed Entity-Attribute-Value (EAV)**: Filter attributes are metadata-driven (`filter_attributes`, `category_filter_attributes`). Each listing attribute value (`listing_attribute_values`) is stored in the type-matching column (`value_text`, `value_numeric`, or `value_boolean`) with a single-value constraint. This preserves SQL type safety and index performance while allowing new vehicle attributes without schema migrations.

## Pagination Strategy

**Keyset / Cursor-Based Pagination**: The `(created_at, id)` tuple (or any sortable column + id) is encoded as a base64url JSON payload and passed as `cursor`. Each subsequent page appends `WHERE (col, id) < (cursor_value, cursor_id)` to avoid OFFSET-based performance degradation on large datasets. Sorting is supported on `created_at`, `price`, `year`, and `mileage`.

## Search Strategy

**PostgreSQL Full-Text Search**: A `tsvector` column (`search_vector`) is maintained via a trigger that indexes listing title (weight A), make + model name (weight B), city (weight C), and description (weight D). The `GIN` index on `search_vector` supports `websearch_to_tsquery('english', ...)` queries. Full-text search is combined with category closure subtree filtering and dynamic EAV filters in a single SQL query — filtering happens at the database level, not in application memory.

## Deployment

Deployed on **Render** using a Blueprint (`render.yaml`):

1. Push the repository to GitHub
2. Connect the repository to Render
3. Render reads `render.yaml` and provisions:
   - A free-tier web service (`node dist/src/server.js`)
   - A PostgreSQL 14 database
4. Render runs `npm install && npm run build` on deploy
5. Migrations and seed run via the deploy hook or on first start

For manual deployment on any Node.js host:

```bash
npm install
npm run build
npm run migrate
npm run seed
npm start
```

## Live API

- **Base URL:** https://automotive-marketplace-api.onrender.com
- **Health Check:** https://automotive-marketplace-api.onrender.com/health

## Query Performance Verification

Query plans were inspected using PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` to verify index usage:

- Category subtree queries utilize `idx_category_closure_ancestor_descendant`
- Listing cursor pagination uses `idx_listings_created_id_desc`
- Full-text search utilizes GIN index `idx_listings_search_vector`
- Combined search + filter queries remain on index-assisted paths

See `src/db/verify.ts` for the exact verification queries.

## Known Trade-offs

| Decision | Trade-off |
|----------|-----------|
| **PostgreSQL FTS vs. Elasticsearch** | PostgreSQL FTS avoids operational complexity and extra infrastructure while meeting search and filtering requirements. At high scale (10M+ listings), Elasticsearch or Meilisearch would be preferred. |
| **Closure Table vs. Recursive CTEs** | Closure table trades small write overhead (extra rows per category insert) for O(1) subtree reads without recursive SQL. Category trees are read-heavy, making this a net win. |
| **Typed EAV vs. JSONB** | Typed EAV maintains strict SQL type safety and indexed filter performance without dynamic table migrations. JSONB would be simpler but loses type-safe indexing. |
| **Cursor Pagination vs. OFFSET** | Cursor pagination avoids performance degradation on deep pages. The trade-off is non-jumping page navigation (no random page access). |
| **No ORM (raw SQL)** | Full control over query plans and indexes. Trade-off is more verbose repository code vs. ORM convenience. |

## Future Improvements

- **Authentication & Authorization** — User accounts, JWT/session management, and role-based access control
- **Listing Images Upload** — S3/R2 integration for image upload, resizing, and CDN delivery
- **Geospatial Search** — PostGIS integration for radius-based location search
- **Saved Searches & Alerts** — Push notification for price drops on watched listings
- **Caching Layer** — Redis for repeated facet/search results and category tree
- **Rate Limiting** — Per-IP or per-user request throttling
- **Structured Test Data Seeding** — Deterministic PRNG for reproducible seed data across environments

## AI Usage

AI tools (OpenCode / Anthropic Claude) were utilized for pair-programming, scaffolding boilerplate code, writing SQL migration scripts, unit/integration test suites, and OpenAPI documentation generation.

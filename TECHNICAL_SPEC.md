# Backend Technical Assessment — Technical Specification

**Company:** PT Daya Rekadigital Indonesia  
**Position:** Backend Developer (Entry Level)  
**Domain:** Automotive Marketplace API  
**Assessment type:** Take-Home Project  
**Spec status:** Implementation-ready working specification

> This document translates the assessment requirements into a concrete implementation plan. Assessment requirements are treated as constraints; implementation choices below are engineering decisions for this submission.

---

## 1. Objective

Build a production-oriented RESTful API for an automotive marketplace where:

- sellers create and manage vehicle listings;
- buyers browse, filter, search, and inspect listings;
- categories form an arbitrarily deep hierarchy;
- filter attributes can vary by category and support `enum`, `range`, and `boolean` types;
- search supports full-text queries plus combined filters;
- listing browsing uses deterministic cursor pagination;
- the database is relational and optimized with appropriate indexes;
- the codebase follows a clean, modular backend architecture.

The implementation must satisfy the required API endpoints, database/schema deliverables, seed requirements, documentation requirements, and public deployment requirements from the assessment.

---

## 2. Assessment Constraints

### Required constraints

- Runtime/framework: **Node.js + Express + TypeScript**
- Database: **PostgreSQL**
- ORM: **Forbidden**
- Database access: **Raw SQL through the `pg` driver**
- Schema diagram: **dbdiagram.io**
- Documentation: **OpenAPI/Swagger**
- Seed data: **at least 500 listings** across multiple categories
- Deployment: **publicly accessible and testable**
- `.env.example`: required
- Git history: meaningful commits; do not squash the whole implementation into one commit

### Explicitly deferred unless implementation is already stable

- Redis caching
- Docker
- Elasticsearch/OpenSearch
- authentication/authorization
- rate limiting
- microservices
- event sourcing / CQRS

These are not part of the critical path because the assessment marks Redis and Docker as optional extras and the core evaluation is schema, API, querying, indexing, pagination, architecture, and code quality.

---

## 3. Technology Decisions

| Area | Decision | Rationale |
|---|---|---|
| Runtime | Node.js | Directly allowed by the assessment and broadly supported for REST APIs. |
| Framework | Express | Minimal framework overhead; keeps focus on API, SQL, schema, and performance. |
| Language | TypeScript | Strong typing for request/response contracts and service boundaries. |
| Database | PostgreSQL | Strong relational constraints plus mature full-text search, GIN indexes, CTEs, and indexing capabilities. |
| DB driver | `pg` | Raw SQL access without ORM, satisfying the assessment constraint. |
| Validation | Zod | Runtime validation with TypeScript-friendly schemas. |
| Testing | Vitest + HTTP/integration tests | Fast feedback for repository/service/API behavior. |
| API documentation | OpenAPI 3.x | Machine-readable contract with sample requests/responses. |
| Search | PostgreSQL full-text search | Avoids introducing a separate search infrastructure for the assessment. |
| Category hierarchy | Adjacency list + closure table | Simple writes and efficient subtree filtering/traversal. |
| Dynamic filters | Metadata tables + typed EAV values | Allows category-specific filters without changing the schema for each new attribute. |
| Pagination | Cursor/keyset pagination | Avoids large OFFSET scans and gives deterministic paging. |

---

## 4. Architecture

Use a modular layered architecture without excessive abstraction.

```text
HTTP Request
    |
    v
Controller / Route Handler
    |
    v
Validation (Zod)
    |
    v
Service / Application Logic
    |
    v
Repository / SQL Access
    |
    v
PostgreSQL
```

### Responsibilities

**Controller**
- Reads route/query/body input.
- Calls validation and service methods.
- Maps application results to HTTP responses.
- Contains no SQL.

**Service**
- Coordinates business/application rules.
- Handles use-case logic such as category scoping, soft-delete semantics, filter interpretation, and pagination.
- Should not depend on Express request/response objects.

**Repository**
- Owns SQL statements and database access.
- Uses parameterized queries.
- Returns typed domain/application data.

**Validation**
- Validates path params, query params, request bodies, and dynamic filter syntax before reaching repository code.

**Error handling**
- Centralized application error model and Express error middleware.
- Do not expose raw PostgreSQL errors to clients.

---

## 5. Proposed Project Structure

```text
src/
├── modules/
│   ├── listings/
│   │   ├── listing.controller.ts
│   │   ├── listing.service.ts
│   │   ├── listing.repository.ts
│   │   ├── listing.schema.ts
│   │   └── listing.types.ts
│   ├── categories/
│   │   ├── category.controller.ts
│   │   ├── category.service.ts
│   │   ├── category.repository.ts
│   │   ├── category.schema.ts
│   │   └── category.types.ts
│   ├── filters/
│   │   ├── filter.controller.ts
│   │   ├── filter.service.ts
│   │   ├── filter.repository.ts
│   │   ├── filter.schema.ts
│   │   └── filter.types.ts
│   └── search/
│       ├── search.controller.ts
│       ├── search.service.ts
│       ├── search.repository.ts
│       └── search.schema.ts
├── db/
│   ├── migrations/
│   ├── seeds/
│   └── pool.ts
├── middleware/
│   ├── error-handler.ts
│   ├── not-found.ts
│   └── validation.ts
├── shared/
│   ├── errors/
│   └── pagination/
├── app.ts
└── server.ts
```

Do not create separate layers that do not carry meaningful responsibilities.

---

## 6. Domain Model

### Core entities

```text
makes
models
categories
category_closure

listings
listing_images

filter_attributes
category_filter_attributes
filter_attribute_options
listing_attribute_values
```

### Relationship overview

```text
makes 1 ───── * models
models 1 ───── * listings

categories 1 ───── * categories (parent-child)
categories * ───── * categories (through category_closure)

listings 1 ───── * listing_images

categories * ───── * filter_attributes
          (through category_filter_attributes)

filter_attributes 1 ───── * filter_attribute_options
listings * ───── * filter_attributes
          (through listing_attribute_values)
```

---

## 7. Database Schema

### 7.1 `makes`

```text
id              uuid PK
name            varchar(100) UNIQUE NOT NULL
slug            varchar(120) UNIQUE NOT NULL
created_at      timestamptz NOT NULL DEFAULT now()
```

### 7.2 `models`

```text
id              uuid PK
make_id         uuid FK -> makes.id NOT NULL
name            varchar(100) NOT NULL
slug            varchar(120) NOT NULL
created_at      timestamptz NOT NULL DEFAULT now()
UNIQUE(make_id, slug)
```

### 7.3 `categories`

```text
id              uuid PK
parent_id       uuid FK -> categories.id NULL
name            varchar(120) NOT NULL
slug            varchar(140) NOT NULL
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
UNIQUE(parent_id, slug)
```

`parent_id = NULL` identifies a root category.

### 7.4 `category_closure`

```text
ancestor_id     uuid FK -> categories.id NOT NULL
descendant_id   uuid FK -> categories.id NOT NULL
depth           integer NOT NULL CHECK(depth >= 0)
PRIMARY KEY (ancestor_id, descendant_id)
```

Use a closure table to support efficient subtree queries for arbitrary category depth.

Example:

```text
Cars
└── SUV
    └── 7-Seater
```

The closure table stores ancestor/descendant relationships for the full subtree, including self-links at `depth = 0`.

### 7.5 `listings`

```text
id              uuid PK
model_id        uuid FK -> models.id NOT NULL
category_id     uuid FK -> categories.id NOT NULL

title           varchar(200) NOT NULL
description     text NULL

year            smallint NOT NULL
mileage         integer NOT NULL
price           numeric(15,2) NOT NULL
condition       varchar(30) NOT NULL
transmission    varchar(30) NOT NULL
fuel_type       varchar(30) NOT NULL
color           varchar(50) NOT NULL

city            varchar(100) NOT NULL
latitude        numeric(9,6) NULL
longitude       numeric(9,6) NULL

status          varchar(20) NOT NULL
search_vector   tsvector NULL

created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
```

Recommended checks:

```text
year > 1885
mileage >= 0
price >= 0
status IN ('available', 'pending', 'sold', 'removed')
```

The assessment explicitly defines the listing status domain as available / sold / pending and requires soft-delete behavior using `removed`; therefore `removed` is treated as a persistence state used for soft deletion while the public browse/search flows exclude it.

### 7.6 `listing_images`

```text
id              uuid PK
listing_id      uuid FK -> listings.id NOT NULL
image_url       text NOT NULL
sort_order      integer NOT NULL DEFAULT 0
created_at      timestamptz NOT NULL DEFAULT now()
```

Index:

```text
(listing_id, sort_order)
```

### 7.7 `filter_attributes`

```text
id              uuid PK
key             varchar(80) UNIQUE NOT NULL
name            varchar(120) NOT NULL
type            varchar(20) NOT NULL
created_at      timestamptz NOT NULL DEFAULT now()
```

Allowed types:

```text
enum
range
boolean
```

### 7.8 `category_filter_attributes`

```text
category_id     uuid FK -> categories.id NOT NULL
attribute_id    uuid FK -> filter_attributes.id NOT NULL
required        boolean NOT NULL DEFAULT false
PRIMARY KEY (category_id, attribute_id)
```

This defines which dynamic filters are valid for a category.

### 7.9 `filter_attribute_options`

Used for `enum` attributes.

```text
id              uuid PK
attribute_id    uuid FK -> filter_attributes.id NOT NULL
value           varchar(100) NOT NULL
label           varchar(120) NOT NULL
sort_order      integer NOT NULL DEFAULT 0
UNIQUE(attribute_id, value)
```

### 7.10 `listing_attribute_values`

Typed EAV storage:

```text
listing_id      uuid FK -> listings.id NOT NULL
attribute_id    uuid FK -> filter_attributes.id NOT NULL
value_text      varchar(255) NULL
value_numeric   numeric(15,4) NULL
value_boolean   boolean NULL
PRIMARY KEY (listing_id, attribute_id)
```

Only one value column should be populated according to the referenced attribute type.

Application validation must enforce this rule, and SQL constraints can additionally enforce mutually exclusive value columns where practical.

---

## 8. Category Tree Strategy

Use **adjacency list + closure table**.

### Why

The adjacency list (`categories.parent_id`) keeps the category model intuitive and makes inserts/updates simple.

The closure table (`category_closure`) makes reads such as:

- all descendants of a category;
- all listings within a category subtree;
- category depth traversal;

efficient without recursively rebuilding the hierarchy in application code for every request.

### Listing scoping rule

For:

```text
GET /categories/:id/listings
```

resolve the category subtree through `category_closure`, then filter listings by the resulting descendant category IDs.

---

## 9. Dynamic Filter Strategy

The filter system is metadata-driven.

Example:

```text
Cars
├── fuel_type        enum
├── transmission     enum
├── seats             range
└── sunroof           boolean

Motorcycles
├── fuel_type        enum
└── transmission     enum
```

A new filter can be added by inserting metadata instead of creating a new physical column on `listings`.

### Query behavior

For dynamic filters:

1. Validate the filter key against `filter_attributes`.
2. Validate that the attribute is enabled for the requested category.
3. Validate the value shape based on `filter_attributes.type`.
4. Convert the filter to a parameterized SQL predicate.
5. Apply it to the listing query.

Never interpolate user-provided filter values directly into SQL.

---

## 10. Search Strategy

Use PostgreSQL full-text search for listing title/description and normalized make/model/city text.

### Search vector

The application should maintain a `tsvector` containing weighted text roughly equivalent to:

```text
A: title
B: make + model
C: city
D: description
```

Create a GIN index over `search_vector`.

### Search requirements

`GET /listings/search` supports:

- free-text search;
- category/subcategory scope;
- make/model filters;
- price range;
- year range;
- fuel type;
- transmission;
- status where appropriate;
- dynamic category-specific filters;
- sorting;
- cursor pagination.

The query builder must combine predicates using parameterized SQL.

---

## 11. Faceted Filters

`GET /filters` returns available filter options with counts for the current search/filter context.

`GET /filters/:categoryId` returns filter definitions available to that category.

Facet counts should represent the current filtered result set rather than unrelated global counts.

Example concept:

```json
{
  "filters": [
    {
      "key": "fuel_type",
      "type": "enum",
      "options": [
        { "value": "gasoline", "count": 142 },
        { "value": "diesel", "count": 38 },
        { "value": "hybrid", "count": 21 }
      ]
    }
  ]
}
```

The implementation may use aggregation queries over the same filtered listing scope. Keep the query plan understandable and parameterized rather than building a generalized SQL generation framework.

---

## 12. Indexing Strategy

Indexes must support the actual query patterns rather than being added indiscriminately.

### Required/primary indexes

```text
categories(parent_id)
category_closure(ancestor_id, descendant_id)
category_closure(descendant_id, ancestor_id)

models(make_id)
listings(model_id)
listings(category_id)
listings(status)
listings(year)
listings(price)
listings(created_at DESC, id DESC)

listing_images(listing_id, sort_order)

filter_attribute_options(attribute_id, value)
listing_attribute_values(attribute_id, value_text)
listing_attribute_values(attribute_id, value_numeric)
listing_attribute_values(attribute_id, value_boolean)

GIN(listings.search_vector)
```

Additional composite indexes should be created only where they match the implemented sort/filter combinations and are justified by query plans.

### Important rule

Do not claim an index is useful without matching it to a real query. During verification, inspect representative queries using `EXPLAIN (ANALYZE, BUFFERS)` where practical.

---

## 13. Cursor Pagination Strategy

Use keyset/cursor pagination rather than `OFFSET`.

### Default sort

```text
ORDER BY created_at DESC, id DESC
```

This provides deterministic ordering even when multiple listings share the same timestamp.

### Default cursor condition

For the next page:

```sql
WHERE (created_at, id) < ($cursorCreatedAt, $cursorId)
```

### Cursor encoding

Use a base64url-encoded JSON payload containing the fields required for the active sort.

Conceptually:

```json
{
  "createdAt": "2026-09-25T01:00:00.000Z",
  "id": "uuid"
}
```

The API must reject malformed or incompatible cursors with a client error.

### Limits

Recommended:

```text
default: 20
maximum: 50
```

If a request asks for more than the maximum, either clamp it or reject it consistently; choose one behavior and document it.

### Sort allowlist

Only explicitly supported sort fields may be used. User input must never be inserted as raw SQL identifiers.

---

## 14. API Contract

Base path:

```text
/api/v1
```

### Listings

#### `POST /listings`

Create a listing.

Expected behavior:

- validate required fields;
- validate model/category existence;
- validate dynamic attributes against the category;
- create listing and images transactionally;
- return `201 Created`.

#### `GET /listings`

Browse listings with:

- filters;
- sorting;
- cursor pagination.

Default behavior must exclude `removed` listings.

#### `GET /listings/:id`

Return a single listing detail.

A soft-deleted listing should not be returned as a normal public resource unless the API explicitly defines another administrative mode.

#### `PATCH /listings/:id`

Partial update.

Revalidate any changed dynamic attributes against the listing category.

#### `DELETE /listings/:id`

Soft delete only:

```text
status = 'removed'
```

Return `204 No Content` on success.

### Search and Filters

#### `GET /listings/search`

Full-text + faceted search with combined filters.

#### `GET /listings/search/suggest`

Autocomplete suggestions for:

- make;
- model;
- city.

Suggestions should be bounded with a small result limit and should not scan unbounded records.

#### `GET /filters`

Return filter definitions/options and counts in the current search context.

#### `GET /filters/:categoryId`

Return filter definitions specific to a category.

### Categories

#### `GET /categories`

Return the category tree.

#### `GET /categories/:id`

Return a category and its direct children.

#### `GET /categories/:id/listings`

Return listings within the category and all descendants.

#### `POST /categories`

Create a category node. Maintain closure-table rows transactionally.

#### `PATCH /categories/:id`

Update category metadata and, if `parent_id` changes, rebuild/migrate the affected closure relationships transactionally.

---

## 15. Response Envelope

Use a consistent response shape.

### Success example

```json
{
  "data": {
    "id": "...",
    "title": "Toyota Fortuner 2.8 GR Sport"
  }
}
```

For collections:

```json
{
  "data": [
    {}
  ],
  "pagination": {
    "nextCursor": "...",
    "hasNextPage": true
  }
}
```

### Error example

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "price",
        "message": "Expected a non-negative number"
      }
    ]
  }
}
```

Use stable application error codes.

---

## 16. HTTP Error Semantics

Recommended mapping:

```text
400  invalid query/body/path input
404  resource not found
409  domain/uniqueness conflict
422  semantically invalid state where useful
500  unexpected server error
```

Do not return database implementation details in client-facing error messages.

---

## 17. Transaction Boundaries

Use a PostgreSQL transaction for operations that modify multiple related records.

Examples:

- create listing + images + attribute values;
- update listing + changed images + attribute values;
- create category + closure rows;
- move category + closure-table updates.

The repository layer should expose transaction-safe methods or a small transaction context abstraction.

---

## 18. Seed Strategy

Provide a deterministic seed command that creates **at least 500 listings** across multiple categories.

Recommended target:

```text
1,000 listings
10+ makes
multiple models per make
multiple root/child categories
multiple cities
multiple years
multiple price bands
multiple conditions
multiple transmissions
multiple fuel types
multiple dynamic attribute combinations
```

Use deterministic/randomized generation with a fixed seed where practical so local and deployed environments can reproduce representative data.

Seed order:

```text
makes
→ models
→ categories
→ closure relationships
→ filter attributes
→ filter options
→ category-filter mappings
→ listings
→ listing images
→ listing attribute values
```

---

## 19. Testing Strategy

Prioritize integration-level verification over excessive unit-test volume.

### Required tests

**Listings**

- create valid listing;
- reject invalid listing;
- get listing;
- update listing;
- soft delete listing;
- deleted listing excluded from public browse/search.

**Pagination**

- first page returns cursor;
- next page uses cursor correctly;
- no duplicate listings across adjacent pages;
- deterministic ordering.

**Categories**

- create root category;
- create child category;
- retrieve tree;
- category listing endpoint includes descendants.

**Dynamic filters**

- category-valid attribute succeeds;
- category-invalid attribute is rejected;
- enum/range/boolean values validate correctly.

**Search**

- full-text query returns matching listings;
- multiple filters combine correctly;
- suggest endpoint returns bounded results;
- facet counts are consistent with the filtered scope.

**Database**

- migrations work from a clean database;
- seed command succeeds;
- representative queries execute successfully against 500+ records.

### Optional performance verification

Run `EXPLAIN (ANALYZE, BUFFERS)` for representative:

- browse with cursor;
- category subtree listing query;
- full-text + price/year filters;
- dynamic filter query.

Record notable findings in the README rather than presenting fabricated benchmark numbers.

---

## 20. Security / Robustness Rules

- All values use parameterized SQL parameters.
- SQL identifiers such as sort columns are selected from an allowlist.
- Validate every request body, query parameter, and path parameter.
- Bound pagination limits.
- Bound suggestion results.
- Do not return internal stack traces in production responses.
- Do not commit real secrets.
- `.env.example` must contain variable names only.
- Keep database credentials outside source control.

---

## 21. API Documentation

Deliver an OpenAPI specification covering every required endpoint.

Each endpoint should include:

- method + path;
- summary/description;
- parameters;
- request body where applicable;
- success response;
- common error responses;
- example request;
- example response.

The generated or checked-in specification should match the implementation.

---

## 22. ERD / dbdiagram.io Deliverable

Create a dbdiagram.io diagram representing the actual implemented schema.

The diagram must include the main relationships for:

```text
makes
models
categories
category_closure
listings
listing_images
filter_attributes
category_filter_attributes
filter_attribute_options
listing_attribute_values
```

The repository README should explain:

1. the category tree strategy;
2. the dynamic filter strategy;
3. the indexing strategy;
4. relevant trade-offs.

---

## 23. README Deliverable

The README must allow a reviewer to run and understand the project without reading the entire source tree.

Required sections:

```text
Project overview
Architecture
Technology stack
Prerequisites
Environment variables
Local setup
Database migration
Database seed
Run application
Run tests
API documentation
ERD / schema diagram
Indexing strategy
Category hierarchy strategy
Dynamic filter strategy
Pagination strategy
Search strategy
Deployment / live URL
Known trade-offs
Future improvements
```

Include the public live base URL required by the assessment.

---

## 24. Environment Variables

`.env.example` should define the required variables without real secrets.

Example baseline:

```text
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/automotive_marketplace
```

Add any deployment-specific variables only when actually required by the implementation.

---

## 25. Deployment

Deploy the API to a publicly accessible platform such as Railway, Render, Fly.io, or equivalent.

Deployment requirements:

- application starts successfully;
- database is reachable;
- migrations are applied;
- seed data exists where appropriate;
- health endpoint is available;
- required endpoints can be tested externally;
- README contains the live base URL.

Before submission, perform a live smoke test against the deployed instance.

---

## 26. Observability for the Assessment

Keep this intentionally lightweight.

Provide:

```text
GET /health
```

The health endpoint should confirm that the API process is running. A database readiness check may be included if it remains simple and reliable.

Log enough context to diagnose server errors, but do not log secrets or sensitive database credentials.

---

## 27. Performance Principles

The assessment emphasizes performance and search/filter behavior. The implementation should therefore follow these principles:

1. Filter in PostgreSQL rather than loading large datasets into Node.js.
2. Use indexes that match actual query predicates and sort order.
3. Use keyset pagination instead of large OFFSET values.
4. Use PostgreSQL full-text indexing rather than application-side text scanning.
5. Avoid N+1 queries for listing details and category traversal.
6. Keep result limits bounded.
7. Use `EXPLAIN (ANALYZE, BUFFERS)` to validate representative query plans where time permits.

---

## 28. Deliberate Trade-offs

### PostgreSQL FTS instead of Elasticsearch

A separate search engine would add operational complexity and setup time. PostgreSQL full-text search is sufficient for the assessment's required full-text and combined filtering behavior and keeps the architecture simpler.

### Closure table instead of adjacency list alone

Adjacency list alone is simple but makes repeated subtree reads more expensive or dependent on recursive queries. The closure table adds write complexity in exchange for predictable subtree reads, which is directly aligned with the category filtering requirement.

### Typed EAV for dynamic filters

A fully columnar schema would be simpler for a fixed set of vehicle attributes, but the assessment explicitly requires category-specific, dynamically defined attributes. Typed EAV keeps that capability without schema changes for every new filter. The trade-off is more complex queries and stronger validation requirements.

### No Redis initially

Caching can improve repeated reads but introduces invalidation and deployment complexity. It is an optional bonus rather than a core requirement, so it remains outside the critical path.

---

## 29. Implementation Tickets

### Ticket 1 — Project foundation

- scaffold Node.js + TypeScript + Express;
- configure environment handling;
- configure PostgreSQL pool;
- add migration runner;
- add validation middleware;
- add centralized errors;
- add `/health`;
- establish initial commit.

### Ticket 2 — Relational schema

- create all tables;
- add foreign keys/checks/unique constraints;
- add closure-table logic;
- add indexes;
- add search vector and GIN index;
- verify migrations from clean database.

### Ticket 3 — Category module

- category CRUD endpoints;
- closure-table maintenance;
- category tree retrieval;
- subtree listing query.

### Ticket 4 — Listing CRUD

- create listing;
- read listing;
- browse listing;
- patch listing;
- soft delete;
- validation;
- cursor pagination;
- transactional image/attribute writes.

### Ticket 5 — Dynamic filters

- filter metadata endpoints;
- category-filter mapping;
- typed attribute validation;
- dynamic SQL predicates;
- filter option counts.

### Ticket 6 — Search

- full-text search;
- combined filters;
- suggestions;
- facets;
- category-scoped search;
- cursor pagination.

### Ticket 7 — Seed + verification

- deterministic 500+ listing seed;
- integration tests;
- representative query-plan verification;
- fix correctness/performance issues found during verification.

### Ticket 8 — Documentation + deployment

- OpenAPI;
- README;
- dbdiagram.io ERD;
- `.env.example`;
- deploy;
- live smoke test;
- final repository cleanup.

---

## 30. Definition of Done

The assessment is ready for submission only when all of the following are true:

- [ ] API starts from documented instructions.
- [ ] PostgreSQL migrations work from a clean database.
- [ ] No ORM is used.
- [ ] All required endpoints are implemented.
- [ ] Request validation exists.
- [ ] Errors have a consistent response shape.
- [ ] Public listing/search flows exclude `removed` listings.
- [ ] Cursor pagination is deterministic and tested.
- [ ] Category subtree queries are supported.
- [ ] Dynamic category-specific filters support enum/range/boolean.
- [ ] Full-text search works.
- [ ] Combined filters work together.
- [ ] Suggestions are bounded and functional.
- [ ] Facet counts are returned.
- [ ] Relevant indexes exist.
- [ ] Seed creates at least 500 listings.
- [ ] Integration tests pass.
- [ ] OpenAPI documentation matches implementation.
- [ ] dbdiagram.io ERD matches implementation.
- [ ] `.env.example` is present and contains no secrets.
- [ ] README contains setup, decisions, and live URL.
- [ ] Public deployment is reachable and smoke-tested.
- [ ] Git history contains meaningful commits.

---

## 31. Verification Command Checklist

The exact commands depend on the selected package manager, but the final verification sequence should be equivalent to:

```text
install dependencies
run database migrations
run seed
run typecheck
run lint (when configured)
run tests
start API
smoke-test /health
smoke-test required endpoints
verify OpenAPI
verify ERD/schema consistency
verify git status
inspect git log
```

Do not mark the submission complete based only on a successful local build; verify the deployed API as well.

---

## 32. Scope Discipline for the 2-Hour Implementation Window

The implementation should optimize for **correctness, clarity, and completion**.

When time is constrained, prefer:

```text
simple SQL over generalized SQL frameworks
simple modules over deep abstraction
PostgreSQL FTS over a second search service
correct indexes over many speculative indexes
integration tests over a very large unit-test suite
complete documentation over optional infrastructure
```

Do not add features that jeopardize the required endpoints, schema, seed, documentation, or deployment.

---

## 33. Final Engineering Questions Before Submission

A reviewer should be able to answer "yes" to the following after reading the repository:

- Is the relational model internally consistent?
- Can the category tree support arbitrary depth?
- Can category-specific filters be added without changing the listings table?
- Are combined search/filter queries implemented in the database rather than in Node.js memory?
- Is cursor pagination deterministic?
- Are SQL statements parameterized?
- Are user-controlled sort/filter identifiers allowlisted?
- Do the indexes correspond to real query patterns?
- Can the project be started from the README?
- Can a reviewer test the live API without local setup?
- Can the developer explain every major architectural decision and its trade-off?

---

## 34. Source of Requirements

This specification is based on the provided **Backend Technical Assessment — PT Daya Rekadigital Indonesia**, which defines the automotive marketplace domain, allowed stack, required endpoints, deliverables, seed requirement, deployment requirement, and expectation of clear architectural reasoning.

The detailed implementation decisions in this document are engineering choices for the assessment and are not presented as additional requirements from the company.

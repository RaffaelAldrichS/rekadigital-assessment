-- 001_init.sql
-- Ticket 02: Relational Schema & Migrations

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Makes
CREATE TABLE IF NOT EXISTS makes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(120) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Models
CREATE TABLE IF NOT EXISTS models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    make_id UUID NOT NULL REFERENCES makes(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_models_make_id_slug UNIQUE (make_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_models_make_id ON models(make_id);

-- 3. Categories
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(140) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_categories_parent_id_slug UNIQUE (parent_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_root_slug ON categories(slug) WHERE parent_id IS NULL;

-- 4. Category Closure
CREATE TABLE IF NOT EXISTS category_closure (
    ancestor_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    descendant_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    depth INTEGER NOT NULL CHECK (depth >= 0),
    PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX IF NOT EXISTS idx_category_closure_ancestor_descendant ON category_closure(ancestor_id, descendant_id);
CREATE INDEX IF NOT EXISTS idx_category_closure_descendant_ancestor ON category_closure(descendant_id, ancestor_id);

-- 5. Listings
CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    year SMALLINT NOT NULL CHECK (year > 1885),
    mileage INTEGER NOT NULL CHECK (mileage >= 0),
    price NUMERIC(15, 2) NOT NULL CHECK (price >= 0),
    condition VARCHAR(30) NOT NULL,
    transmission VARCHAR(30) NOT NULL,
    fuel_type VARCHAR(30) NOT NULL,
    color VARCHAR(50) NOT NULL,
    city VARCHAR(100) NOT NULL,
    latitude NUMERIC(9, 6) NULL,
    longitude NUMERIC(9, 6) NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('available', 'pending', 'sold', 'removed')),
    search_vector TSVECTOR NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_model_id ON listings(model_id);
CREATE INDEX IF NOT EXISTS idx_listings_category_id ON listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_year ON listings(year);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
CREATE INDEX IF NOT EXISTS idx_listings_created_id_desc ON listings(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_listings_composite_filter ON listings(model_id, category_id, status, year, price);
CREATE INDEX IF NOT EXISTS idx_listings_search_vector ON listings USING GIN (search_vector);

-- 6. Listing Images
CREATE TABLE IF NOT EXISTS listing_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_images_listing_sort ON listing_images(listing_id, sort_order);

-- 7. Filter Attributes
CREATE TABLE IF NOT EXISTS filter_attributes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('enum', 'range', 'boolean')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Category Filter Attributes
CREATE TABLE IF NOT EXISTS category_filter_attributes (
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    attribute_id UUID NOT NULL REFERENCES filter_attributes(id) ON DELETE CASCADE,
    required BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (category_id, attribute_id)
);

-- 9. Filter Attribute Options
CREATE TABLE IF NOT EXISTS filter_attribute_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_id UUID NOT NULL REFERENCES filter_attributes(id) ON DELETE CASCADE,
    value VARCHAR(100) NOT NULL,
    label VARCHAR(120) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_filter_attribute_options_attr_val UNIQUE (attribute_id, value)
);

CREATE INDEX IF NOT EXISTS idx_filter_attr_opts_attr_val ON filter_attribute_options(attribute_id, value);

-- 10. Listing Attribute Values
CREATE TABLE IF NOT EXISTS listing_attribute_values (
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    attribute_id UUID NOT NULL REFERENCES filter_attributes(id) ON DELETE CASCADE,
    value_text VARCHAR(255) NULL,
    value_numeric NUMERIC(15, 4) NULL,
    value_boolean BOOLEAN NULL,
    PRIMARY KEY (listing_id, attribute_id),
    CONSTRAINT check_single_value_populated CHECK (
        (CASE WHEN value_text IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN value_numeric IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN value_boolean IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);

CREATE INDEX IF NOT EXISTS idx_listing_attr_vals_attr_text ON listing_attribute_values(attribute_id, value_text);
CREATE INDEX IF NOT EXISTS idx_listing_attr_vals_attr_numeric ON listing_attribute_values(attribute_id, value_numeric);
CREATE INDEX IF NOT EXISTS idx_listing_attr_vals_attr_boolean ON listing_attribute_values(attribute_id, value_boolean);

-- Functions and Triggers
CREATE OR REPLACE FUNCTION listings_search_vector_trigger() RETURNS trigger AS $$
DECLARE
    m_name text;
    mk_name text;
BEGIN
    SELECT m.name, mk.name INTO m_name, mk_name
    FROM models m
    JOIN makes mk ON m.make_id = mk.id
    WHERE m.id = NEW.model_id;

    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(mk_name, '') || ' ' || coalesce(m_name, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.city, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(NEW.description, '')), 'D');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_listings_search_vector ON listings;
CREATE TRIGGER trg_listings_search_vector
BEFORE INSERT OR UPDATE ON listings
FOR EACH ROW
EXECUTE FUNCTION listings_search_vector_trigger();

CREATE OR REPLACE FUNCTION update_timestamp_trigger() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_categories_updated_at ON categories;
CREATE TRIGGER trg_categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION update_timestamp_trigger();

DROP TRIGGER IF EXISTS trg_listings_updated_at ON listings;
CREATE TRIGGER trg_listings_updated_at
BEFORE UPDATE ON listings
FOR EACH ROW
EXECUTE FUNCTION update_timestamp_trigger();

CREATE INDEX IF NOT EXISTS idx_listings_category_created_id_desc
    ON listings(category_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_listings_price_id_desc
    ON listings(price DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_listings_year_id_desc
    ON listings(year DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_listings_mileage_id_desc
    ON listings(mileage DESC, id DESC);

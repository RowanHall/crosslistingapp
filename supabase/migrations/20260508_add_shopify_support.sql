ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS shopify_listing_url text,
  ADD COLUMN IF NOT EXISTS shopify_product_id  text;

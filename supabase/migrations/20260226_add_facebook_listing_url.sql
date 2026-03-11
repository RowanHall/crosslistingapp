-- Add facebook_listing_url column to listings table
ALTER TABLE listings ADD COLUMN IF NOT EXISTS facebook_listing_url TEXT;

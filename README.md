# Cross-Listing App

A Next.js web app + Chrome extension for managing and cross-posting clothing/resale inventory across multiple marketplaces from a single dashboard.

## What it does

- **Import listings** from Depop and Grailed via the browser extension
- **Centralized inventory dashboard** with listing status across platforms
- **Cross-post to multiple platforms**: Facebook Marketplace, Grailed, eBay, Depop, Poshmark
- **Sync listings** back from Facebook, Grailed, and Depop
- **Auto-fill forms** on eBay, Depop, and Poshmark using the extension
- **Delete listings** from Facebook Marketplace

## Supported Platforms

| Platform | Import | Crosslist | Delete | Sync |
|----------|:------:|:---------:|:------:|:----:|
| Depop | ✅ | ✅ | — | ✅ |
| Grailed | ✅ | ✅ | — | ✅ |
| Facebook Marketplace | — | ✅ | ✅ | ✅ |
| eBay | — | ✅ | — | — |
| Poshmark | — | ✅ | — | — |

## Stack

- **Framework**: Next.js 15 (App Router, TypeScript)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Database**: Supabase (Postgres + Auth + Storage)
- **State**: Zustand
- **Extension**: Chrome Manifest V3

## Project Structure

```
crosslistingapp/
├── app/
│   ├── api/
│   │   ├── crosslist/          # Cross-post endpoints per platform
│   │   ├── integrations/       # Auth/credential endpoints per platform
│   │   └── inventory/          # Bulk import endpoints
│   ├── inventory/              # Main dashboard page
│   ├── listing/[id]/           # Listing detail + cross-post buttons
│   └── account/                # User account settings
├── components/
│   ├── dashboard/              # Inventory grid, sync buttons
│   ├── listing/                # Listing form, cross-post buttons
│   └── ui/                     # shadcn/ui primitives
├── hooks/                      # Per-platform sync/crosslist hooks
├── lib/
│   ├── facebook-marketplace.ts # Facebook Marketplace API helpers
│   ├── grailed.ts              # Grailed API helpers
│   └── universal-listing.ts    # Shared listing model
├── utils/
│   ├── supabase/               # Supabase client/server helpers
│   └── ebay/                   # eBay API utilities
├── extension/
│   ├── background.js           # Service worker (token capture)
│   ├── scripts/
│   │   ├── facebook-scraper.js # Captures Facebook session tokens
│   │   ├── depop-scraper.js    # Auto-imports Depop listings
│   │   ├── depop-filler.js     # Auto-fills Depop create form
│   │   ├── poshmark-filler.js  # Auto-fills Poshmark create form
│   │   └── ebay-filler.js      # Auto-fills eBay create form
│   └── manifest.json
└── supabase/migrations/        # Database schema migrations
```

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project
- Chrome (for the extension)
- eBay developer account (optional, for eBay OAuth)

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables and fill in values
cp .env.example .env.local

# Start the development server
npm run dev
```

App runs at `http://localhost:3000`.

### Load the Chrome Extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `/extension` folder

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# eBay (Sandbox or Production)
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_APP_ID=
EBAY_DEV_ID=
EBAY_CERT_ID=
EBAY_REDIRECT_URI=

# Supabase Storage
SUPABASE_STORAGE_BUCKET=LISTING-IMAGES

# Grailed
GRAILED_DB_NAME=Listing_by_listing_quality_production

# Facebook Marketplace (default location coordinates)
FACEBOOK_DEFAULT_LAT=
FACEBOOK_DEFAULT_LNG=
```

## Database Schema

Two main tables in Supabase:

**`listings`** — Inventory items with cross-platform status
- `id`, `user_id`, `title`, `description`, `price`, `currency`
- `images` (JSONB array), `condition`, `brand`, `size`
- `facebook_listing_url`, `grailed_listing_url`
- `platforms_status` (JSONB — e.g. `{"facebook": "listed", "grailed": "listed"}`)

**`user_integrations`** — Per-platform auth credentials
- `user_id`, `platform`, `access_token`, `refresh_token`, `expires_at`
- UNIQUE constraint on `(user_id, platform)`

## How Authentication Works Per Platform

Platforms use different auth strategies, all captured via the Chrome extension:

| Platform | Auth Method |
|----------|-------------|
| **Facebook Marketplace** | Session cookies (`c_user`, `xs`, `fr`) + CSRF tokens (`fb_dtsg`, `lsd`) captured by extension |
| **Grailed** | `_grailed_session` cookie + `x-csrf-token` header captured by extension |
| **Depop** | OAuth access token captured by extension |
| **eBay** | OAuth 2.0 via eBay developer portal |
| **Poshmark** | Form auto-fill only (no direct API) |

The extension's `background.js` service worker sniffs outgoing requests to detect auth tokens and POSTs them to `/api/integrations/<platform>` on localhost.

## Development Notes

- Use `npx tsx script.ts` to run TypeScript scripts — `ts-node` is broken with this project's `tsconfig.json` (`module: NodeNext`)
- API routes live in `app/api/` as Next.js route handlers
- Cross-post logic: hooks in `hooks/` → API routes in `app/api/crosslist/` → platform helpers in `lib/`

## Commands

```bash
npm run dev       # Start dev server (localhost:3000)
npm run build     # Production build
npm run start     # Run production server
npm run lint      # ESLint
npx jest          # Run tests
```

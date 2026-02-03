# Project Tasks

## 📋 BACKLOG (Future Features)
- [ ] Add eBay filler script (Phase 3)
- [ ] Add Mercari filler script (Phase 3)
- [ ] Create "Mobile Companion" App (React Native)
- [ ] Add "Sale Detection" (Auto-delist sold items)

## 📝 TO DO (Ready to Start)
### Phase 1: The Bulk Importer (Depop -> Supabase)
- [x] **Scaffold Extension**: Create `extension-vendoo` folder with `manifest.json` (Manifest V3).
- [x] **Bridge Script**: Create `scripts/bridge.js` to listen for messages from the Next.js Dashboard.
- [x] **Background Worker**: Debug `TypeError` in In-Tab Fetch (CORS/CSP Blocks). (Fixed by moving fetch to Background Service Worker)
- [x] **API Route**: Create `app/api/inventory/bulk-import/route.ts` to save items to Supabase.
- [ ] **Frontend Trigger**: Verify successful sync in Dashboard.

### Phase 2: The Exporter (Supabase -> Poshmark)
- [x] **Manifest Update**: Add permissions for `https://poshmark.com/*`.
- [ ] **Export Listener**: Update `bridge.js` to handle `CROSS_POST` events.
- [ ] **Poshmark Filler**: Create `scripts/poshmark-filler.js` to inject data into Poshmark's React forms.
- [ ] **Image Handling**: Implement Blob/DataTransfer logic to upload images without downloading them.
- [ ] **UI Action**: Add "List to Poshmark" button on the Listing Details page.

### Phase 3: Dashboard UI
- [ ] **Inventory Page**: Create a table view to show imported items (Image, Title, Price, Status).
- [ ] **Master Form**: Ensure `MasterListingForm` can load data from the Supabase `listings` table.

## 🔨 DOING (Active Focus)
- [ ] **Project Setup**: Clean up old Puppeteer code and install necessary types for Chrome Extension development.

## ✅ DONE
- [x] **Architecture Decision**: Pivot to Chrome Extension "Bridge" model (Vendoo style).
- [x] **Database**: Supabase `listings` table exists.
- [x] **Unit Tests**: Implemented Jest tests for ImportButton, Background, and Bridge.

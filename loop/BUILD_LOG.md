# Build Log

## 2026-10-16 -- Session 2: Content Pages, Event UI, Tauri Build

**status:** COMPLETE

### Built
- **18 content pages** in `content/pages/` with YAML frontmatter + Markdown body
  - Diwali sequence (5): dhanteras, naraka-chaturdashi, diwali-lakshmi-puja, govardhan-puja, bhai-dooj
  - Major festivals (8): maha-shivaratri, holi, ram-navami, vasant-panchami, makar-sankranti, ganesh-chaturthi, chhath-puja, dev-uthani-ekadashi
  - Recurring (5): ekadashi, pradosh-vrat, sankashti-chaturthi, purnima, amavasya
- **Event page renderer** (`frontend/src/event.js`)
  - Parses YAML frontmatter + Markdown body
  - Renders sections as cards with collapsible details
  - "Ask the Guide about this" button links to Saathi
  - Content cached in memory after first load
- **Content-aware Guide** (`frontend/src/guide.js` rewritten)
  - Builds index of all content pages at startup
  - Keyword-matching search against page content
  - Context-sensitive responses (story, how-to, why, when)
  - Links to event pages and suggests related observances
- **Settings modal** in app.js
  - Month system (Purnimanta/Amanta)
  - Tradition (Smarta/Vaishnava)
  - Large type toggle
- **Clickable festival items** in Today and Calendar views
  - Chevron icon, hover state, links to event pages
- **Calendar day detail popup** on day click
  - Shows panchang info and festivals for that day
- **Tauri desktop app built successfully**
  - `target/release/parampara.exe` (12.1 MB)
  - MSI installer: 3.83 MB
  - NSIS installer: 2.54 MB
- **Valid app icons** (saffron-colored PNGs and ICO)
- **3 new festival rules** in engine: Ganesh Chaturthi, Chhath Puja, Dev Uthani Ekadashi
- **Mock data improved** for standalone browser testing
  - Today view shows realistic upcoming festivals
  - Calendar view shows Diwali cluster in Nov 2026

### Files Created/Modified
- `content/pages/*.md` (18 files)
- `frontend/src/event.js` (new)
- `frontend/src/guide.js` (rewritten)
- `frontend/src/app.js` (settings, event page nav)
- `frontend/src/today.js` (clickable festivals, better mocks)
- `frontend/src/calendar.js` (clickable festivals, day popup, mock festivals)
- `frontend/src/styles/main.css` (event page, settings, day popup, suggestion buttons)
- `frontend/vite.config.js` (publicDir for content)
- `engine/src/festivals.rs` (3 new rules, 18 total)
- `src-tauri/icons/*` (valid PNG/ICO files)

### Tested
- 26 engine tests: ALL PASSING (including new 18-rule count test)
- Frontend Vite build: CLEAN (31.5 KB JS, 10.7 KB CSS)
- Tauri desktop build: SUCCESS (both MSI and NSIS)

---

## 2026-10-16 -- Foundation and Panchang Engine

**status:** COMPLETE

### Built
- Rust panchang engine (`engine/`) as standalone crate
  - `astronomy.rs`: Sun/Moon positions (Meeus algorithms), Lahiri ayanamsa
  - `sunrise.rs`: NOAA-based sunrise/sunset, hourly-sweep moonrise
  - `tithi.rs`: Tithi, nakshatra, yoga, karana computation
  - `calendar.rs`: Lunar month determination, Meeus new moon formula, Adhik Maas
  - `festivals.rs`: Rule evaluator with 15 default rules (Diwali x5, Ekadashi, Pradosh, etc.)
  - `types.rs`: Full type system (30 tithis, 27 nakshatras, 12 lunar months, etc.)
- Tauri 2 project structure (`src-tauri/`)
  - IPC commands: get_panchang, get_panchang_range, get_festivals, compare_locations
  - Workspace setup linking engine crate
- Frontend shell (`frontend/`)
  - Vite + vanilla JS
  - Today view with panchang display, festival list, Sun/Moon times
  - Calendar view with month grid, tithi overlay, festival dots
  - Guide view with chat UI and mock responses
  - Clean CSS with saffron/warm color scheme, mobile-ready
- Project infrastructure
  - Git initialized, GitHub remote set
  - CLAUDE.md, DEVELOPMENT_PLAN.md
  - Loop files (STATE.md, OPEN_ITEMS.md, BUILD_LOG.md)

### Tested
- 26 tests total, ALL PASSING

### Key Results
- Melbourne sunrise Oct 16: 06:33 AEDT (accurate)
- Melbourne sunset Oct 16: 19:38 AEDT (accurate)
- Diwali 2026 detected: November 8 (matches PRD)
- DST transition: 57-minute sunrise shift on Oct 4 (correct)
- Melbourne vs Delhi: 4 days with different tithis in Oct-Dec (working)

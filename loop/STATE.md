# State - Parampara

**Last updated:** 2026-10-16

## Current Phase
Phase 4 (Calendar UI) COMPLETE. Phase 5 (Content Pages + Event UI) COMPLETE.
Tauri desktop app builds and runs.

## What Works
- Panchang engine: tithi, nakshatra, yoga, karana, sunrise/sunset/moonrise
- DST handling (AEST/AEDT) verified
- Melbourne vs Delhi date comparison
- 18 festival rules (Diwali x5, recurring, major festivals)
- 26 tests passing
- 18 content pages with full YAML frontmatter + Markdown
- Event page renderer with section cards and collapsible details
- Content-aware Guide ("Saathi") with keyword search against all pages
- Clickable festival items in Today, Calendar, and Guide views
- Calendar day detail popup with panchang + festivals
- Settings modal (month system, tradition, large type)
- Tauri desktop build: MSI and NSIS installers
- Frontend builds standalone with Vite (mock data mode)

## What's Next
1. Backend server (Node.js): magic link auth, guide API proxy
2. AI guide integration (Claude API with system prompt + content retrieval)
3. Family traditions CRUD (text notes, voice, photos)
4. Validate engine dates against Drik Panchang
5. Compare with India panel

## Blockers
None currently.

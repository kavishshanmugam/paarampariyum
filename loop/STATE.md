# State - Parampara

**Last updated:** 2026-10-22

## Current Phase
All P0 and P1 items COMPLETE. Ready for user testing.

## What Works
- Panchang engine: tithi, nakshatra, yoga, karana, sunrise/sunset/moonrise
- Engine validated against Drik Panchang (Melbourne) -- all major festivals match
- 3 engine bugs fixed: sunrise JD offset, lunar month mapping (+1), TimeWindow evaluation
- DST handling verified, festival dedup, 30 tests passing
- 18 festival rules with proper TimeWindow-aware matching
- 18 content pages with YAML frontmatter + Markdown
- Frontend: Today, Calendar, Guide, Event views (Vite + vanilla JS)
- Auth screen with magic link login + admin bootstrap + guest mode
- AI guide (Claude API via backend when authenticated, local keyword search fallback)
- Family notes CRUD on event pages (create, edit, pin, delete)
- Backend: Node.js + Express, SQLite, auth, guide API, traditions API
- Compare with India panel (Melbourne vs Delhi side-by-side)
- Calendar .ics export (monthly festival download)
- Share panchang card (canvas PNG, Web Share API / download)
- Weekly digest copy-to-clipboard
- Tauri desktop build
- Frontend builds standalone with Vite (mock data mode)

## What's Next (P2)
1. Voice notes for family traditions
2. Photo attachments for family traditions
3. Family book export (PDF/Markdown)

## Blockers
None.

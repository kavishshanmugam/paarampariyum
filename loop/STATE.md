# State - Parampara

**Last updated:** 2026-10-22

## Current Phase
v1.1 -- South Indian Content Expansion + Regional Inclusivity

User testing revealed content is heavily North Indian biased. Project name is Tamil ("Paarampariyum")
but festivals, names, customs, and terminology all lean Hindi-belt. This phase fixes that.

## What Works (v1.0 baseline)
- Panchang engine: tithi, nakshatra, yoga, karana, sunrise/sunset/moonrise
- Engine validated against Drik Panchang (Melbourne) -- all major festivals match
- 30 engine tests passing, DST handling verified
- 18 festival rules with TimeWindow-aware matching
- 18 content pages with YAML frontmatter + Markdown
- Frontend: Today, Calendar, Guide, Event views (Vite + vanilla JS)
- Backend: Node.js + Express, SQLite, auth, guide AI, traditions, file uploads
- All P0/P1/P2 features complete
- Tauri desktop build: MSI 3.83 MB, NSIS 2.55 MB

## v1.1 Scope
1. Add 7-10 major South Indian festival content pages
2. Add South Indian language names (Tamil, Telugu, Kannada, Malayalam) to all pages
3. Add festival rules to engine for new festivals
4. Update existing content pages to present South Indian perspectives prominently (not as "regional variations")
5. Update guide system prompt and greeting for inclusivity
6. Update frontend content index with new pages

## Known Issues from Testing
- Content reads as North Indian Hindu, not pan-Hindu
- "Chhath Puja" included but no Pongal, Onam, Ugadi, Karthigai Deepam, Thaipusam
- Hindi-only names in YAML frontmatter
- Guide greeting says "Namaste" only -- should include "Vanakkam"
- Makar Sankranti treats Pongal as a footnote, should be its own page

## Blockers
None.

# Parampara

A private Hindu calendar and AI companion app for ~50 people in Melbourne, Australia. Built with Tauri 2 (Rust + web frontend).

## Features

**Panchang Engine (Rust)**
- Tithi, nakshatra, yoga, karana computation using Lahiri ayanamsa
- Sunrise, sunset, moonrise for any location
- Lunar month determination (Amanta/Purnimanta), Adhik Maas detection
- Vikram Samvat and Shaka year numbering
- 18 festival rules with TimeWindow-aware date matching (Sunrise, Pradosh, Midnight, Moonrise, AnyPart)
- Validated against Drik Panchang for Melbourne (Oct 2026 - Apr 2027)

**Frontend (Vite + vanilla JS)**
- Today view with panchang details, upcoming festivals, action buttons
- Calendar view with tithi overlay, festival markers, month navigation
- AI Guide (Claude API when authenticated, local keyword search fallback)
- 18 observance detail pages with Markdown content
- Compare with India (Melbourne vs Delhi side-by-side panchang)
- Share panchang card (Canvas PNG, Web Share API / download)
- Weekly digest copy-to-clipboard
- Calendar .ics export
- Family notes: text, photo attachments, voice recordings
- Family book export (Markdown)
- Magic link auth, guest mode, large-type accessibility

**Backend (Node.js + Express + SQLite)**
- Magic link authentication
- Claude API proxy for AI guide
- Family traditions CRUD with file uploads
- Invite system for controlled access

## Quick Start

```bash
# Engine tests
cargo test --manifest-path engine/Cargo.toml

# Frontend dev (standalone with mock data)
cd frontend && npm install && npm run dev

# Backend
cd backend && npm install && npm start

# Tauri desktop app
cargo tauri dev
```

## Build

```bash
# Desktop installer (MSI + NSIS)
cargo tauri build

# Frontend only
cd frontend && npx vite build
```

## Configuration

- Melbourne coordinates: -37.8136, 144.9631
- Timezone: Australia/Melbourne
- Ayanamsa: Lahiri
- Backend port: 3001 (configurable via `backend/.env`)
- Set `ANTHROPIC_API_KEY` in `backend/.env` for AI guide

## Project Structure

```
engine/          Rust panchang engine crate (standalone)
src-tauri/       Tauri 2 shell, IPC commands
frontend/        Vite + vanilla JS frontend
backend/         Node.js + Express + SQLite
content/pages/   18 Markdown observance pages
loop/            Dev coordination (STATE.md, OPEN_ITEMS.md)
```

## Key Constraints

- All dates come from the deterministic engine, never from AI
- AI guide never speaks as a deity, saint, or guru
- Scripture quoted only from stored corpus, never generated
- No fear, guilt, streaks, or implied misfortune

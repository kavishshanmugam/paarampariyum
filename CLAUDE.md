# Parampara -- Project Instructions

## What This Is
A private Hindu calendar and AI companion app for a small group (~50 people) in Melbourne, Australia.
Built with Tauri 2 (Rust + web frontend). See `hindu_companion_app_research_prd.md` for the full PRD (v1.0, v1.1, v1.2).

## Architecture
- **Frontend:** Svelte, bundled inside Tauri's webview
- **Rust core:** `src-tauri/src/engine/` -- panchang computation library
- **Backend:** Node.js + Express (in `backend/`)
- **Content:** Markdown + YAML frontmatter in `content/`
- **Festival rules:** YAML in `content/rules/`

## Key Constraints (from PRD -- non-negotiable)
- Every date comes from the deterministic engine, never from the AI model
- The AI guide never speaks as a deity, saint, or guru
- Scripture is quoted only from the stored corpus, never generated
- Tradition's reasons and scientific evidence are labelled separately
- No fear, guilt, streaks, or implied misfortune
- Melbourne coordinates: -37.8136, 144.9631, timezone `Australia/Melbourne`
- Lahiri ayanamsa

## Commands
- `cargo tauri dev` -- run the app in dev mode
- `cargo test -p parampara-engine` -- run engine tests
- `cd frontend && npm run dev` -- run frontend dev server
- `cd backend && npm start` -- run backend server

## Development Loop
The `loop/` directory contains autonomous build coordination files.
See `loop/START_HERE.md` for how to launch builder/reviewer agents.

## GitHub
- Remote: https://github.com/kavishshanmugam/paarampariyum.git
- Branch strategy: `main` for stable, feature branches for development

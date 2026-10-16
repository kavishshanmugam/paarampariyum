# Parampara -- Development Plan

v1.0 -- 15 October 2026

Based on PRD v1.2 (Small-Group Edition, Melbourne-focused, Tauri 2)

---

## Architecture Overview

```
parampara/
  src-tauri/           # Rust backend (Tauri core + panchang engine)
    src/
      engine/          # Panchang computation library
        mod.rs         # Engine public API
        astronomy.rs   # Sun/Moon position calculations
        tithi.rs       # Tithi, nakshatra, yoga, karana
        sunrise.rs     # Sunrise/sunset/moonrise for coordinates
        calendar.rs    # Hindu calendar month/year mapping
        festivals.rs   # Festival rule evaluation
        types.rs       # Core data types
      commands.rs      # Tauri IPC commands
      db.rs            # Local SQLite (profiles, cached data)
      main.rs          # Tauri app entry
    rules/             # YAML festival rules (~20 observances)
    content/           # Bundled observance pages (Markdown + frontmatter)
    Cargo.toml
  src/                 # Web frontend (vanilla HTML/CSS/JS or Svelte)
    index.html
    styles/
    scripts/
      app.js           # App shell, routing
      today.js         # Today screen
      calendar.js      # Month view
      event.js         # Event page renderer
      guide.js         # AI guide chat UI
      family.js        # Family notes UI
  backend/             # Small API server (Node.js or Rust)
    server.js          # Auth, guide proxy, sync, flags
    routes/
  content/             # Source content (observance pages, passages)
    pages/             # ~20 observance Markdown files
    passages/          # Scripture passages with references
    rules/             # YAML festival rules (source of truth)
  docs/                # Research, PRD, design docs (not committed)
  loop/                # Dev loop files (builder/reviewer coordination)
```

---

## Technology Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| App framework | Tauri 2 | Rust engine runs natively; one codebase for mobile+desktop; PRD default |
| Frontend | Svelte (lightweight) | Small bundle, fast, good DX with Tauri |
| Panchang engine | Pure Rust with vsop87 crate | Avoids Swiss Ephemeris AGPL complexity; JPL-based |
| Astronomy | vsop87 (planet positions) + meeus algorithms | Well-tested, permissively licensed |
| Local storage | SQLite via rusqlite | Standard, works everywhere |
| Backend | Node.js + Express | Fast to build, matches existing skills |
| Database (server) | SQLite (small scale) | 50 users, no need for Postgres yet |
| AI model | Claude API | Best for nuanced religious content |
| Auth | Magic link (email) | Simple, no passwords |
| Hosting | TBD (Fly.io or similar, Sydney region) | Australian data residency |

---

## Development Phases

### Phase 1: Foundation (Days 1-3)
**Goal: Tauri app running on desktop with basic structure**

- [x] Review PRD and create development plan
- [ ] Initialize Tauri 2 project with Svelte frontend
- [ ] Set up git, connect to GitHub
- [ ] Create CLAUDE.md for the project
- [ ] Set up dev loop files
- [ ] Basic app shell with routing (Today / Calendar / Guide tabs)
- [ ] Verify Devanagari font rendering
- [ ] Set up Rust project structure for engine

**Deliverable:** App opens on desktop, shows placeholder screens

### Phase 2: Panchang Engine (Days 4-10)
**Goal: Accurate astronomical calculations for Melbourne**

- [ ] Implement Sun position calculation (VSOP87 or Meeus)
- [ ] Implement Moon position calculation
- [ ] Calculate sunrise/sunset for any coordinates + timezone
- [ ] Calculate moonrise for coordinates
- [ ] Compute tithi (lunar day) with start/end times
- [ ] Compute nakshatra (lunar mansion)
- [ ] Compute yoga and karana
- [ ] Determine paksha (fortnight) and lunar month
- [ ] Handle amanta/purnimanta month naming
- [ ] Handle Adhik Maas (intercalary month)
- [ ] Implement Lahiri ayanamsa
- [ ] DST handling via chrono-tz
- [ ] Create engine API: get_panchang(date, location, conventions)
- [ ] Unit tests against known values
- [ ] Validate against Drik Panchang for Melbourne (Oct 2026 - Dec 2027)

**Deliverable:** Engine returns correct panchang data for any date/location

### Phase 3: Festival Rules (Days 11-14)
**Goal: Correct festival dates for Melbourne**

- [ ] Design YAML rule format for observances
- [ ] Implement rule evaluator in Rust
- [ ] Write rules for ~20 observances:
  - Diwali sequence (5 days)
  - Chhath
  - Dev Uthani Ekadashi
  - Kartik Purnima
  - Ekadashi (recurring)
  - Pradosh (recurring)
  - Sankashti Chaturthi (recurring)
  - Purnima/Amavasya (recurring)
  - Makar Sankranti
  - Vasant Panchami
  - Maha Shivaratri
  - Holi
  - Chaitra Navratri
  - Ram Navami
- [ ] Handle Smarta vs Vaishnava variants
- [ ] Handle close-call flags (tithi within 15min of window)
- [ ] Generate reason lines for each date
- [ ] Compare-with-India feature
- [ ] Validate all festival dates against Drik Panchang

**Deliverable:** Correct festival dates with reason lines for Melbourne

### Phase 4: Calendar UI (Days 15-20)
**Goal: Full calendar experience in the app**

- [ ] Today screen:
  - Tithi with end time
  - Nakshatra
  - Sunrise and sunset
  - Today's observances
  - Next 7 days preview
- [ ] Month view:
  - Gregorian dates with tithi overlay
  - Paksha and lunar month labels
  - Event markers (color-coded by type)
  - Filter by observance type
- [ ] Year view / 24-month look-ahead
- [ ] Tap event to open event page
- [ ] Compare with India panel
- [ ] Offline support (Service Worker / Tauri offline)
- [ ] Large-type accessibility setting
- [ ] Devanagari font bundled (Noto Sans Devanagari)

**Deliverable:** Fully functional calendar with Today and Month views

### Phase 5: Content & Event Pages (Days 21-26)
**Goal: ~20 reviewed observance pages**

- [ ] Implement observance record schema (JSON/YAML frontmatter + Markdown)
- [ ] Write Diwali sequence pages (5 pages)
- [ ] Write November pages (Chhath, Dev Uthani, Kartik Purnima)
- [ ] Write recurring observance pages (Ekadashi, Pradosh, etc.)
- [ ] Write winter/spring pages (Sankranti, Shivaratri, Holi, etc.)
- [ ] Event page UI:
  - Summary with local timings
  - "In Melbourne" season note
  - Story (short + full)
  - Ten-minute version
  - Why section
  - Research/evidence section with grades
  - Regional variations
  - Exemptions
  - Sources and "reviewed by"
- [ ] Family traditions block (placeholder for Phase 6)
- [ ] Items checklist

**Deliverable:** Complete event pages for all ~20 observances

### Phase 6: Backend & AI Guide (Days 27-35)
**Goal: Working guide and auth system**

- [ ] Backend server (Node.js + Express)
- [ ] Magic link authentication
- [ ] Invite-only access control
- [ ] User profile management
- [ ] AI guide:
  - System prompt with hard rules (no deity voice, grounded answers, etc.)
  - Content retrieval (search over pages)
  - Engine tool (get_dates)
  - get_page and get_passage tools
  - Source citations in responses
  - Flag button for unanswered questions
- [ ] Family notes CRUD API
- [ ] Sync mechanism (app <-> backend)
- [ ] Admin page (flags, invites, notes moderation)

**Deliverable:** Working guide that answers questions from reviewed content

### Phase 7: Family Traditions (Days 36-40)
**Goal: Family notes, voice recordings, photos**

- [ ] Family notes data model
- [ ] Text notes (our way + this year)
- [ ] Voice recording (up to 10 min)
- [ ] Photo attachments
- [ ] Elder prompts on each page
- [ ] Household visibility controls
- [ ] Pinning system
- [ ] Guide uses family notes in answers
- [ ] Family book export (PDF/Markdown)

**Deliverable:** Complete family traditions feature

### Phase 8: Testing & Validation (Days 41-45)
**Goal: Confidence in correctness before group launch**

- [ ] Engine validation: 50+ date comparisons with Drik Panchang
- [ ] DST edge case testing (Oct 4, Apr 4, Oct 3 2027)
- [ ] AI guide test set (100 questions):
  - 60 everyday questions
  - 15 unanswerable questions
  - 25 adversarial (deity voice, invented verses, etc.)
- [ ] Offline mode testing
- [ ] Accessibility testing (200% text scale, screen reader)
- [ ] Cross-device testing
- [ ] Performance testing on older phones

**Deliverable:** Validated, tested app ready for group launch

---

## Milestone Mapping to PRD

| PRD Milestone | Dev Phase | Target |
|---------------|-----------|--------|
| M0 Shell | Phase 1 | App running on desktop |
| M1 Calendar | Phase 2-4 | Engine + Calendar UI |
| M2 Diwali pages | Phase 5 | Event pages with content |
| M3 Guide testing | Phase 6 | AI guide tested |
| M4 Group launch | Phase 7-8 | Full app with family notes |

---

## Key Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Tauri 2 mobile immaturity | Start with desktop; test mobile early at M0 |
| Panchang accuracy | Validate against Drik Panchang systematically |
| Astronomy library quality | Use well-tested vsop87 crate; cross-validate |
| Content quality | Start with Diwali (imminent), expand iteratively |
| Scope creep | Strict Phase 1-8 ordering; out-of-scope list from PRD |

---

## Open Decisions

1. Frontend framework: Svelte vs vanilla JS (leaning Svelte for DX)
2. Astronomy approach: vsop87 crate vs binding Swiss Ephemeris
3. Backend hosting: Fly.io vs Railway vs self-hosted
4. AI model: Claude vs other (Claude preferred for nuance)
5. Mobile testing: When to attempt first mobile build

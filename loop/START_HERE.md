# Parampara - Loop Coordination

## How to Use
This directory coordinates autonomous build sessions. Each session:
1. Read `STATE.md` for current phase and what works
2. Read `OPEN_ITEMS.md` for the prioritized task list
3. Pick the next unchecked P0 item
4. Build it, test it, update all three files
5. Log what you did in `BUILD_LOG.md`

## Agent Roles

### Builder Agent
- Picks next P0 from OPEN_ITEMS.md
- Implements the feature/fix
- Runs tests, verifies build
- Updates STATE.md and BUILD_LOG.md

### Reviewer Agent
- Reads BUILD_LOG.md for latest changes
- Reviews code quality, PRD compliance, and test coverage
- Checks South Indian content for accuracy and cultural sensitivity
- Adds findings to BUILD_LOG.md under a "Review" section
- Updates OPEN_ITEMS.md if new issues found

### Content Reviewer Agent
- Reads new/updated content pages
- Checks: accurate names in all 4 South Indian languages, correct Puranic sources,
  no North Indian bias in defaults, Melbourne-specific shopping/temple info accurate
- Flags any "tradition says you must" language (PRD violation)
- Reports in BUILD_LOG.md

## Launch Commands
```bash
# Run builder (picks next P0 from OPEN_ITEMS.md)
claude "Read loop/STATE.md and loop/OPEN_ITEMS.md. Pick the next unchecked P0 item and implement it. Follow the content page format in content/pages/ for new pages. Run tests after engine changes. Update all loop files when done."

# Run reviewer
claude "Read loop/BUILD_LOG.md for the latest build entry. Review the code changes for quality, PRD compliance, and test coverage. Add review notes to BUILD_LOG.md."

# Run content reviewer
claude "Read all content/pages/*.md files. Check each for: (1) South Indian language names present and accurate, (2) South Indian customs given equal weight to North Indian, (3) No 'you must' language, (4) Puranic sources cited correctly. Report findings in loop/BUILD_LOG.md."
```

## Current Priority Order (v1.1)
1. New South Indian content pages (Pongal, Onam, Ugadi, Navaratri Golu, Karthigai Deepam, Thaipusam, Skanda Shashthi)
2. Add South Indian language names to all existing pages
3. Update existing pages to reduce North Indian bias
4. Engine rules for new festivals
5. Frontend/guide updates for inclusivity
6. Tauri rebuild

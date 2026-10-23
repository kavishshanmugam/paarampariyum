# Open Items

## v1.0 (COMPLETE)
- [x] **P0** Wire Tauri app to use engine crate and verify desktop build
- [x] **P0** Create ~20 observance pages in Markdown + YAML frontmatter
- [x] **P0** Build event page UI renderer
- [x] **P0** Backend server (Node.js): magic link auth, guide API proxy
- [x] **P0** AI guide with system prompt and content retrieval
- [x] **P0** Family traditions CRUD (text notes per observance)
- [x] **P0** Validate engine dates against Drik Panchang for Melbourne Oct 2026 - Apr 2027
- [x] **P0** Fix engine bugs: sunrise JD offset, lunar month mapping, TimeWindow evaluation
- [x] **P1** "Compare with India" side-by-side panel in UI
- [x] **P1** Calendar subscription (.ics) generation
- [x] **P1** Share image for WhatsApp (today's panchang card)
- [x] **P1** Weekly digest copy-to-clipboard feature
- [x] **P1** Rebuild Tauri desktop app with all fixes
- [x] **P2** Voice notes, photo attachments, family book export

## v1.1 -- South Indian Content Overhaul

### Content Pages (new) -- DONE
- [x] **P0** Pongal / Thai Pongal -- 4-day Tamil harvest festival
- [x] **P0** Onam -- Kerala harvest festival
- [x] **P0** Ugadi / Puthandu / Vishu -- South Indian new year festivals
- [x] **P0** Navaratri Golu/Kolu -- South Indian Navaratri with doll display
- [x] **P0** Karthigai Deepam -- Tamil festival of lights
- [x] **P0** Thaipusam -- Murugan festival
- [x] **P0** Skanda Shashthi / Kanda Sashti -- 6-day fast for Murugan
- [x] **P0** Varalakshmi Vratam -- married women's vow to Lakshmi

### Content Removals -- DONE
- [x] Removed: Chhath Puja, Govardhan Puja, Bhai Dooj, Holi, Dev Uthani Ekadashi, Vasant Panchami, Dhanteras, Makar Sankranti

### Existing Content Updates -- DONE
- [x] **P0** Add Tamil/Telugu/Kannada/Malayalam names to ALL existing page frontmatter
- [x] **P0** Replace Makar Sankranti with Pongal page
- [x] **P0** Rewrite Deepavali: Naraka Chaturdashi as primary, Lakshmi Puja secondary
- [x] **P0** Rename Ganesh Chaturthi -> Vinayagar Chaturthi, Pradosh Vrat -> Pradosham

### Engine -- DONE
- [x] **P0** Replace `name_hi` with `name_ta`, `name_te`, `name_kn`, `name_ml` fields
- [x] **P0** Remove North Indian festival rules (8 removed)
- [x] **P0** Add South Indian festival rules (7 new)
- [x] **P0** All engine tests pass

### Frontend/Guide -- DONE
- [x] **P0** Update guide greeting to "Vanakkam"
- [x] **P0** Update content index with new South Indian pages
- [x] **P0** Update suggestion buttons for South Indian festivals
- [x] **P0** Update AI guide system prompt: South Indian first, Tamil names

### Remaining
- [x] **P1** Add Onam engine rule (SolarNakshatra rule type)
- [x] **P1** Add Aadi Perukku content page and engine rule (SolarOffset rule type)
- [x] **P1** Add Ayyappa Mandala Puja content page and engine rule
- [x] **P1** Update mock data in frontend to include South Indian festivals
- [ ] **P1** Validate new festival dates against Drik Panchang
- [ ] **P1** Rebuild Tauri desktop app with v1.1 content

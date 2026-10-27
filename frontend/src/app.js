/**
 * Parampara - Main Application
 *
 * Handles routing, state management, and coordinates between views.
 * When running inside Tauri, calls the Rust engine via IPC.
 * When running standalone (dev), uses a JS fallback or mock data.
 */

import { renderToday } from './today.js';
import { renderCalendar } from './calendar.js';
import { renderGuide } from './guide.js';
import { renderEventPage } from './event.js';
import { renderAuth } from './auth.js';
import { renderElderWisdom } from './elder.js';
import { getToken, getUser, logout as apiLogout, checkBackend, getAllNotes, listUsers, assignHousehold } from './api.js';

class ParamparaApp {
  constructor() {
    this.currentView = 'today';
    this.isTauri = typeof window.__TAURI__ !== 'undefined';
    this.profile = this.loadProfile();
    this.user = getUser();
    this.backendAvailable = false;
    this.init();
  }

  loadProfile() {
    const saved = localStorage.getItem('parampara-profile');
    if (saved) return JSON.parse(saved);
    return {
      location: { lat: -37.8136, lon: 144.9631, timezone: 'Australia/Melbourne', name: 'Melbourne' },
      monthSystem: 'purnimanta',
      sect: 'smarta',
      referenceCity: null,
      largeType: false,
    };
  }

  saveProfile() {
    localStorage.setItem('parampara-profile', JSON.stringify(this.profile));
  }

  async init() {
    // Check if backend is available
    this.backendAvailable = await checkBackend();

    // If backend is available and no token, show auth screen
    // But allow skipping (guest mode for Tauri or offline use)
    if (this.backendAvailable && !getToken()) {
      renderAuth((user) => {
        this.user = user;
        this.startApp();
      });
      return;
    }

    // Listen for forced logout
    window.addEventListener('parampara-logout', () => {
      this.user = null;
      renderAuth((user) => {
        this.user = user;
        this.startApp();
      });
    });

    this.startApp();
  }

  startApp() {
    // Restore main app UI
    const appEl = document.getElementById('app');
    appEl.innerHTML = `
      <!-- Top bar -->
      <header class="top-bar">
        <h1 class="app-title">Parampara</h1>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="settings-btn" onclick="app.openSearch()" aria-label="Search">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="9" cy="9" r="6"/><path d="M14 14l4 4"/>
            </svg>
          </button>
          ${this.user ? `
            <div class="user-avatar" onclick="app.showSettings()" title="${this.user.name}">${this.user.name.charAt(0).toUpperCase()}</div>
          ` : `
            <button class="settings-btn" onclick="app.showSettings()" aria-label="Settings">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="10" cy="10" r="3"/>
                <path d="M10 1v3M10 16v3M1 10h3M16 10h3M3.5 3.5l2 2M14.5 14.5l2 2M3.5 16.5l2-2M14.5 5.5l2-2"/>
              </svg>
            </button>
          `}
        </div>
      </header>

      <!-- Main content area (swapped by router) -->
      <main id="main-content">
        <div id="view-today" class="view active"></div>
        <div id="view-calendar" class="view"></div>
        <div id="view-guide" class="view"></div>
      </main>

      <!-- Bottom navigation -->
      <nav class="bottom-nav">
        <button class="nav-btn active" data-view="today" onclick="app.navigate('today')">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="5"/>
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
          </svg>
          <span>Today</span>
        </button>
        <button class="nav-btn" data-view="calendar" onclick="app.navigate('calendar')">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <path d="M3 10h18M8 2v4M16 2v4"/>
          </svg>
          <span>Calendar</span>
        </button>
        <button class="nav-btn" data-view="guide" onclick="app.navigate('guide')">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Guide</span>
        </button>
      </nav>
    `;

    // Apply settings
    if (this.profile.largeType) document.body.classList.add('large-type');
    this.applyTheme();

    // Navigate to today view
    this.navigate('today');
  }

  navigate(view) {
    this.currentView = view;

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Show/hide views
    document.querySelectorAll('.view').forEach(el => {
      el.classList.remove('active');
    });
    document.getElementById(`view-${view}`).classList.add('active');

    // Show/hide chat input
    const chatInput = document.querySelector('.chat-input-area');
    if (chatInput) {
      chatInput.classList.toggle('active', view === 'guide');
    }

    // Render the view
    switch (view) {
      case 'today':
        renderToday(this);
        break;
      case 'calendar':
        renderCalendar(this);
        break;
      case 'guide':
        renderGuide(this);
        break;
    }
  }

  /**
   * Call the Rust panchang engine via Tauri IPC, or use fetch fallback.
   */
  async getPanchang(date) {
    if (this.isTauri) {
      const { invoke } = window.__TAURI__.core;
      return invoke('get_panchang', {
        date,
        lat: this.profile.location.lat,
        lon: this.profile.location.lon,
        timezone: this.profile.location.timezone,
        monthSystem: this.profile.monthSystem,
        sect: this.profile.sect,
      });
    }
    // Fallback: use backend API
    const res = await fetch(`/api/panchang?date=${date}&lat=${this.profile.location.lat}&lon=${this.profile.location.lon}&tz=${this.profile.location.timezone}`);
    return res.json();
  }

  async getPanchangRange(start, end) {
    if (this.isTauri) {
      const { invoke } = window.__TAURI__.core;
      return invoke('get_panchang_range', {
        start, end,
        lat: this.profile.location.lat,
        lon: this.profile.location.lon,
        timezone: this.profile.location.timezone,
        monthSystem: this.profile.monthSystem,
        sect: this.profile.sect,
      });
    }
    const res = await fetch(`/api/panchang/range?start=${start}&end=${end}&lat=${this.profile.location.lat}&lon=${this.profile.location.lon}&tz=${this.profile.location.timezone}`);
    return res.json();
  }

  async getFestivals(start, end) {
    if (this.isTauri) {
      const { invoke } = window.__TAURI__.core;
      return invoke('get_festivals', {
        start, end,
        lat: this.profile.location.lat,
        lon: this.profile.location.lon,
        timezone: this.profile.location.timezone,
        monthSystem: this.profile.monthSystem,
        sect: this.profile.sect,
      });
    }
    const res = await fetch(`/api/festivals?start=${start}&end=${end}`);
    return res.json();
  }

  openEventPage(eventId, eventName) {
    this._previousView = this.currentView;
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    const chatInput = document.querySelector('.chat-input-area');
    if (chatInput) chatInput.classList.remove('active');
    renderEventPage(this, eventId, eventName);
  }

  closeEventPage() {
    // Restore the main content views
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div id="view-today" class="view"></div>
      <div id="view-calendar" class="view"></div>
      <div id="view-guide" class="view"></div>
    `;
    this.navigate(this._previousView || 'today');
  }

  askGuideAbout(topic) {
    this._guidePreload = `Tell me about ${topic}`;
    this.closeEventPage();
    this.navigate('guide');
  }

  openElderWisdom() {
    document.querySelector('.settings-modal')?.remove();
    this._previousView = this.currentView;
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    const chatInput = document.querySelector('.chat-input-area');
    if (chatInput) chatInput.classList.remove('active');
    renderElderWisdom(this);
  }

  showSettings() {
    // Remove existing modal
    document.querySelector('.settings-modal')?.remove();

    const modal = document.createElement('div');
    modal.className = 'settings-modal';
    modal.innerHTML = `
      <div class="settings-content">
        <div class="settings-header">
          <h2>Settings</h2>
          <button onclick="this.closest('.settings-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted);">&times;</button>
        </div>

        ${this.user ? `
        <div class="settings-group">
          <label class="settings-label">Signed in as</label>
          <div style="font-size: 14px; color: var(--text);">${this.user.name}</div>
          <div style="font-size: 12px; color: var(--text-secondary);">${this.user.email}</div>
        </div>
        ` : ''}

        <div class="settings-group">
          <label class="settings-label">Location</label>
          <div style="font-size: 14px; color: var(--text-secondary);">
            ${this.profile.location.name} (${this.profile.location.lat.toFixed(4)}, ${this.profile.location.lon.toFixed(4)})
          </div>
        </div>

        <div class="settings-group">
          <label class="settings-label">Month System</label>
          <select id="setting-month-system" class="settings-select">
            <option value="purnimanta" ${this.profile.monthSystem === 'purnimanta' ? 'selected' : ''}>Purnimanta (North India)</option>
            <option value="amanta" ${this.profile.monthSystem === 'amanta' ? 'selected' : ''}>Amanta (South & West India)</option>
          </select>
        </div>

        <div class="settings-group">
          <label class="settings-label">Tradition</label>
          <select id="setting-sect" class="settings-select">
            <option value="smarta" ${this.profile.sect === 'smarta' ? 'selected' : ''}>Smarta (general)</option>
            <option value="vaishnava" ${this.profile.sect === 'vaishnava' ? 'selected' : ''}>Vaishnava</option>
          </select>
        </div>

        <div class="settings-group">
          <label class="settings-label" style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-large-type" ${this.profile.largeType ? 'checked' : ''}>
            Large type
          </label>
        </div>

        <div class="settings-group">
          <label class="settings-label">Appearance</label>
          <select id="setting-theme" class="settings-select">
            <option value="auto" ${(this.profile.theme || 'auto') === 'auto' ? 'selected' : ''}>System default</option>
            <option value="light" ${this.profile.theme === 'light' ? 'selected' : ''}>Light</option>
            <option value="dark" ${this.profile.theme === 'dark' ? 'selected' : ''}>Dark</option>
          </select>
        </div>

        <button class="settings-save-btn" onclick="app.saveSettings()">Save</button>

        <button class="settings-save-btn" style="margin-top:12px; background: var(--text-secondary);" onclick="app.askMyFamily()">Ask My Family (shareable questions)</button>

        ${this.user ? `
        <button class="settings-save-btn" style="margin-top:12px; background: var(--warning, #d69e2e);" onclick="app.openElderWisdom()">Record Elder Wisdom</button>
        <button class="settings-save-btn" style="margin-top:12px; background: var(--recurring);" onclick="app.exportFamilyBook()">Export Family Book</button>
        ${this.user.role === 'admin' ? `
        <button class="settings-save-btn" style="margin-top:12px; background: var(--regional);" onclick="app.openAdminPanel()">Manage Households</button>
        ` : ''}
        <button class="auth-link-btn" style="margin-top:12px; color: var(--error);" onclick="app.handleLogout()">Sign out</button>
        ` : this.backendAvailable ? `
        <button class="auth-link-btn" style="margin-top:12px;" onclick="app.showLogin()">Sign in</button>
        ` : ''}
      </div>
    `;
    document.getElementById('app').appendChild(modal);
  }

  saveSettings() {
    this.profile.monthSystem = document.getElementById('setting-month-system').value;
    this.profile.sect = document.getElementById('setting-sect').value;
    this.profile.largeType = document.getElementById('setting-large-type').checked;
    this.profile.theme = document.getElementById('setting-theme').value;
    this.saveProfile();

    document.body.classList.toggle('large-type', this.profile.largeType);
    this.applyTheme();
    document.querySelector('.settings-modal')?.remove();

    // Re-render current view with new settings
    this.navigate(this.currentView);
  }

  applyTheme() {
    const theme = this.profile.theme || 'auto';
    document.documentElement.classList.remove('dark-mode', 'light-mode');
    if (theme === 'dark') document.documentElement.classList.add('dark-mode');
    else if (theme === 'light') document.documentElement.classList.add('light-mode');
  }

  async handleLogout() {
    document.querySelector('.settings-modal')?.remove();
    await apiLogout();
    this.user = null;
    renderAuth((user) => {
      this.user = user;
      this.startApp();
    });
  }

  showLogin() {
    document.querySelector('.settings-modal')?.remove();
    renderAuth((user) => {
      this.user = user;
      this.startApp();
    });
  }

  async openAdminPanel() {
    document.querySelector('.settings-modal')?.remove();

    const modal = document.createElement('div');
    modal.className = 'settings-modal';
    modal.innerHTML = `
      <div class="settings-content">
        <div class="settings-header">
          <h2>Manage Households</h2>
          <button onclick="this.closest('.settings-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted);">&times;</button>
        </div>
        <div id="admin-panel-content"><div class="loading"><div class="loading-spinner"></div>Loading users...</div></div>
      </div>
    `;
    document.getElementById('app').appendChild(modal);

    try {
      const users = await listUsers();
      const panel = document.getElementById('admin-panel-content');
      if (!panel) return;

      // Group by household
      const households = {};
      const unassigned = [];
      for (const u of users) {
        if (u.household_id) {
          if (!households[u.household_id]) households[u.household_id] = [];
          households[u.household_id].push(u);
        } else {
          unassigned.push(u);
        }
      }

      panel.innerHTML = `
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
          Assign users to households so they can share family notes. Enter a household name (e.g. "Shanmugam Family") for each user.
        </p>
        ${users.map(u => `
          <div class="admin-user-row">
            <div>
              <strong>${u.name}</strong>
              <div style="font-size:12px;color:var(--text-secondary);">${u.email}${u.role === 'admin' ? ' (admin)' : ''}</div>
            </div>
            <input type="text" class="admin-household-input" data-user-id="${u.id}"
              value="${u.household_id || ''}" placeholder="Household name...">
          </div>
        `).join('')}
        <button class="settings-save-btn" style="margin-top:12px;" onclick="app.saveHouseholds()">Save Households</button>
      `;
    } catch (err) {
      const panel = document.getElementById('admin-panel-content');
      if (panel) panel.innerHTML = `<p style="color:var(--error);">Failed to load users: ${err.message}</p>`;
    }
  }

  async saveHouseholds() {
    const inputs = document.querySelectorAll('.admin-household-input');
    let saved = 0;
    for (const input of inputs) {
      const userId = input.dataset.userId;
      const householdId = input.value.trim();
      if (householdId) {
        try {
          await assignHousehold(userId, householdId);
          saved++;
        } catch { /* skip errors */ }
      }
    }
    alert(`Saved ${saved} household assignments.`);
  }

  async exportFamilyBook() {
    document.querySelector('.settings-modal')?.remove();
    try {
      const notes = await getAllNotes();
      if (!notes || notes.length === 0) {
        alert('No family notes to export yet. Add some notes on observance pages first!');
        return;
      }

      // Group by observance
      const grouped = {};
      for (const note of notes) {
        if (!grouped[note.observance_id]) grouped[note.observance_id] = [];
        grouped[note.observance_id].push(note);
      }

      const lines = [
        `# Our Family Traditions`,
        ``,
        `*Exported from Parampara on ${this.formatDate(this.today())}*`,
        ``,
        `---`,
        ``,
      ];

      for (const [observanceId, observanceNotes] of Object.entries(grouped)) {
        // Format observance name from ID
        const name = observanceId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        lines.push(`## ${name}`);
        lines.push(``);

        // Split by scope
        const ourWay = observanceNotes.filter(n => !n.scope || n.scope === 'our_way');
        const thisYear = observanceNotes.filter(n => n.scope === 'this_year');

        if (ourWay.length > 0) {
          lines.push(`### Our Way`);
          lines.push(``);
          for (const note of ourWay) {
            const date = new Date(note.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
            const author = note.author_name ? `${note.author_name}, ` : '';
            if (note.note_type === 'text') {
              lines.push(`${note.content}`);
              lines.push(``);
              lines.push(`*-- ${author}${date}${note.pinned ? ' (pinned)' : ''}*`);
            } else if (note.note_type === 'photo') {
              lines.push(`[Photo: ${note.content}]`);
              lines.push(`*-- ${author}${date}*`);
            } else if (note.note_type === 'voice') {
              lines.push(`[Voice note: ${note.content}]`);
              lines.push(`*-- ${author}${date}*`);
            }
            lines.push(``);
          }
        }

        if (thisYear.length > 0) {
          lines.push(`### This Year`);
          lines.push(``);
          for (const note of thisYear) {
            const date = new Date(note.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
            const year = note.occurrence_year ? `(${note.occurrence_year}) ` : '';
            if (note.note_type === 'text') {
              lines.push(`${year}${note.content}`);
            } else {
              lines.push(`${year}[${note.note_type}: ${note.content}]`);
            }
            lines.push(`*-- ${date}*`);
            lines.push(``);
          }
        }
        lines.push(`---`);
        lines.push(``);
      }

      lines.push(`*Generated by Parampara - Melbourne Hindu Calendar*`);

      const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `family-traditions-${this.today()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Could not export: ' + err.message);
    }
  }

  openSearch() {
    document.querySelector('.search-overlay')?.remove();
    const pageIds = [
      'naraka-chaturdashi', 'diwali-lakshmi-puja', 'ekadashi', 'pradosh-vrat',
      'sankashti-chaturthi', 'purnima', 'amavasya', 'maha-shivaratri', 'ram-navami',
      'ganesh-chaturthi', 'pongal', 'onam', 'ugadi', 'navaratri-golu',
      'karthigai-deepam', 'thaipusam', 'skanda-shashthi', 'varalakshmi-vratam',
      'aadi-perukku', 'ayyappa-mandalam',
    ];

    const overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.innerHTML = `
      <div class="search-box">
        <input type="text" class="search-input" placeholder="Search festivals, traditions..." autofocus id="search-input">
        <button onclick="document.querySelector('.search-overlay').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text-muted);padding:8px;">&times;</button>
      </div>
      <div class="search-results" id="search-results">
        <div style="color:var(--text-muted);font-size:13px;padding:12px;">Type to search across all observance pages...</div>
      </div>
    `;
    document.getElementById('app').appendChild(overlay);

    // Build a simple search index from page IDs and names
    const nameMap = {
      'naraka-chaturdashi': 'Deepavali (Naraka Chaturdashi)',
      'diwali-lakshmi-puja': 'Deepavali Lakshmi Puja',
      'ekadashi': 'Ekadashi', 'pradosh-vrat': 'Pradosham',
      'sankashti-chaturthi': 'Sankashti Chaturthi',
      'purnima': 'Purnima', 'amavasya': 'Amavasya',
      'maha-shivaratri': 'Maha Shivaratri', 'ram-navami': 'Sri Rama Navami',
      'ganesh-chaturthi': 'Vinayagar Chaturthi', 'pongal': 'Pongal',
      'onam': 'Onam', 'ugadi': 'Ugadi / Puthandu / Vishu',
      'navaratri-golu': 'Navaratri Golu', 'karthigai-deepam': 'Karthigai Deepam',
      'thaipusam': 'Thaipusam', 'skanda-shashthi': 'Skanda Shashthi',
      'varalakshmi-vratam': 'Varalakshmi Vratam',
      'aadi-perukku': 'Aadi Perukku', 'ayyappa-mandalam': 'Ayyappa Mandalam',
    };

    const input = overlay.querySelector('#search-input');
    const resultsEl = overlay.querySelector('#search-results');

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) {
        resultsEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:12px;">Type to search...</div>';
        return;
      }
      const matches = pageIds.filter(id => {
        const name = (nameMap[id] || id).toLowerCase();
        return name.includes(q) || id.includes(q);
      });
      if (matches.length === 0) {
        resultsEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:12px;">No matches. Try the Guide for questions.</div>';
        return;
      }
      resultsEl.innerHTML = matches.map(id => `
        <div class="search-result-item" onclick="app.openEventPage('${id}', '${(nameMap[id] || id).replace(/'/g, "\\'")}'); document.querySelector('.search-overlay')?.remove();">
          <div class="festival-dot ${id.includes('ekadashi') || id.includes('pradosh') || id.includes('purnima') || id.includes('amavasya') || id.includes('sankashti') ? 'recurring' : 'major'}"></div>
          <span>${nameMap[id] || id}</span>
        </div>
      `).join('');
    });

    // Close on Escape
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') overlay.remove();
    });
    // Close on click outside
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  askMyFamily() {
    document.querySelector('.settings-modal')?.remove();
    const questions = [
      "Which tradition or sampradaya does our family follow? (Smarta, Vaishnava, Shaiva, etc.)",
      "What festivals does our family observe regularly? Are there any we keep that others might not?",
      "How does our family break the Ekadashi fast? Is there a specific time or food?",
      "Are there any family deities (kula deivam) or temple connections we should know about?",
      "What special recipes does our family make for festivals? (Pongal, Deepavali, Navaratri, etc.)",
      "Are there any customs unique to our family -- things Paatti or Thatha always insisted on?",
      "Which observances do the women in our family keep? Are there any the men keep separately?",
      "Does our family follow any regional variations different from the 'standard' Tamil practice?",
    ];

    const text = `Questions to Ask My Family\n\n` +
      `These questions will help us record our family's unique traditions in Parampara.\n` +
      `Share this list with elders or family members.\n\n` +
      questions.map((q, i) => `${i + 1}. ${q}`).join('\n\n') +
      `\n\n---\nGenerated by Parampara - Melbourne Hindu Calendar`;

    // Try Web Share API, fallback to copy
    if (navigator.share) {
      navigator.share({ title: 'Questions to Ask My Family', text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        alert('Questions copied to clipboard! Share them with your family.');
      }).catch(() => {
        // Final fallback: download as text
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ask-my-family.txt';
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  }

  /**
   * Format a date string as "Wednesday, 15 October 2026"
   */
  formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  /**
   * Get today's date in YYYY-MM-DD format
   */
  today() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
}

// Initialize the app
const app = new ParamparaApp();
window.app = app;

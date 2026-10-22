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
import { getToken, getUser, logout as apiLogout, checkBackend, getAllNotes } from './api.js';

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
        <div class="user-badge">
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

    // Apply large type setting
    if (this.profile.largeType) {
      document.body.classList.add('large-type');
    }

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

        <button class="settings-save-btn" onclick="app.saveSettings()">Save</button>

        ${this.user ? `
        <button class="settings-save-btn" style="margin-top:12px; background: var(--recurring);" onclick="app.exportFamilyBook()">Export Family Book</button>
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
    this.saveProfile();

    document.body.classList.toggle('large-type', this.profile.largeType);
    document.querySelector('.settings-modal')?.remove();

    // Re-render current view with new settings
    this.navigate(this.currentView);
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

        for (const note of observanceNotes) {
          const date = new Date(note.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
          if (note.note_type === 'text') {
            lines.push(`${note.content}`);
            lines.push(``);
            lines.push(`*-- ${date}${note.pinned ? ' (pinned)' : ''}*`);
          } else if (note.note_type === 'photo') {
            lines.push(`[Photo: ${note.content}]`);
            lines.push(`*-- ${date}*`);
          } else if (note.note_type === 'voice') {
            lines.push(`[Voice note: ${note.content}]`);
            lines.push(`*-- ${date}*`);
          }
          lines.push(``);
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

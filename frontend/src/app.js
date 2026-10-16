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

class ParamparaApp {
  constructor() {
    this.currentView = 'today';
    this.isTauri = typeof window.__TAURI__ !== 'undefined';
    this.profile = this.loadProfile();
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

/**
 * Today View - Shows current panchang data and upcoming observances.
 *
 * PRD requirements: CAL-3
 * - Tithi with end time
 * - Nakshatra
 * - Sunrise and sunset
 * - Today's observances
 * - Next 7 days preview
 */

export async function renderToday(app) {
  const container = document.getElementById('view-today');
  container.innerHTML = `<div class="loading"><div class="loading-spinner"></div>Loading panchang...</div>`;

  try {
    const today = app.today();
    const weekEnd = addDays(today, 7);

    // Fetch today's panchang and upcoming festivals in parallel
    let panchang, festivals;

    if (app.isTauri) {
      [panchang, festivals] = await Promise.all([
        app.getPanchang(today),
        app.getFestivals(today, weekEnd),
      ]);
    } else {
      // Mock data for standalone development
      panchang = mockPanchang(today);
      festivals = mockFestivals(today);
    }

    container.innerHTML = renderTodayContent(app, today, panchang, festivals);
  } catch (err) {
    container.innerHTML = `
      <div class="info-card">
        <h3>Error</h3>
        <p style="color: var(--error);">${err.message || 'Failed to load panchang data'}</p>
        <p style="color: var(--text-secondary); margin-top: 8px;">
          If running outside Tauri, the engine is not available. This is expected in browser-only mode.
        </p>
      </div>
    `;
  }
}

function renderTodayContent(app, today, panchang, festivals) {
  const todayFestivals = festivals.filter(f => f.date === today);
  const upcomingFestivals = festivals.filter(f => f.date > today);

  return `
    <!-- Today Header -->
    <div class="today-header">
      <div class="today-date">${app.formatDate(today)}</div>
      <div class="today-tithi">${panchang.tithi?.name || 'Loading...'}</div>
      <div class="today-paksha">${panchang.paksha || ''} Paksha &middot; ${panchang.lunar_month?.month || ''}</div>
    </div>

    <!-- Panchang Details -->
    <div class="info-card">
      <h3>Panchang</h3>
      <div class="info-row">
        <span class="info-label">Tithi</span>
        <span class="info-value">${panchang.tithi?.name || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Nakshatra</span>
        <span class="info-value">${panchang.nakshatra?.name || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Yoga</span>
        <span class="info-value">${panchang.yoga?.name || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Karana</span>
        <span class="info-value">${panchang.karana?.name || '-'}</span>
      </div>
    </div>

    <!-- Sun & Moon Times -->
    <div class="info-card">
      <h3>Sun &amp; Moon</h3>
      <div class="info-row">
        <span class="info-label">Sunrise</span>
        <span class="info-value">${formatTime(panchang.sunrise)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Sunset</span>
        <span class="info-value">${formatTime(panchang.sunset)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Moonrise</span>
        <span class="info-value">${formatTime(panchang.moonrise)}</span>
      </div>
    </div>

    <!-- Lunar Calendar Info -->
    <div class="info-card">
      <h3>Calendar</h3>
      <div class="info-row">
        <span class="info-label">Lunar Month</span>
        <span class="info-value">${panchang.lunar_month?.month || '-'}${panchang.lunar_month?.is_adhik ? ' (Adhik)' : ''}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Vikram Samvat</span>
        <span class="info-value">${panchang.lunar_month?.year_vikram || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Shaka</span>
        <span class="info-value">${panchang.lunar_month?.year_shaka || '-'}</span>
      </div>
    </div>

    <!-- Today's Observances -->
    ${todayFestivals.length > 0 ? `
    <div class="info-card">
      <h3>Today</h3>
      ${todayFestivals.map(f => `
        <div class="festival-item clickable" onclick="app.openEventPage('${f.rule_id}', '${f.name.replace(/'/g, "\\'")}')">
          <div class="festival-dot ${getFestivalDotClass(f.festival_type)}"></div>
          <div>
            <div class="festival-name">${f.name}</div>
            <div class="festival-reason">${f.reason}</div>
            ${f.variant_note ? `<div class="festival-reason" style="font-style: italic;">${f.variant_note}</div>` : ''}
          </div>
          <svg class="festival-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Coming This Week -->
    ${upcomingFestivals.length > 0 ? `
    <div class="info-card">
      <h3>Coming This Week</h3>
      ${upcomingFestivals.map(f => `
        <div class="festival-item clickable" onclick="app.openEventPage('${f.rule_id}', '${f.name.replace(/'/g, "\\'")}')">
          <div class="festival-dot ${getFestivalDotClass(f.festival_type)}"></div>
          <div>
            <div class="festival-name">${f.name}</div>
            <div class="festival-date">${app.formatDate(f.date)}</div>
            <div class="festival-reason">${f.reason}</div>
          </div>
          <svg class="festival-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>
        </div>
      `).join('')}
    </div>
    ` : `
    <div class="info-card">
      <h3>Coming This Week</h3>
      <p style="color: var(--text-muted); font-size: 14px;">No observances in the next 7 days.</p>
    </div>
    `}
  `;
}

function formatTime(hours) {
  if (hours == null) return '-';
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getFestivalDotClass(type) {
  if (typeof type === 'string') {
    if (type.includes('Major')) return 'major';
    if (type.includes('Solar')) return 'solar';
    return 'recurring';
  }
  return 'recurring';
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// Mock data for browser-only development
function mockPanchang(date) {
  return {
    date,
    sunrise: 6.33,
    sunset: 19.35,
    moonrise: 14.5,
    tithi: { name: 'Ashtami', tithi_number: 8 },
    nakshatra: { name: 'Pushya', index: 7 },
    yoga: { name: 'Shobhana', index: 4 },
    karana: { name: 'Balava', index: 5 },
    paksha: 'Krishna',
    lunar_month: { month: 'Ashvina', is_adhik: false, year_vikram: 2083, year_shaka: 1948 },
    weekday: 'Wed',
  };
}

function mockFestivals(today) {
  return [
    {
      rule_id: 'ekadashi',
      name: 'Ekadashi',
      date: addDays(today, 2),
      festival_type: 'RecurringFortnightly',
      reason: 'Ekadashi of Ashvina -- a fasting day sacred to Vishnu',
      variant_note: 'Vaishnavas may observe on the next day if Dashami touches sunrise',
    },
    {
      rule_id: 'pradosh-vrat',
      name: 'Pradosh Vrat',
      date: addDays(today, 4),
      festival_type: 'RecurringFortnightly',
      reason: 'Trayodashi at dusk in Ashvina -- evening worship of Shiva',
      variant_note: null,
    },
    {
      rule_id: 'dhanteras',
      name: 'Dhanteras',
      date: addDays(today, 22),
      festival_type: 'MajorFestival',
      reason: 'Trayodashi of Krishna Paksha in Ashvina -- Dhanteras, honouring Dhanvantari',
      variant_note: null,
    },
    {
      rule_id: 'diwali-lakshmi-puja',
      name: 'Diwali (Lakshmi Puja)',
      date: addDays(today, 24),
      festival_type: 'MajorFestival',
      reason: 'Amavasya in Ashvina -- the new-moon night of Kartika',
      variant_note: null,
    },
  ];
}

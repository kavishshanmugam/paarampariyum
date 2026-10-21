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

    <!-- Action Buttons -->
    <div class="today-actions">
      <button class="today-action-btn" onclick="window._copyWeeklyDigest()">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M2 11V2h9"/></svg>
        Copy weekly digest
      </button>
      <button class="today-action-btn" onclick="window._sharePanchangCard()">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 8v5h8V8M8 2v8M5 5l3-3 3 3"/></svg>
        Share today's panchang
      </button>
    </div>
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

// === Weekly Digest ===
// ponytail: clipboard API, no libraries needed
window._copyWeeklyDigest = async function() {
  const btn = document.querySelector('.today-action-btn');
  try {
    const app = window.app;
    const today = app.today();
    const weekEnd = addDays(today, 7);

    let panchang, festivals;
    if (app.isTauri) {
      [panchang, festivals] = await Promise.all([
        app.getPanchang(today),
        app.getFestivals(today, weekEnd),
      ]);
    } else {
      panchang = mockPanchang(today);
      festivals = mockFestivals(today);
    }

    const lines = [
      `Parampara - Weekly Digest`,
      `${app.formatDate(today)}`,
      ``,
      `Today's Panchang:`,
      `  Tithi: ${panchang.tithi?.name || '-'}`,
      `  Nakshatra: ${panchang.nakshatra?.name || '-'}`,
      `  Sunrise: ${formatTime(panchang.sunrise)} | Sunset: ${formatTime(panchang.sunset)}`,
      `  ${panchang.lunar_month?.month || ''} ${panchang.paksha || ''} Paksha`,
      ``,
    ];

    if (festivals.length > 0) {
      lines.push(`This Week:`);
      for (const f of festivals) {
        const d = new Date(f.date + 'T00:00:00');
        const dayName = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
        lines.push(`  ${dayName} - ${f.name}`);
      }
    } else {
      lines.push(`No observances this week.`);
    }

    await navigator.clipboard.writeText(lines.join('\n'));
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8l3 3 5-6"/></svg> Copied!';
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    }
  } catch (e) {
    console.error('Failed to copy digest:', e);
  }
};

// === Share Panchang Card ===
// ponytail: canvas API, no html2canvas needed
window._sharePanchangCard = async function() {
  try {
    const app = window.app;
    const today = app.today();

    let panchang, festivals;
    if (app.isTauri) {
      [panchang, festivals] = await Promise.all([
        app.getPanchang(today),
        app.getFestivals(today, addDays(today, 1)),
      ]);
    } else {
      panchang = mockPanchang(today);
      festivals = mockFestivals(today).filter(f => f.date === today);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#fffaf5';
    ctx.fillRect(0, 0, 600, 400);

    // Saffron accent bar
    ctx.fillStyle = '#c05621';
    ctx.fillRect(0, 0, 600, 6);

    // Title
    ctx.fillStyle = '#c05621';
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('Parampara', 30, 44);

    // Date
    ctx.fillStyle = '#718096';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(app.formatDate(today), 30, 68);

    // Tithi (large)
    ctx.fillStyle = '#2d3748';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(panchang.tithi?.name || '-', 30, 116);

    // Paksha + Month
    ctx.fillStyle = '#718096';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`${panchang.paksha || ''} Paksha  |  ${panchang.lunar_month?.month || ''}`, 30, 140);

    // Divider
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(30, 158);
    ctx.lineTo(570, 158);
    ctx.stroke();

    // Panchang details
    ctx.fillStyle = '#2d3748';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const details = [
      ['Nakshatra', panchang.nakshatra?.name || '-'],
      ['Yoga', panchang.yoga?.name || '-'],
      ['Karana', panchang.karana?.name || '-'],
      ['Sunrise', formatTime(panchang.sunrise)],
      ['Sunset', formatTime(panchang.sunset)],
    ];
    let y = 184;
    for (const [label, value] of details) {
      ctx.fillStyle = '#718096';
      ctx.fillText(label, 30, y);
      ctx.fillStyle = '#2d3748';
      ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(value, 160, y);
      ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      y += 28;
    }

    // Today's festivals
    const todayFestivals = festivals.filter(f => f.date === today);
    if (todayFestivals.length > 0) {
      y += 8;
      ctx.fillStyle = '#c05621';
      ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText('Today: ' + todayFestivals.map(f => f.name).join(', '), 30, y);
    }

    // Footer
    ctx.fillStyle = '#a0aec0';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('Melbourne  |  Lahiri Ayanamsa', 30, 384);

    // Download or share
    canvas.toBlob(async (blob) => {
      if (navigator.share && navigator.canShare?.({ files: [new File([blob], 'panchang.png', { type: 'image/png' })] })) {
        try {
          await navigator.share({
            files: [new File([blob], 'panchang.png', { type: 'image/png' })],
            title: 'Today\'s Panchang',
          });
          return;
        } catch { /* user cancelled or share failed, fall through to download */ }
      }
      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `panchang-${today}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  } catch (e) {
    console.error('Failed to create panchang card:', e);
  }
};

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

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
    const monthEnd = addDays(today, 30);

    // Fetch today's panchang and upcoming festivals in parallel
    let panchang, festivals, monthFestivals;

    if (app.isTauri) {
      [panchang, festivals, monthFestivals] = await Promise.all([
        app.getPanchang(today),
        app.getFestivals(today, weekEnd),
        app.getFestivals(addDays(today, 8), monthEnd),
      ]);
    } else {
      panchang = mockPanchang(today);
      festivals = mockFestivals(today);
      monthFestivals = [];
    }

    container.innerHTML = renderTodayContent(app, today, panchang, festivals, monthFestivals);
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

function renderTodayContent(app, today, panchang, festivals, monthFestivals) {
  const todayFestivals = festivals.filter(f => f.date === today);
  const tomorrowStr = addDays(today, 1);
  const tomorrowFestivals = festivals.filter(f => f.date === tomorrowStr && f.festival_type?.includes('Major'));
  const upcomingFestivals = festivals.filter(f => f.date > today && app.isFollowed(f.rule_id));
  // Major festivals in the next 30 days (beyond this week)
  const upcomingMajor = (monthFestivals || []).filter(f =>
    app.isFollowed(f.rule_id) && f.festival_type?.includes('Major')
  );

  // Festival alert banner for major festivals today or tomorrow
  const alertBanner = todayFestivals.some(f => f.festival_type?.includes('Major'))
    ? `<div class="festival-alert-banner">
        <span class="festival-alert-icon">🪔</span>
        <span>${todayFestivals.filter(f => f.festival_type?.includes('Major')).map(f => f.name).join(' & ')} today!</span>
      </div>`
    : tomorrowFestivals.length > 0
    ? `<div class="festival-alert-banner tomorrow">
        <span class="festival-alert-icon">🔔</span>
        <span>${tomorrowFestivals.map(f => f.name).join(' & ')} tomorrow!</span>
      </div>`
    : '';

  return `
    ${alertBanner}
    <!-- Today Header -->
    <div class="today-header">
      <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
        <div class="moon-phase">${moonPhaseHtml(panchang)}</div>
        <div>
          <div class="today-tithi">${panchang.tithi?.name || 'Loading...'}</div>
          <div class="today-paksha">${panchang.paksha || ''} Paksha &middot; ${panchang.lunar_month?.month || ''}</div>
        </div>
      </div>
      <div class="today-date">${app.formatDate(today)}</div>
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

    <!-- Inauspicious Periods -->
    ${panchang.inauspicious?.rahu_kalam ? `
    <div class="info-card">
      <h3>Inauspicious Periods</h3>
      <div class="info-row">
        <span class="info-label" style="color:var(--error);">Rahu Kalam</span>
        <span class="info-value">${formatTime(panchang.inauspicious.rahu_kalam.start)} - ${formatTime(panchang.inauspicious.rahu_kalam.end)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Yamagandam</span>
        <span class="info-value">${formatTime(panchang.inauspicious.yamagandam?.start)} - ${formatTime(panchang.inauspicious.yamagandam?.end)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Gulika Kalam</span>
        <span class="info-value">${formatTime(panchang.inauspicious.gulika_kalam?.start)} - ${formatTime(panchang.inauspicious.gulika_kalam?.end)}</span>
      </div>
    </div>
    ` : ''}

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
            <div class="festival-name">${f.name}${f.close_call ? ' <span class="close-call-badge" title="' + (f.close_call_note || 'Tithi boundary is very close to the time window') + '">close call</span>' : ''}</div>
            <div class="festival-reason">${f.reason}</div>
            ${f.close_call_note ? `<div class="festival-reason close-call-text">${f.close_call_note}</div>` : ''}
            ${f.variant_note ? `<div class="festival-reason" style="font-style: italic;">${f.variant_note}</div>` : ''}
          </div>
          <svg class="festival-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Compare with India -->
    <div class="info-card">
      <h3>Compare with India</h3>
      <div id="compare-panel">
        <button class="today-action-btn" onclick="window._loadCompare()" style="width:100%">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="5" cy="8" r="3.5"/><circle cx="11" cy="8" r="3.5"/></svg>
          Show Delhi panchang for today
        </button>
      </div>
    </div>

    <!-- Coming This Week -->
    ${upcomingFestivals.length > 0 ? `
    <div class="info-card">
      <h3>Coming This Week</h3>
      ${upcomingFestivals.map(f => `
        <div class="festival-item clickable" onclick="app.openEventPage('${f.rule_id}', '${f.name.replace(/'/g, "\\'")}')">
          <div class="festival-dot ${getFestivalDotClass(f.festival_type)}"></div>
          <div>
            <div class="festival-name">${f.name}${f.close_call ? ' <span class="close-call-badge">close call</span>' : ''}</div>
            <div class="festival-date">${app.formatDate(f.date)}</div>
            <div class="festival-reason">${f.reason}</div>
            ${f.close_call_note ? `<div class="festival-reason close-call-text">${f.close_call_note}</div>` : ''}
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

    <!-- Coming This Month (major only) -->
    ${upcomingMajor.length > 0 ? `
    <div class="info-card">
      <h3>Coming This Month</h3>
      ${upcomingMajor.map(f => {
        const daysAway = Math.round((new Date(f.date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
        return `
        <div class="festival-item clickable" onclick="app.openEventPage('${f.rule_id}', '${f.name.replace(/'/g, "\\'")}')">
          <div class="festival-dot ${getFestivalDotClass(f.festival_type)}"></div>
          <div>
            <div class="festival-name">${f.name}</div>
            <div class="festival-date">${app.formatDate(f.date)} <span style="color:var(--primary);font-size:11px;font-weight:600;">${daysAway}d</span></div>
          </div>
          <svg class="festival-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>
        </div>`;
      }).join('')}
    </div>
    ` : ''}

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
      <button class="today-action-btn" onclick="window.print()">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="6" width="10" height="7" rx="1"/><path d="M5 6V3h6v3"/><circle cx="11" cy="8.5" r="0.5" fill="currentColor"/></svg>
        Print panchang
      </button>
    </div>
    <div class="print-footer">Parampara &middot; Melbourne &middot; Lahiri Ayanamsa</div>
  `;
}

// ponytail: CSS-only moon phase, no canvas/SVG lib
function moonPhaseHtml(panchang) {
  const tithiNum = panchang.tithi?.tithi_number || 8;
  const isShukla = panchang.paksha === 'Shukla';
  // Tithi 1-15 in shukla (waxing), 1-15 in krishna (waning)
  // Map to illumination percentage 0-100
  let illum;
  if (isShukla) {
    illum = Math.round((tithiNum / 15) * 100);
  } else {
    illum = Math.round(((15 - tithiNum) / 15) * 100);
  }
  // Simple emoji moon based on phase
  const phases = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  let idx;
  if (illum <= 5) idx = 0;
  else if (illum <= 20) idx = isShukla ? 1 : 7;
  else if (illum <= 40) idx = isShukla ? 2 : 6;
  else if (illum <= 60) idx = isShukla ? 3 : 5;
  else if (illum <= 80) idx = isShukla ? 3 : 5;
  else if (illum < 95) idx = isShukla ? 4 : 4;
  else idx = 4;
  return `<span style="font-size:32px;line-height:1;">${phases[idx]}</span>`;
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

// === Compare with India ===
// ponytail: reuses existing compare_locations IPC, mock for non-Tauri
window._loadCompare = async function() {
  const panel = document.getElementById('compare-panel');
  if (!panel) return;
  panel.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';

  try {
    const app = window.app;
    const today = app.today();
    const mel = app.profile.location;

    let melbournePanchang, delhiPanchang, explanation;

    if (app.isTauri) {
      const { invoke } = window.__TAURI__.core;
      const result = await invoke('compare_locations', {
        date: today,
        lat1: mel.lat, lon1: mel.lon, tz1: mel.timezone, name1: 'Melbourne',
        lat2: 28.6139, lon2: 77.2090, tz2: 'Asia/Kolkata', name2: 'Delhi',
      });
      melbournePanchang = result.location1.panchang;
      delhiPanchang = result.location2.panchang;
      explanation = result.explanation;
    } else {
      // Mock: same tithi most days, show slight time difference
      melbournePanchang = mockPanchang(today);
      delhiPanchang = { ...mockPanchang(today), sunrise: 6.15, sunset: 17.88 };
      explanation = 'Both Melbourne and Delhi have the same tithi today.';
    }

    const diffTithi = melbournePanchang.tithi?.name !== delhiPanchang.tithi?.name;

    panel.innerHTML = `
      <div class="compare-panel">
        <div class="compare-col">
          <h4>Melbourne</h4>
          <div class="info-row"><span class="info-label">Tithi</span><span class="info-value ${diffTithi ? 'compare-diff' : ''}">${melbournePanchang.tithi?.name || '-'}</span></div>
          <div class="info-row"><span class="info-label">Nakshatra</span><span class="info-value">${melbournePanchang.nakshatra?.name || '-'}</span></div>
          <div class="info-row"><span class="info-label">Sunrise</span><span class="info-value">${formatTime(melbournePanchang.sunrise)}</span></div>
          <div class="info-row"><span class="info-label">Sunset</span><span class="info-value">${formatTime(melbournePanchang.sunset)}</span></div>
        </div>
        <div class="compare-col">
          <h4>Delhi</h4>
          <div class="info-row"><span class="info-label">Tithi</span><span class="info-value ${diffTithi ? 'compare-diff' : ''}">${delhiPanchang.tithi?.name || '-'}</span></div>
          <div class="info-row"><span class="info-label">Nakshatra</span><span class="info-value">${delhiPanchang.nakshatra?.name || '-'}</span></div>
          <div class="info-row"><span class="info-label">Sunrise</span><span class="info-value">${formatTime(delhiPanchang.sunrise)}</span></div>
          <div class="info-row"><span class="info-label">Sunset</span><span class="info-value">${formatTime(delhiPanchang.sunset)}</span></div>
        </div>
        <div class="compare-note">${explanation}</div>
      </div>
    `;
  } catch (e) {
    panel.innerHTML = `<p style="color:var(--error);font-size:13px;">${e.message || 'Failed to load comparison'}</p>`;
  }
};

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

    if (panchang.inauspicious?.rahu_kalam) {
      lines.push(`Inauspicious Periods:`);
      lines.push(`  Rahu Kalam: ${formatTime(panchang.inauspicious.rahu_kalam.start)} - ${formatTime(panchang.inauspicious.rahu_kalam.end)}`);
      lines.push(`  Yamagandam: ${formatTime(panchang.inauspicious.yamagandam?.start)} - ${formatTime(panchang.inauspicious.yamagandam?.end)}`);
      lines.push(``);
    }

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
    inauspicious: {
      rahu_kalam: { start: 12.0, end: 13.5 },
      yamagandam: { start: 7.5, end: 9.0 },
      gulika_kalam: { start: 9.0, end: 10.5 },
    },
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
      close_call: true,
      close_call_note: 'Close call: the tithi boundary falls within 15 minutes of sunrise',
    },
    {
      rule_id: 'pradosh-vrat',
      name: 'Pradosham',
      date: addDays(today, 4),
      festival_type: 'RecurringFortnightly',
      reason: 'Trayodashi at dusk in Ashvina -- evening worship of Shiva',
      variant_note: null,
      close_call: false,
      close_call_note: null,
    },
    {
      rule_id: 'naraka-chaturdashi',
      name: 'Deepavali',
      date: addDays(today, 22),
      festival_type: 'MajorFestival',
      reason: 'Chaturdashi of Krishna Paksha -- Deepavali; oil bath before dawn',
      variant_note: null,
      close_call: false,
      close_call_note: null,
    },
    {
      rule_id: 'diwali-lakshmi-puja',
      name: 'Deepavali Lakshmi Puja',
      date: addDays(today, 23),
      festival_type: 'MajorFestival',
      reason: 'Amavasya in Ashvina -- Lakshmi Puja with lamps on the new-moon night',
      variant_note: null,
      close_call: false,
      close_call_note: null,
    },
    {
      rule_id: 'pongal',
      name: 'Pongal',
      date: addDays(today, 80),
      festival_type: 'SolarTransit',
      reason: 'Sun enters sidereal Capricorn -- Thai Pongal, Tamil harvest',
      variant_note: null,
      close_call: false,
      close_call_note: null,
    },
    {
      rule_id: 'karthigai-deepam',
      name: 'Karthigai Deepam',
      date: addDays(today, 35),
      festival_type: 'MajorFestival',
      reason: 'Kartika Purnima at dusk -- the Tamil festival of lamps',
      variant_note: null,
      close_call: false,
      close_call_note: null,
    },
  ];
}

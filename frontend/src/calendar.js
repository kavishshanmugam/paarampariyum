/**
 * Calendar View - Month view with tithi overlay and festival markers.
 *
 * PRD requirements: CAL-2
 * - Gregorian date with tithi overlay
 * - Paksha and lunar month labels
 * - Event markers (color-coded by type)
 * - Month navigation
 */

let currentYear, currentMonth;
let yearViewActive = false;
let calendarFilter = 'all'; // all, major, recurring, solar

export async function renderCalendar(app) {
  const container = document.getElementById('view-calendar');

  if (!currentYear) {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth(); // 0-indexed
  }

  container.innerHTML = `<div class="loading"><div class="loading-spinner"></div>Loading calendar...</div>`;

  try {
    if (yearViewActive) {
      await renderYearView(app, container);
      return;
    }

    // Get the first and last day of the displayed month grid
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startOfWeek = new Date(firstDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Start from Sunday
    const endOfWeek = new Date(lastDay);
    endOfWeek.setDate(endOfWeek.getDate() + (6 - endOfWeek.getDay()));

    const startStr = formatDateStr(startOfWeek);
    const endStr = formatDateStr(endOfWeek);

    let panchangData, festivals;

    if (app.isTauri) {
      [panchangData, festivals] = await Promise.all([
        app.getPanchangRange(startStr, endStr),
        app.getFestivals(startStr, endStr),
      ]);
    } else {
      panchangData = mockPanchangRange(startOfWeek, endOfWeek);
      festivals = mockFestivals(currentYear, currentMonth);
    }

    // Build a lookup by date
    const panchangByDate = {};
    for (const p of panchangData) {
      panchangByDate[p.date] = p;
    }

    const festivalsByDate = {};
    for (const f of festivals) {
      if (!festivalsByDate[f.date]) festivalsByDate[f.date] = [];
      festivalsByDate[f.date].push(f);
    }

    container.innerHTML = renderCalendarContent(app, panchangByDate, festivalsByDate, startOfWeek, endOfWeek);

    // Attach day click handlers
    container.querySelectorAll('.calendar-day').forEach(el => {
      el.addEventListener('click', () => {
        const dateStr = el.dataset.date;
        const dayFestivals = festivalsByDate[dateStr] || [];
        const panchang = panchangByDate[dateStr];
        showDayDetail(app, dateStr, panchang, dayFestivals);
      });
    });

    // Attach navigation handlers
    container.querySelector('.cal-prev')?.addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      renderCalendar(app);
    });
    container.querySelector('.cal-next')?.addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      renderCalendar(app);
    });
  } catch (err) {
    container.innerHTML = `
      <div class="info-card">
        <h3>Calendar</h3>
        <p style="color: var(--error);">${err.message || 'Failed to load calendar'}</p>
      </div>
    `;
  }
}

function renderCalendarContent(app, panchangByDate, festivalsByDate, startDate, endDate) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const today = app.today();

  // Find lunar month info for this month
  const midMonthDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-15`;
  const midPanchang = panchangByDate[midMonthDate];
  const lunarInfo = midPanchang?.lunar_month;

  // Generate day cells
  let dayCells = '';
  const d = new Date(startDate);
  while (d <= endDate) {
    const dateStr = formatDateStr(d);
    const panchang = panchangByDate[dateStr];
    const dayFestivals = festivalsByDate[dateStr] || [];
    const isCurrentMonth = d.getMonth() === currentMonth;
    const isToday = dateStr === today;

    let tithiLabel = '';
    if (panchang?.tithi?.name) {
      // Abbreviate tithi name to fit
      const name = panchang.tithi.name;
      tithiLabel = name.length > 6 ? name.slice(0, 5) + '.' : name;
    }

    const festivalDots = dayFestivals.slice(0, 3).map(f => {
      const cls = getFestivalDotClass(f.festival_type);
      return `<div class="day-festival-dot" style="background: var(--${cls === 'major' ? 'major-festival' : cls === 'solar' ? 'solar' : 'recurring'})"></div>`;
    }).join('');

    dayCells += `
      <div class="calendar-day ${isToday ? 'today' : ''} ${!isCurrentMonth ? 'other-month' : ''}"
           data-date="${dateStr}"
           title="${dayFestivals.map(f => f.name).join(', ') || tithiLabel}">
        <div class="day-number">${d.getDate()}</div>
        <div class="day-tithi">${tithiLabel}</div>
        ${festivalDots ? `<div class="day-festivals">${festivalDots}</div>` : ''}
      </div>
    `;

    d.setDate(d.getDate() + 1);
  }

  return `
    <div class="calendar-header">
      <button class="calendar-nav-btn cal-prev">&larr;</button>
      <div>
        <div class="calendar-month-title">${monthNames[currentMonth]} ${currentYear}</div>
        ${lunarInfo ? `<div style="font-size: 12px; color: var(--text-secondary); text-align: center; margin-top: 2px;">
          ${lunarInfo.month}${lunarInfo.is_adhik ? ' (Adhik)' : ''} &middot; VS ${lunarInfo.year_vikram}
        </div>` : ''}
      </div>
      <button class="calendar-nav-btn cal-next">&rarr;</button>
    </div>

    <div style="text-align: center; margin-bottom: 12px; display: flex; gap: 8px; justify-content: center;">
      <button class="cal-export-btn" onclick="window._toggleYearView()">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
        Year View
      </button>
      <button class="cal-export-btn" onclick="window._exportICS()">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8M5 7l3 3 3-3M2 12v2h12v-2"/></svg>
        Export .ics
      </button>
    </div>

    <div class="cal-filter-chips">
      <button class="cal-filter-chip ${calendarFilter === 'all' ? 'active' : ''}" onclick="window._calFilter('all')">All</button>
      <button class="cal-filter-chip ${calendarFilter === 'major' ? 'active' : ''}" onclick="window._calFilter('major')">
        <span class="cal-chip-dot" style="background:var(--major-festival)"></span>Major
      </button>
      <button class="cal-filter-chip ${calendarFilter === 'recurring' ? 'active' : ''}" onclick="window._calFilter('recurring')">
        <span class="cal-chip-dot" style="background:var(--recurring)"></span>Monthly
      </button>
      <button class="cal-filter-chip ${calendarFilter === 'solar' ? 'active' : ''}" onclick="window._calFilter('solar')">
        <span class="cal-chip-dot" style="background:var(--solar)"></span>Solar
      </button>
    </div>

    <div class="calendar-weekdays">
      ${weekdays.map(w => `<div class="calendar-weekday">${w}</div>`).join('')}
    </div>

    <div class="calendar-grid">
      ${dayCells}
    </div>

    <!-- Festival list for this month -->
    ${renderMonthFestivals(app, festivalsByDate)}
  `;
}

function renderMonthFestivals(app, festivalsByDate) {
  const allFestivals = [];
  for (const [date, festivals] of Object.entries(festivalsByDate)) {
    for (const f of festivals) {
      const d = new Date(date + 'T00:00:00');
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear && matchesFilter(f.festival_type)) {
        allFestivals.push(f);
      }
    }
  }

  if (allFestivals.length === 0) return calendarFilter !== 'all'
    ? `<div class="info-card" style="margin-top:16px;"><p style="color:var(--text-muted);font-size:13px;">No ${calendarFilter} festivals this month.</p></div>`
    : '';

  // Deduplicate recurring ones for display
  const seen = new Set();
  const unique = allFestivals.filter(f => {
    const key = f.rule_id + '-' + f.date;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return `
    <div class="info-card" style="margin-top: 16px;">
      <h3>This Month</h3>
      ${unique.map(f => `
        <div class="festival-item clickable" onclick="app.openEventPage('${f.rule_id}', '${f.name.replace(/'/g, "\\'")}')">
          <div class="festival-dot ${getFestivalDotClass(f.festival_type)}"></div>
          <div>
            <div class="festival-name">${f.name}</div>
            <div class="festival-date">${app.formatDate(f.date)}</div>
          </div>
          <svg class="festival-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>
        </div>
      `).join('')}
    </div>
  `;
}

function getFestivalDotClass(type) {
  if (typeof type === 'string') {
    if (type.includes('Major')) return 'major';
    if (type.includes('Solar')) return 'solar';
    return 'recurring';
  }
  return 'recurring';
}

function formatTimeHours(hours) {
  if (hours == null) return '-';
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function showDayDetail(app, dateStr, panchang, festivals) {
  // Remove existing detail popup
  document.querySelector('.day-detail-popup')?.remove();

  const popup = document.createElement('div');
  popup.className = 'day-detail-popup';
  popup.innerHTML = `
    <div class="day-detail-header">
      <span>${app.formatDate(dateStr)}</span>
      <button onclick="this.closest('.day-detail-popup').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text-muted);">&times;</button>
    </div>
    ${panchang ? `
    <div class="info-row">
      <span class="info-label">Tithi</span>
      <span class="info-value">${panchang.tithi?.name || '-'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Nakshatra</span>
      <span class="info-value">${panchang.nakshatra?.name || '-'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Paksha</span>
      <span class="info-value">${panchang.paksha || '-'}</span>
    </div>
    ${panchang.sunrise != null ? `
    <div class="info-row">
      <span class="info-label">Sunrise</span>
      <span class="info-value">${formatTimeHours(panchang.sunrise)}</span>
    </div>` : ''}
    ${panchang.sunset != null ? `
    <div class="info-row">
      <span class="info-label">Sunset</span>
      <span class="info-value">${formatTimeHours(panchang.sunset)}</span>
    </div>` : ''}
    ` : '<p style="color:var(--text-muted);font-size:13px;">No panchang data available</p>'}
    ${festivals.length > 0 ? festivals.map(f => `
      <div class="festival-item clickable" onclick="app.openEventPage('${f.rule_id}', '${f.name.replace(/'/g, "\\'")}')">
        <div class="festival-dot ${getFestivalDotClass(f.festival_type)}"></div>
        <div>
          <div class="festival-name">${f.name}${f.close_call ? ' <span class="close-call-badge">close call</span>' : ''}</div>
          ${f.reason ? `<div class="festival-reason">${f.reason}</div>` : ''}
          ${f.variant_note ? `<div class="festival-reason" style="font-style:italic;">${f.variant_note}</div>` : ''}
        </div>
        <svg class="festival-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>
      </div>
    `).join('') : ''}
  `;

  const container = document.getElementById('view-calendar');
  container.appendChild(popup);
}

function mockFestivals(year, month) {
  // Provide some realistic mock festivals for each month
  const festivals = [];
  const m = month + 1; // 1-indexed

  // Add Ekadashis (roughly every 15 days)
  festivals.push(
    { rule_id: 'ekadashi', name: 'Ekadashi', date: `${year}-${String(m).padStart(2,'0')}-05`, festival_type: 'RecurringFortnightly', reason: 'Ekadashi -- a fasting day sacred to Vishnu' },
    { rule_id: 'ekadashi', name: 'Ekadashi', date: `${year}-${String(m).padStart(2,'0')}-20`, festival_type: 'RecurringFortnightly', reason: 'Ekadashi -- a fasting day sacred to Vishnu' },
  );
  // Purnima
  festivals.push({ rule_id: 'purnima', name: 'Purnima', date: `${year}-${String(m).padStart(2,'0')}-14`, festival_type: 'RecurringMonthly', reason: 'Full moon' });
  // Amavasya
  festivals.push({ rule_id: 'amavasya', name: 'Amavasya', date: `${year}-${String(m).padStart(2,'0')}-28`, festival_type: 'RecurringMonthly', reason: 'New moon' });

  // November 2026 Deepavali + Karthigai
  if (year === 2026 && month === 10) {
    festivals.push(
      { rule_id: 'naraka-chaturdashi', name: 'Deepavali', date: '2026-11-07', festival_type: 'MajorFestival', reason: 'Chaturdashi of Krishna Paksha -- oil bath before dawn' },
      { rule_id: 'diwali-lakshmi-puja', name: 'Deepavali Lakshmi Puja', date: '2026-11-08', festival_type: 'MajorFestival', reason: 'Amavasya -- Lakshmi Puja with lamps' },
      { rule_id: 'ayyappa-mandalam', name: 'Mandala Kalam begins', date: '2026-11-16', festival_type: 'Regional', reason: 'Sun enters Scorpio -- Ayyappa Mandala Kalam' },
      { rule_id: 'karthigai-deepam', name: 'Karthigai Deepam', date: '2026-11-22', festival_type: 'MajorFestival', reason: 'Kartika Purnima -- Tamil festival of lamps' },
    );
  }
  // January 2027 Pongal
  if (year === 2027 && month === 0) {
    festivals.push(
      { rule_id: 'pongal', name: 'Pongal', date: '2027-01-14', festival_type: 'SolarTransit', reason: 'Sun enters Capricorn -- Thai Pongal' },
    );
  }
  // August Aadi Perukku
  if (month === 7) {
    festivals.push(
      { rule_id: 'aadi-perukku', name: 'Aadi Perukku', date: `${year}-08-03`, festival_type: 'Regional', reason: '18th of Aadi -- river festival' },
    );
  }

  return festivals;
}

// === ICS Export ===
// ponytail: plain string concat, no ical library
window._exportICS = async function() {
  try {
    const app = window.app;
    const year = currentYear;
    const month = currentMonth;
    const start = `${year}-${String(month + 1).padStart(2,'0')}-01`;
    const lastDay = new Date(year, month + 1, 0);
    const end = formatDateStr(lastDay);

    let festivals;
    if (app.isTauri) {
      festivals = await app.getFestivals(start, end);
    } else {
      festivals = mockFestivals(year, month);
    }

    // Dedup
    const seen = new Set();
    const unique = festivals.filter(f => {
      const key = f.rule_id + '-' + f.date;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Parampara//Hindu Calendar//EN',
      'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:Parampara',
    ];

    for (const f of unique) {
      const dateClean = f.date.replace(/-/g, '');
      // All-day event: DTSTART is date, DTEND is next day
      const d = new Date(f.date + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      const endDate = d.getFullYear().toString() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');

      ics.push(
        'BEGIN:VEVENT',
        `UID:${f.rule_id}-${f.date}@parampara`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${dateClean}`,
        `DTEND;VALUE=DATE:${endDate}`,
        `SUMMARY:${f.name}`,
        `DESCRIPTION:${(f.reason || '').replace(/\n/g, '\\n')}`,
        'END:VEVENT',
      );
    }

    ics.push('END:VCALENDAR');
    const blob = new Blob([ics.join('\r\n')], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    a.download = `parampara-${monthNames[month]}-${year}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Failed to export ICS:', e);
  }
};

// === Filter ===
window._calFilter = function(filter) {
  calendarFilter = filter;
  renderCalendar(window.app);
};

function matchesFilter(festivalType) {
  if (calendarFilter === 'all') return true;
  const cls = getFestivalDotClass(festivalType);
  return cls === calendarFilter;
}

// === Year View ===
window._toggleYearView = function() {
  yearViewActive = !yearViewActive;
  renderCalendar(window.app);
};

async function renderYearView(app, container) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Fetch festivals for 24 months from current month
  const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
  const endYear = currentYear + 2;
  const endDate = `${endYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;

  let festivals;
  if (app.isTauri) {
    festivals = await app.getFestivals(startDate, endDate);
  } else {
    // Gather mock festivals for 24 months
    festivals = [];
    for (let i = 0; i < 24; i++) {
      const m = (currentMonth + i) % 12;
      const y = currentYear + Math.floor((currentMonth + i) / 12);
      festivals.push(...mockFestivals(y, m));
    }
  }

  // Group major festivals by month (skip recurring like ekadashi/pradosham/purnima/amavasya/sankashti)
  const recurring = new Set(['ekadashi', 'pradosh-vrat', 'purnima', 'amavasya', 'sankashti-chaturthi']);
  const byMonth = {};
  for (const f of festivals) {
    if (recurring.has(f.rule_id)) continue;
    const key = f.date.slice(0, 7); // YYYY-MM
    if (!byMonth[key]) byMonth[key] = [];
    // dedup
    if (!byMonth[key].some(x => x.rule_id === f.rule_id && x.date === f.date)) {
      byMonth[key].push(f);
    }
  }

  // Render 24 months in a grid
  let months = '';
  for (let i = 0; i < 24; i++) {
    const m = (currentMonth + i) % 12;
    const y = currentYear + Math.floor((currentMonth + i) / 12);
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const fests = byMonth[key] || [];
    const now = new Date();
    const isCurrent = y === now.getFullYear() && m === now.getMonth();

    months += `
      <div class="year-month-card ${isCurrent ? 'current' : ''}" onclick="window._yearMonthClick(${y}, ${m})">
        <div class="year-month-header">${monthNames[m]} ${y}</div>
        <div class="year-month-festivals">
          ${fests.length > 0 ? fests.slice(0, 4).map(f => `
            <div class="year-festival-item">
              <span class="year-festival-dot" style="background: var(--${f.festival_type?.includes('Major') ? 'major-festival' : f.festival_type?.includes('Solar') ? 'solar' : 'recurring'})"></span>
              <span class="year-festival-name">${f.name}</span>
              <span class="year-festival-date">${parseInt(f.date.slice(8))}</span>
            </div>
          `).join('') : '<div style="color:var(--text-muted);font-size:11px;">No major festivals</div>'}
          ${fests.length > 4 ? `<div style="color:var(--text-muted);font-size:11px;">+${fests.length - 4} more</div>` : ''}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="calendar-header">
      <button class="calendar-nav-btn" onclick="window._yearNavPrev()">&larr;</button>
      <div>
        <div class="calendar-month-title">24-Month View</div>
        <div style="font-size: 12px; color: var(--text-secondary); text-align: center;">
          ${monthNames[currentMonth]} ${currentYear} &ndash; ${monthNames[(currentMonth + 23) % 12]} ${currentYear + Math.floor((currentMonth + 23) / 12)}
        </div>
      </div>
      <button class="calendar-nav-btn" onclick="window._yearNavNext()">&rarr;</button>
    </div>
    <div style="text-align: center; margin-bottom: 12px;">
      <button class="cal-export-btn" onclick="window._toggleYearView()">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="10" height="10" rx="1"/><path d="M3 8h10M8 4v10"/></svg>
        Month View
      </button>
    </div>
    <div class="year-grid">${months}</div>
  `;
}

window._yearMonthClick = function(y, m) {
  currentYear = y;
  currentMonth = m;
  yearViewActive = false;
  renderCalendar(window.app);
};

window._yearNavPrev = function() {
  currentYear--;
  renderCalendar(window.app);
};

window._yearNavNext = function() {
  currentYear++;
  renderCalendar(window.app);
};

function mockPanchangRange(start, end) {
  const result = [];
  const d = new Date(start);
  const tithiNames = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami',
    'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
    'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', 'Purnima'];
  let tithiIdx = 0;
  while (d <= end) {
    result.push({
      date: formatDateStr(d),
      tithi: { name: tithiNames[tithiIdx % 15] },
      lunar_month: { month: 'Ashvina', is_adhik: false, year_vikram: 2083 },
    });
    tithiIdx++;
    d.setDate(d.getDate() + 1);
  }
  return result;
}

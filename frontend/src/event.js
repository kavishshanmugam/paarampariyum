/**
 * Event Page - Renders observance detail pages from content markdown.
 *
 * Content is loaded from /content/pages/<id>.md files.
 * Parses YAML frontmatter + Markdown body and renders a rich detail view.
 */

// ponytail: no markdown lib -- regex-based renderer, add marked.js if formatting falls short
function parseMarkdown(md) {
  // Strip YAML frontmatter
  const bodyMatch = md.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1].trim() : md.trim();

  // Parse YAML frontmatter
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = {};
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const kv = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
      if (kv) frontmatter[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
    }
  }

  return { frontmatter, body };
}

function renderMarkdownToHtml(md) {
  let html = md
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Line breaks -> paragraphs
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // Wrap consecutive <li> in <ul> or <ol>
  html = html.replace(/(<li>.*?<\/li>(\s*<br>)?)+/g, (match) => {
    return '<ul>' + match.replace(/<br>/g, '') + '</ul>';
  });

  return '<p>' + html + '</p>';
}

// Content cache
const contentCache = new Map();

async function loadContent(id) {
  if (contentCache.has(id)) return contentCache.get(id);

  try {
    const res = await fetch(`/pages/${id}.md`);
    if (!res.ok) return null;
    const text = await res.text();
    const parsed = parseMarkdown(text);
    contentCache.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function renderEventPage(app, eventId, eventName) {
  const container = document.getElementById('main-content');

  // Show loading state with back button
  container.innerHTML = `
    <div class="view active" style="padding: 16px;">
      <div class="event-back" onclick="app.closeEventPage()">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 10H5M5 10l5-5M5 10l5 5"/>
        </svg>
        Back
      </div>
      <div class="loading"><div class="loading-spinner"></div>Loading...</div>
    </div>
  `;

  const content = await loadContent(eventId);

  if (!content) {
    container.innerHTML = `
      <div class="view active" style="padding: 16px;">
        <div class="event-back" onclick="app.closeEventPage()">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 10H5M5 10l5-5M5 10l5 5"/>
          </svg>
          Back
        </div>
        <div class="event-page">
          <h1 class="event-title">${escapeHtml(eventName || eventId)}</h1>
          <div class="info-card">
            <p style="color: var(--text-secondary);">
              Detailed content for this observance is being prepared.
              Ask the Guide for more information.
            </p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Parse sections from markdown body
  const sections = parseSections(content.body);

  container.innerHTML = `
    <div class="view active" style="padding: 16px;">
      <div class="event-back" onclick="app.closeEventPage()">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 10H5M5 10l5-5M5 10l5 5"/>
        </svg>
        Back
      </div>
      <div class="event-page">
        <h1 class="event-title">${escapeHtml(eventName || content.frontmatter.names_en || eventId)}</h1>
        ${content.frontmatter.names_hi ? `<div class="event-title-hi">${escapeHtml(content.frontmatter.names_hi)}</div>` : ''}

        ${sections.map(s => renderSection(s)).join('')}

        <div class="event-footer">
          <button class="event-ask-btn" onclick="app.askGuideAbout('${escapeAttr(eventName || eventId)}')">
            Ask the Guide about this
          </button>
        </div>
      </div>
    </div>
  `;
}

function parseSections(body) {
  const sections = [];
  const lines = body.split('\n');
  let current = null;

  for (const line of lines) {
    const h2 = line.match(/^## (.+)$/);
    if (h2) {
      if (current) sections.push(current);
      current = { title: h2[1], level: 2, content: '', subsections: [] };
      continue;
    }

    const h3 = line.match(/^### (.+)$/);
    if (h3 && current) {
      current.subsections.push({ title: h3[1], content: '' });
      continue;
    }

    // Skip the top-level h1
    if (line.match(/^# /)) continue;

    if (current) {
      if (current.subsections.length > 0) {
        current.subsections[current.subsections.length - 1].content += line + '\n';
      } else {
        current.content += line + '\n';
      }
    }
  }
  if (current) sections.push(current);
  return sections;
}

function renderSection(section) {
  // Map section titles to appropriate card styles
  const collapsible = ['Fuller version', 'Items needed', 'How others do it', 'Who is traditionally exempt', 'What research says', 'Also today'];
  const isStory = section.title === 'The story';
  const isWhatToDo = section.title === 'What to do';
  const isSummary = section.title === 'In two sentences';

  if (isSummary) {
    return `
      <div class="event-summary">
        ${renderMarkdownToHtml(section.content.trim())}
      </div>
    `;
  }

  let html = `<div class="info-card event-section">`;
  html += `<h3>${escapeHtml(section.title)}</h3>`;

  if (section.subsections.length > 0) {
    for (const sub of section.subsections) {
      const isCollapsible = collapsible.includes(sub.title);
      if (isCollapsible) {
        html += `<details class="event-details"><summary>${escapeHtml(sub.title)}</summary>`;
        html += `<div class="event-details-body">${renderMarkdownToHtml(sub.content.trim())}</div>`;
        html += `</details>`;
      } else {
        html += `<div class="event-subsection">`;
        html += `<h4>${escapeHtml(sub.title)}</h4>`;
        html += renderMarkdownToHtml(sub.content.trim());
        html += `</div>`;
      }
    }
  } else {
    html += renderMarkdownToHtml(section.content.trim());
  }

  html += `</div>`;
  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

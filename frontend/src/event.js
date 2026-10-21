/**
 * Event Page - Renders observance detail pages from content markdown.
 *
 * Content is loaded from /content/pages/<id>.md files.
 * Parses YAML frontmatter + Markdown body and renders a rich detail view.
 * Family notes CRUD when authenticated.
 */

import { getNotes, createNote, updateNote, deleteNote, uploadNoteFile, getToken } from './api.js';

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

        <div id="family-notes-section"></div>

        <div class="event-footer">
          <button class="event-ask-btn" onclick="app.askGuideAbout('${escapeAttr(eventName || eventId)}')">
            Ask the Guide about this
          </button>
        </div>
      </div>
    </div>
  `;

  // Load family notes asynchronously
  loadFamilyNotes(eventId);
}

// Load and render family notes
async function loadFamilyNotes(eventId) {
  const container = document.getElementById('family-notes-section');
  if (!container) return;

  const hasAuth = getToken();

  if (!hasAuth) {
    // Show sign-in prompt
    container.innerHTML = `
      <div class="notes-section">
        <h3>Family Traditions</h3>
        <div class="info-card" style="text-align:center;">
          <p style="font-size:14px;color:var(--text-secondary);margin-bottom:8px;">Sign in to add your family's traditions and notes for this observance.</p>
        </div>
      </div>
    `;
    return;
  }

  try {
    const notes = await getNotes(eventId);
    renderFamilyNotes(container, eventId, notes);
  } catch {
    container.innerHTML = `
      <div class="notes-section">
        <h3>Family Traditions</h3>
        <button class="note-add-btn" onclick="window._noteStartAdd('${eventId}')">+ Add a family tradition note</button>
      </div>
    `;
  }
}

function renderFamilyNotes(container, eventId, notes) {
  const pinnedNotes = notes.filter(n => n.pinned);
  const otherNotes = notes.filter(n => !n.pinned);
  const allNotes = [...pinnedNotes, ...otherNotes];

  container.innerHTML = `
    <div class="notes-section">
      <h3>Family Traditions</h3>
      ${allNotes.map(note => `
        <div class="note-card ${note.pinned ? 'pinned' : ''}" data-note-id="${note.id}">
          ${renderNoteContent(note)}
          <div class="note-meta">
            <span>${new Date(note.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <div class="note-actions">
              <button class="note-action-btn" onclick="window._noteTogglePin('${eventId}', '${note.id}', ${note.pinned ? 0 : 1})">${note.pinned ? 'Unpin' : 'Pin'}</button>
              ${note.note_type === 'text' ? `<button class="note-action-btn" onclick="window._noteStartEdit('${eventId}', '${note.id}')">Edit</button>` : ''}
              <button class="note-action-btn" onclick="window._noteDelete('${eventId}', '${note.id}')">Delete</button>
            </div>
          </div>
        </div>
      `).join('')}
      <div id="note-add-area"></div>
      <div class="note-add-row">
        <button class="note-add-btn" onclick="window._noteStartAdd('${eventId}')">+ Text note</button>
        <button class="note-add-btn" onclick="window._noteAddPhoto('${eventId}')">+ Photo</button>
        <button class="note-add-btn" onclick="window._noteStartVoice('${eventId}')">+ Voice</button>
      </div>
    </div>
  `;
}

function renderNoteContent(note) {
  if (note.note_type === 'photo') {
    return `<div class="note-content"><img src="/api/uploads/${escapeHtml(note.content)}" class="note-photo" alt="Family photo" onclick="window._noteViewPhoto(this.src)"></div>`;
  }
  if (note.note_type === 'voice') {
    return `<div class="note-content"><audio controls src="/api/uploads/${escapeHtml(note.content)}" class="note-audio"></audio></div>`;
  }
  return `<div class="note-content">${escapeHtml(note.content)}</div>`;
}

// Family notes interaction handlers
if (typeof window !== 'undefined') {
  window._noteStartAdd = function(eventId) {
    const area = document.getElementById('note-add-area');
    if (!area) return;
    area.innerHTML = `
      <div class="note-card">
        <textarea class="note-edit-area" id="new-note-text" placeholder="Write about your family's tradition for this observance..."></textarea>
        <div class="note-save-row">
          <button class="note-cancel-btn" onclick="document.getElementById('note-add-area').innerHTML=''">Cancel</button>
          <button class="note-save-btn" onclick="window._noteSave('${eventId}')">Save</button>
        </div>
      </div>
    `;
    document.getElementById('new-note-text')?.focus();
  };

  window._noteSave = async function(eventId) {
    const text = document.getElementById('new-note-text')?.value.trim();
    if (!text) return;
    try {
      await createNote(eventId, text);
      await loadFamilyNotes(eventId);
    } catch (err) {
      alert('Could not save note: ' + err.message);
    }
  };

  window._noteStartEdit = function(eventId, noteId) {
    const card = document.querySelector(`[data-note-id="${noteId}"]`);
    if (!card) return;
    const currentText = card.querySelector('.note-content').textContent;
    card.innerHTML = `
      <textarea class="note-edit-area" id="edit-note-text">${escapeHtml(currentText)}</textarea>
      <div class="note-save-row">
        <button class="note-cancel-btn" onclick="window._noteReloadNotes('${eventId}')">Cancel</button>
        <button class="note-save-btn" onclick="window._noteUpdate('${eventId}', '${noteId}')">Save</button>
      </div>
    `;
    document.getElementById('edit-note-text')?.focus();
  };

  window._noteUpdate = async function(eventId, noteId) {
    const text = document.getElementById('edit-note-text')?.value.trim();
    if (!text) return;
    try {
      await updateNote(noteId, { content: text });
      await loadFamilyNotes(eventId);
    } catch (err) {
      alert('Could not update note: ' + err.message);
    }
  };

  window._noteTogglePin = async function(eventId, noteId, pinned) {
    try {
      await updateNote(noteId, { pinned: !!pinned });
      await loadFamilyNotes(eventId);
    } catch (err) {
      alert('Could not update note: ' + err.message);
    }
  };

  window._noteDelete = async function(eventId, noteId) {
    if (!confirm('Delete this note?')) return;
    try {
      await deleteNote(noteId);
      await loadFamilyNotes(eventId);
    } catch (err) {
      alert('Could not delete note: ' + err.message);
    }
  };

  window._noteReloadNotes = async function(eventId) {
    await loadFamilyNotes(eventId);
  };

  // Photo upload via hidden file input
  window._noteAddPhoto = function(eventId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      if (!input.files[0]) return;
      try {
        await uploadNoteFile(eventId, input.files[0], 'photo');
        await loadFamilyNotes(eventId);
      } catch (err) {
        alert('Could not upload photo: ' + err.message);
      }
    };
    input.click();
  };

  // Voice recording via MediaRecorder
  let _voiceRecorder = null;
  let _voiceChunks = [];

  window._noteStartVoice = function(eventId) {
    const area = document.getElementById('note-add-area');
    if (!area) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Voice recording is not supported in this browser.');
      return;
    }

    area.innerHTML = `
      <div class="note-card">
        <div class="voice-record-ui">
          <div class="voice-status" id="voice-status">Press Record to start</div>
          <div class="note-save-row">
            <button class="note-cancel-btn" onclick="window._noteVoiceCancel()">Cancel</button>
            <button class="note-save-btn" id="voice-record-btn" onclick="window._noteVoiceToggle('${eventId}')">Record</button>
          </div>
        </div>
      </div>
    `;
  };

  window._noteVoiceToggle = async function(eventId) {
    const btn = document.getElementById('voice-record-btn');
    const status = document.getElementById('voice-status');

    if (_voiceRecorder && _voiceRecorder.state === 'recording') {
      // Stop recording
      _voiceRecorder.stop();
      btn.textContent = 'Saving...';
      btn.disabled = true;
      return;
    }

    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      _voiceChunks = [];
      _voiceRecorder = new MediaRecorder(stream);

      _voiceRecorder.ondataavailable = (e) => { if (e.data.size > 0) _voiceChunks.push(e.data); };
      _voiceRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(_voiceChunks, { type: _voiceRecorder.mimeType || 'audio/webm' });
        const ext = (_voiceRecorder.mimeType || '').includes('mp4') ? '.m4a' : '.webm';
        const file = new File([blob], `voice${ext}`, { type: blob.type });
        try {
          await uploadNoteFile(eventId, file, 'voice');
          await loadFamilyNotes(eventId);
        } catch (err) {
          alert('Could not save voice note: ' + err.message);
        }
        _voiceRecorder = null;
      };

      _voiceRecorder.start();
      btn.textContent = 'Stop';
      btn.style.background = 'var(--error)';
      status.textContent = 'Recording...';
    } catch (err) {
      alert('Microphone access denied: ' + err.message);
    }
  };

  window._noteVoiceCancel = function() {
    if (_voiceRecorder && _voiceRecorder.state === 'recording') {
      _voiceRecorder.stream?.getTracks().forEach(t => t.stop());
      _voiceRecorder.stop();
      _voiceRecorder = null;
    }
    const area = document.getElementById('note-add-area');
    if (area) area.innerHTML = '';
  };

  // Photo lightbox
  window._noteViewPhoto = function(src) {
    const overlay = document.createElement('div');
    overlay.className = 'photo-lightbox';
    overlay.innerHTML = `<img src="${src}" onclick="event.stopPropagation()"><button onclick="this.parentElement.remove()" class="photo-lightbox-close">&times;</button>`;
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
  };
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

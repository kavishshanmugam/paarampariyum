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

  // Parse YAML frontmatter (including elder_prompts array)
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = {};
  const elderPrompts = [];
  if (fmMatch) {
    let inElderPrompts = false;
    for (const line of fmMatch[1].split('\n')) {
      if (line.match(/^elder_prompts:\s*$/)) {
        inElderPrompts = true;
        continue;
      }
      if (inElderPrompts) {
        const item = line.match(/^\s+-\s+"(.+)"$/);
        if (item) { elderPrompts.push(item[1]); continue; }
        inElderPrompts = false;
      }
      const kv = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
      if (kv) frontmatter[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
    }
  }
  frontmatter.elder_prompts = elderPrompts;

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

        ${renderElderPrompts(content.frontmatter.elder_prompts, eventId)}

        <div id="family-notes-section"></div>

        <div class="event-footer">
          <button class="event-ask-btn" onclick="app.askGuideAbout('${escapeAttr(eventName || eventId)}')">
            Ask the Guide about this
          </button>
        </div>
      </div>
    </div>
  `;

  // Convert items lists to interactive checklists
  makeItemsCheckable(eventId);

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
  const scope = window._currentNoteScope || null;
  const ourWayNotes = notes.filter(n => !n.scope || n.scope === 'our_way');
  const thisYearNotes = notes.filter(n => n.scope === 'this_year');
  const displayNotes = scope === 'this_year' ? thisYearNotes : scope === 'our_way' ? ourWayNotes : notes;

  const pinnedNotes = displayNotes.filter(n => n.pinned);
  const otherNotes = displayNotes.filter(n => !n.pinned);
  const allNotes = [...pinnedNotes, ...otherNotes];

  const activeScope = scope || 'all';
  const currentYear = new Date().getFullYear();
  const addScope = scope === 'this_year' ? 'this_year' : 'our_way';

  container.innerHTML = `
    <div class="notes-section">
      <h3>Family Traditions</h3>
      <div class="notes-scope-tabs">
        <button class="scope-tab ${activeScope === 'all' ? 'active' : ''}" onclick="window._switchNoteScope('${eventId}', null)">All</button>
        <button class="scope-tab ${activeScope === 'our_way' ? 'active' : ''}" onclick="window._switchNoteScope('${eventId}', 'our_way')">Our Way</button>
        <button class="scope-tab ${activeScope === 'this_year' ? 'active' : ''}" onclick="window._switchNoteScope('${eventId}', 'this_year')">This Year ${currentYear}</button>
      </div>
      ${allNotes.length === 0 ? `<p class="notes-empty">No ${scope === 'this_year' ? 'plans for this year' : scope === 'our_way' ? 'lasting traditions' : 'notes'} yet.</p>` : ''}
      ${allNotes.map(note => `
        <div class="note-card ${note.pinned ? 'pinned' : ''}" data-note-id="${note.id}">
          ${renderNoteContent(note)}
          <div class="note-meta">
            <span>
              ${note.author_name ? `<strong>${escapeHtml(note.author_name)}</strong> · ` : ''}
              ${note.scope === 'this_year' && note.occurrence_year ? `${note.occurrence_year} · ` : ''}
              ${new Date(note.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
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
        <button class="note-add-btn" onclick="window._noteStartAddScoped('${eventId}', '${addScope}')">+ Text</button>
        <button class="note-add-btn" onclick="window._noteAddPhoto('${eventId}')">+ Photo</button>
        <button class="note-add-btn" onclick="window._noteStartVoice('${eventId}')">+ Voice</button>
        <button class="note-add-btn" onclick="window._noteStartRecipe('${eventId}')">+ Recipe</button>
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
  if (note.note_type === 'recipe') {
    try {
      const recipe = JSON.parse(note.content);
      return `<div class="note-content recipe-card">
        <div class="recipe-title">${escapeHtml(recipe.title || 'Family Recipe')}</div>
        ${recipe.ingredients?.length ? `
          <div class="recipe-section">
            <strong>Ingredients</strong>
            <ul>${recipe.ingredients.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
          </div>
        ` : ''}
        ${recipe.method ? `
          <div class="recipe-section">
            <strong>Method</strong>
            <p>${escapeHtml(recipe.method)}</p>
          </div>
        ` : ''}
        ${recipe.notes ? `<div class="recipe-notes"><em>${escapeHtml(recipe.notes)}</em></div>` : ''}
      </div>`;
    } catch {
      return `<div class="note-content">${escapeHtml(note.content)}</div>`;
    }
  }
  return `<div class="note-content">${escapeHtml(note.content)}</div>`;
}

// Family notes interaction handlers
if (typeof window !== 'undefined') {
  window._noteStartAdd = function(eventId) {
    window._noteStartAddScoped(eventId, 'our_way');
  };

  window._noteStartAddScoped = function(eventId, scope) {
    const area = document.getElementById('note-add-area');
    if (!area) return;
    const isThisYear = scope === 'this_year';
    const placeholder = isThisYear
      ? `Plans for this year's observance (e.g. "Puja at Mama's house, 7:30 pm. Priya brings diyas.")`
      : `Write about your family's tradition for this observance...`;
    area.innerHTML = `
      <div class="note-card">
        <textarea class="note-edit-area" id="new-note-text" placeholder="${placeholder}"></textarea>
        <div class="note-save-row">
          <label class="note-visibility-label">
            <select id="new-note-visibility">
              <option value="household">My household</option>
              <option value="group">Everyone</option>
            </select>
          </label>
          <button class="note-cancel-btn" onclick="document.getElementById('note-add-area').innerHTML=''">Cancel</button>
          <button class="note-save-btn" onclick="window._noteSaveScoped('${eventId}', '${scope}')">Save</button>
        </div>
      </div>
    `;
    document.getElementById('new-note-text')?.focus();
  };

  window._noteSave = async function(eventId) {
    await window._noteSaveScoped(eventId, 'our_way');
  };

  window._noteSaveScoped = async function(eventId, scope) {
    const text = document.getElementById('new-note-text')?.value.trim();
    if (!text) return;
    const visibility = document.getElementById('new-note-visibility')?.value || 'household';
    try {
      await createNote(eventId, text, 'text', { scope, visibility });
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

  // Voice recording via MediaRecorder + live transcription
  let _voiceRecorder = null;
  let _voiceChunks = [];
  let _voiceRecognition = null;
  let _voiceTranscript = '';

  function _getSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-AU';
    return r;
  }

  window._noteStartVoice = function(eventId) {
    const area = document.getElementById('note-add-area');
    if (!area) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Voice recording is not supported in this browser.');
      return;
    }

    _voiceTranscript = '';

    area.innerHTML = `
      <div class="note-card">
        <div class="voice-record-ui">
          <div class="voice-status" id="voice-status">Press Record to start</div>
          <div id="voice-transcript" class="elder-transcript" style="display:none;"></div>
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
      if (_voiceRecognition) { _voiceRecognition.stop(); _voiceRecognition = null; }
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
          // Upload audio
          await uploadNoteFile(eventId, file, 'voice');
          // Save transcript as companion text note if we got one
          if (_voiceTranscript.trim()) {
            await createNote(eventId, `[Transcript] ${_voiceTranscript.trim()}`, 'text', { scope: 'our_way' });
          }
          await loadFamilyNotes(eventId);
        } catch (err) {
          alert('Could not save voice note: ' + err.message);
        }
        _voiceRecorder = null;
      };

      // Start speech recognition for live transcript
      const recognition = _getSpeechRecognition();
      if (recognition) {
        _voiceRecognition = recognition;
        let finalTranscript = '';
        const transcriptEl = document.getElementById('voice-transcript');
        if (transcriptEl) transcriptEl.style.display = 'block';

        recognition.onresult = (event) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript + ' ';
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          _voiceTranscript = finalTranscript;
          if (transcriptEl) transcriptEl.textContent = finalTranscript + (interim ? `...${interim}` : '');
        };

        recognition.onerror = () => {};
        recognition.onend = () => {
          if (_voiceRecorder?.state === 'recording' && _voiceRecognition) {
            try { _voiceRecognition.start(); } catch { /* ok */ }
          }
        };
        try { recognition.start(); } catch { /* ok */ }
      }

      _voiceRecorder.start();
      btn.textContent = 'Stop';
      btn.style.background = 'var(--error)';
      status.textContent = recognition ? 'Recording + transcribing...' : 'Recording... (transcription not available)';
    } catch (err) {
      alert('Microphone access denied: ' + err.message);
    }
  };

  window._noteVoiceCancel = function() {
    if (_voiceRecognition) { _voiceRecognition.stop(); _voiceRecognition = null; }
    if (_voiceRecorder && _voiceRecorder.state === 'recording') {
      _voiceRecorder.stream?.getTracks().forEach(t => t.stop());
      _voiceRecorder.stop();
      _voiceRecorder = null;
    }
    _voiceTranscript = '';
    const area = document.getElementById('note-add-area');
    if (area) area.innerHTML = '';
  };

  // Recipe note
  window._noteStartRecipe = function(eventId) {
    const area = document.getElementById('note-add-area');
    if (!area) return;
    area.innerHTML = `
      <div class="note-card recipe-form">
        <input type="text" class="recipe-input" id="recipe-title" placeholder="Recipe name (e.g. Paatti's Pongal)">
        <textarea class="note-edit-area" id="recipe-ingredients" rows="4" placeholder="Ingredients (one per line)&#10;e.g.&#10;1 cup raw rice&#10;1/2 cup moong dal&#10;4 cups milk"></textarea>
        <textarea class="note-edit-area" id="recipe-method" rows="4" placeholder="Method / how to make it..."></textarea>
        <input type="text" class="recipe-input" id="recipe-notes" placeholder="Notes (e.g. 'Paatti always adds extra ghee at the end')">
        <div class="note-save-row">
          <label class="note-visibility-label">
            <select id="recipe-visibility">
              <option value="household">My household</option>
              <option value="group">Everyone</option>
            </select>
          </label>
          <button class="note-cancel-btn" onclick="document.getElementById('note-add-area').innerHTML=''">Cancel</button>
          <button class="note-save-btn" onclick="window._noteSaveRecipe('${eventId}')">Save Recipe</button>
        </div>
      </div>
    `;
    document.getElementById('recipe-title')?.focus();
    area.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window._noteSaveRecipe = async function(eventId) {
    const title = document.getElementById('recipe-title')?.value.trim();
    const ingredientsRaw = document.getElementById('recipe-ingredients')?.value.trim();
    const method = document.getElementById('recipe-method')?.value.trim();
    const notes = document.getElementById('recipe-notes')?.value.trim();
    const visibility = document.getElementById('recipe-visibility')?.value || 'household';

    if (!title && !ingredientsRaw && !method) {
      alert('Please fill in at least the recipe name or ingredients.');
      return;
    }

    const ingredients = ingredientsRaw ? ingredientsRaw.split('\n').map(l => l.trim()).filter(Boolean) : [];
    const recipe = JSON.stringify({ title, ingredients, method, notes });

    try {
      await createNote(eventId, recipe, 'recipe', { scope: 'our_way', visibility });
      await loadFamilyNotes(eventId);
    } catch (err) {
      alert('Could not save recipe: ' + err.message);
    }
  };

  // Elder prompt handlers
  window._elderPromptText = function(eventId, promptIdx) {
    const area = document.getElementById('note-add-area');
    if (!area) return;
    if (!getToken()) { alert('Sign in to record family traditions.'); return; }
    area.innerHTML = `
      <div class="note-card">
        <div class="elder-prompt-label">Recording elder's answer...</div>
        <textarea class="note-edit-area" id="new-note-text" placeholder="Type or dictate what they share..."></textarea>
        <div class="note-save-row">
          <button class="note-cancel-btn" onclick="document.getElementById('note-add-area').innerHTML=''">Cancel</button>
          <button class="note-save-btn" onclick="window._noteSaveWithScope('${eventId}', 'our_way')">Save</button>
        </div>
      </div>
    `;
    document.getElementById('new-note-text')?.focus();
    // Scroll to add area
    area.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window._elderPromptRecord = function(eventId, promptIdx) {
    if (!getToken()) { alert('Sign in to record family traditions.'); return; }
    window._noteStartVoice(eventId);
  };

  // Scope-aware save
  window._noteSaveWithScope = async function(eventId, scope) {
    const text = document.getElementById('new-note-text')?.value.trim();
    if (!text) return;
    try {
      await createNote(eventId, text, 'text', { scope });
      await loadFamilyNotes(eventId);
    } catch (err) {
      alert('Could not save note: ' + err.message);
    }
  };

  // Track which scope tab is active
  window._currentNoteScope = null;
  window._switchNoteScope = async function(eventId, scope) {
    window._currentNoteScope = scope;
    await loadFamilyNotes(eventId);
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

function renderElderPrompts(prompts, eventId) {
  if (!prompts || prompts.length === 0) return '';
  return `
    <div class="info-card elder-prompts-card">
      <h3>Ask Your Elders</h3>
      <p class="elder-prompts-intro">These questions are meant to start a conversation. Hand the phone to an elder, or ask them over a meal.</p>
      ${prompts.map((q, i) => `
        <div class="elder-prompt-item">
          <div class="elder-prompt-text">${escapeHtml(q)}</div>
          <div class="elder-prompt-actions">
            <button class="elder-prompt-btn" onclick="window._elderPromptText('${escapeAttr(eventId)}', ${i})">Write</button>
            <button class="elder-prompt-btn elder-prompt-record" onclick="window._elderPromptRecord('${escapeAttr(eventId)}', ${i})">Record</button>
          </div>
        </div>
      `).join('')}
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

// ponytail: localStorage checklist, no state lib
function makeItemsCheckable(eventId) {
  const key = `parampara-checklist-${eventId}`;
  const checked = JSON.parse(localStorage.getItem(key) || '[]');

  // Find all "Items needed" details sections
  document.querySelectorAll('.event-details').forEach(details => {
    const summary = details.querySelector('summary');
    if (!summary || !summary.textContent.includes('Items needed')) return;

    const lis = details.querySelectorAll('li');
    lis.forEach((li, idx) => {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checked.includes(idx);
      cb.style.cssText = 'margin-right:6px;accent-color:var(--primary);';
      cb.addEventListener('change', () => {
        const curr = JSON.parse(localStorage.getItem(key) || '[]');
        if (cb.checked) { if (!curr.includes(idx)) curr.push(idx); }
        else { const i = curr.indexOf(idx); if (i >= 0) curr.splice(i, 1); }
        localStorage.setItem(key, JSON.stringify(curr));
        li.style.opacity = cb.checked ? '0.5' : '1';
        li.style.textDecoration = cb.checked ? 'line-through' : 'none';
      });
      li.prepend(cb);
      if (checked.includes(idx)) {
        li.style.opacity = '0.5';
        li.style.textDecoration = 'line-through';
      }
    });

    // Add clear button
    if (lis.length > 0) {
      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Clear all';
      clearBtn.style.cssText = 'font-size:11px;color:var(--text-muted);background:none;border:none;cursor:pointer;margin-top:6px;';
      clearBtn.onclick = () => {
        localStorage.removeItem(key);
        lis.forEach(li => {
          li.querySelector('input').checked = false;
          li.style.opacity = '1';
          li.style.textDecoration = 'none';
        });
      };
      details.querySelector('.event-details-body')?.appendChild(clearBtn);
    }
  });
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

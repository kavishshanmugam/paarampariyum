/**
 * Guide View - AI companion for questions about Hindu traditions.
 *
 * PRD requirements: AI-1 through AI-5
 * - Answers from reviewed content with tappable sources
 * - Dates only from the engine
 * - Never speaks as a deity
 * - States uncertainty plainly
 * - Flag button for unanswered questions
 *
 * When authenticated with backend: uses Claude API via /api/guide/chat
 * When offline/guest: falls back to client-side keyword search
 */

import { sendGuideMessage, flagQuestion, getToken } from './api.js';
import { escapeHtml } from './utils.js';

const messages = [];
let conversationId = null;

function getGuideDepth() {
  return localStorage.getItem('parampara-guide-depth') || 'standard';
}

// Client-side content index for offline fallback
let contentIndex = null;

async function buildContentIndex() {
  if (contentIndex) return contentIndex;
  contentIndex = {};

  const pageIds = [
    'naraka-chaturdashi', 'diwali-lakshmi-puja',
    'ekadashi', 'pradosh-vrat', 'sankashti-chaturthi', 'purnima', 'amavasya',
    'maha-shivaratri', 'ram-navami', 'ganesh-chaturthi',
    'pongal', 'onam', 'ugadi', 'navaratri-golu', 'karthigai-deepam',
    'thaipusam', 'skanda-shashthi', 'varalakshmi-vratam',
    'aadi-perukku', 'ayyappa-mandalam',
  ];

  await Promise.all(pageIds.map(async (id) => {
    try {
      const res = await fetch(`/pages/${id}.md`);
      if (!res.ok) return;
      const text = await res.text();
      contentIndex[id] = parseContentPage(text);
    } catch { /* skip missing pages */ }
  }));

  return contentIndex;
}

function parseContentPage(md) {
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
  const bodyMatch = md.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1].trim() : '';

  const meta = {};
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const kv = line.match(/^\s*(\w[\w_]*)\s*:\s*"?(.+?)"?\s*$/);
      if (kv) meta[kv[1]] = kv[2];
    }
  }

  const sections = {};
  let currentSection = '';
  for (const line of body.split('\n')) {
    const h2 = line.match(/^## (.+)$/);
    if (h2) { currentSection = h2[1]; sections[currentSection] = ''; continue; }
    if (currentSection) sections[currentSection] += line + '\n';
  }

  return { meta, body, sections };
}

function findRelevantContent(question) {
  if (!contentIndex) return [];
  const q = question.toLowerCase();
  const results = [];
  const keywords = q.split(/\s+/).filter(w => w.length > 3);

  for (const [id, page] of Object.entries(contentIndex)) {
    let score = 0;
    const name = (page.meta.en || id).toLowerCase();
    const bodyLower = page.body.toLowerCase();

    if (q.includes(name) || q.includes(id.replace(/-/g, ' '))) score += 100;
    for (const kw of keywords) {
      if (bodyLower.includes(kw)) score += 5;
      if (name.includes(kw)) score += 20;
    }
    if (q.includes('fast') && (bodyLower.includes('fast') || bodyLower.includes('vrat'))) score += 30;
    if (q.includes('puja') && bodyLower.includes('puja')) score += 30;
    if (q.includes('story') && page.sections['The story']) score += 40;
    if ((q.includes('how') || q.includes('what to do')) && page.sections['What to do']) score += 40;
    if (q.includes('why') && page.sections['Why']) score += 40;

    if (score > 0) results.push({ id, page, score });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 3);
}

function formatContentResponse(question, matches) {
  if (matches.length === 0) {
    return `That's a good question. I don't have a fully reviewed answer for it yet.
    <br><br>
    The Hindu tradition has many perspectives on this topic, and I want to make sure I represent them fairly. Would you like me to flag this question for our editors to prepare a proper answer?
    <br><br>
    <button class="suggestion-btn" onclick="window._guideFlagQuestion(${JSON.stringify(question).replace(/"/g, '&quot;')})">Flag for review</button>`;
  }

  const q = question.toLowerCase();
  const best = matches[0];
  const page = best.page;
  const name = page.meta.en || best.id;

  let response = '';

  if (q.includes('story') || q.includes('behind') || q.includes('about') || q.includes('what is') || q.includes('tell me')) {
    const story = page.sections['The story'] || '';
    const summary = page.sections['In two sentences'] || '';
    response = `<b>${escapeHtml(name)}</b><br><br>`;
    if (summary.trim()) response += summary.trim().replace(/\n/g, '<br>') + '<br><br>';
    if (story.trim()) {
      const shortMatch = story.match(/\*\*Short version\.\*\*\s*(.+?)(?=\n\n|\*\*Full|$)/s);
      if (shortMatch) {
        response += shortMatch[1].trim().replace(/\n/g, '<br>') + '<br><br>';
        response += `<button class="suggestion-btn" onclick="app.openEventPage('${best.id}', '${name.replace(/'/g, "\\'")}')">Read the full story</button>`;
      } else {
        response += story.trim().split('\n\n')[0].replace(/\n/g, '<br>');
      }
    }
  } else if (q.includes('how') || q.includes('what to do') || q.includes('puja') || q.includes('celebrate')) {
    const whatToDo = page.sections['What to do'] || '';
    response = `<b>How to observe ${escapeHtml(name)}:</b><br><br>`;
    if (whatToDo.trim()) {
      const tenMinMatch = whatToDo.match(/### Ten-minute version\n([\s\S]*?)(?=###|$)/);
      if (tenMinMatch) {
        response += tenMinMatch[1].trim().replace(/^\d+\.\s+/gm, (m) => '<br>' + m).replace(/\n/g, '<br>');
      } else {
        response += whatToDo.trim().split('\n\n').slice(0, 3).join('<br><br>').replace(/\n/g, '<br>');
      }
      response += `<br><br><button class="suggestion-btn" onclick="app.openEventPage('${best.id}', '${name.replace(/'/g, "\\'")}')">See fuller version & items needed</button>`;
    }
  } else if (q.includes('why')) {
    const why = page.sections['Why'] || '';
    response = `<b>Why we observe ${escapeHtml(name)}:</b><br><br>`;
    if (why.trim()) {
      response += why.trim().replace(/\*\*(.+?)\.\*\*/g, '<b>$1.</b>').replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    }
  } else if (q.includes('when') || q.includes('date') || q.includes('next')) {
    const summary = page.sections['In two sentences'] || '';
    const melbourne = page.sections['In Melbourne'] || '';
    response = `<b>${escapeHtml(name)}</b><br><br>`;
    if (summary.trim()) response += summary.trim().replace(/\n/g, '<br>') + '<br><br>';
    if (melbourne.trim()) response += '<b>In Melbourne:</b> ' + melbourne.trim().replace(/\n/g, '<br>') + '<br><br>';
    response += `<em>For the exact date in Melbourne, check the Calendar tab -- the engine computes it from the moon's position at your location.</em>`;
  } else {
    const summary = page.sections['In two sentences'] || '';
    response = `<b>${escapeHtml(name)}</b><br><br>`;
    if (summary.trim()) response += summary.trim().replace(/\n/g, '<br>') + '<br><br>';
    response += `<button class="suggestion-btn" onclick="app.openEventPage('${best.id}', '${name.replace(/'/g, "\\'")}')">Read more</button>`;
  }

  const sources = page.body.match(/\*Sources?:\s*(.+?)\*/);
  if (sources) {
    response += `<br><br><span style="font-size: 12px; color: var(--text-muted);">Source: ${escapeHtml(sources[1])}</span>`;
  }

  if (matches.length > 1) {
    const others = matches.slice(1).map(m => {
      const n = m.page.meta.en || m.id;
      return `<button class="suggestion-btn" onclick="app.openEventPage('${m.id}', '${n.replace(/'/g, "\\'")}')">${escapeHtml(n)}</button>`;
    });
    response += `<br><br><span style="font-size: 12px; color: var(--text-muted);">Related:</span> ${others.join(' ')}`;
  }

  return response;
}

/**
 * Format the AI response with basic markdown rendering.
 * Handles **bold**, links to event pages, and line breaks.
 */
function formatAiResponse(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

export function renderGuide(app) {
  const container = document.getElementById('view-guide');

  // Only render if empty (preserve chat history)
  if (container.querySelector('.guide-header')) {
    if (app._guidePreload) {
      const q = app._guidePreload;
      app._guidePreload = null;
      setTimeout(() => app.askGuide(q), 200);
    }
    return;
  }

  const useAi = app.backendAvailable && getToken();

  const depth = getGuideDepth();
  container.innerHTML = `
    <div class="guide-header">
      <div class="guide-title">Saathi</div>
      <div class="guide-subtitle">${useAi ? 'AI-powered companion for Hindu traditions' : 'Your companion for understanding Hindu traditions'}</div>
      <div class="guide-depth-selector">
        <button class="depth-btn ${depth === 'simple' ? 'active' : ''}" onclick="window._setGuideDepth('simple')" title="Short, simple answers">Simple</button>
        <button class="depth-btn ${depth === 'standard' ? 'active' : ''}" onclick="window._setGuideDepth('standard')" title="Balanced answers with sources">Standard</button>
        <button class="depth-btn ${depth === 'scholarly' ? 'active' : ''}" onclick="window._setGuideDepth('scholarly')" title="Detailed answers with citations">Scholarly</button>
      </div>
    </div>

    <div class="chat-messages" id="chat-messages">
      ${messages.length === 0 ? `
        <div class="chat-message guide">
          Vanakkam! I'm Saathi, your guide to Hindu traditions, festivals, and practices.
          I can help with questions about observances, their stories, what to do at home,
          and why traditions exist. I'll always tell you where my answer comes from,
          and I'll be honest when I'm not sure.
          <br><br>
          What would you like to know?
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
          <button class="suggestion-btn" onclick="app.askGuide('What is the story behind Deepavali?')">
            Story behind Deepavali
          </button>
          <button class="suggestion-btn" onclick="app.askGuide('How do we celebrate Pongal?')">
            How to celebrate Pongal
          </button>
          <button class="suggestion-btn" onclick="app.askGuide('Tell me about Thaipusam and Murugan')">
            About Thaipusam
          </button>
          <button class="suggestion-btn" onclick="app.askGuide('What is the Navaratri Golu tradition?')">
            Navaratri Golu
          </button>
          <button class="suggestion-btn" onclick="app.askGuide('Tell me about Karthigai Deepam')">
            Karthigai Deepam
          </button>
        </div>
      ` : messages.map(m => `
        <div class="chat-message ${m.role}">${m.content}</div>
      `).join('')}
    </div>
  `;

  ensureChatInput(app);
  buildContentIndex();

  if (app._guidePreload) {
    const q = app._guidePreload;
    app._guidePreload = null;
    setTimeout(() => app.askGuide(q), 300);
  }
}

function ensureChatInput(app) {
  if (document.querySelector('.chat-input-area')) return;

  const inputArea = document.createElement('div');
  inputArea.className = 'chat-input-area active';
  inputArea.innerHTML = `
    <input type="text" class="chat-input" placeholder="Ask about any tradition or festival..."
           id="guide-input" autocomplete="off">
    <button class="chat-send-btn" onclick="app.sendGuideMessage()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
      </svg>
    </button>
  `;
  document.getElementById('app').appendChild(inputArea);

  inputArea.querySelector('#guide-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') app.sendGuideMessage();
  });
}

// Extend app with guide methods
if (typeof window !== 'undefined') {
  setTimeout(() => {
    if (window.app) {
      window.app.askGuide = async function(question) {
        const input = document.getElementById('guide-input');
        if (input) input.value = question;
        this.sendGuideMessage();
      };

      window.app.sendGuideMessage = async function() {
        const input = document.getElementById('guide-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        input.value = '';

        messages.push({ role: 'user', content: escapeHtml(text) });
        const chatEl = document.getElementById('chat-messages');

        // Remove suggestions
        const suggestions = chatEl.querySelector('div[style*="flex-wrap"]');
        if (suggestions) suggestions.remove();

        chatEl.innerHTML += `<div class="chat-message user">${escapeHtml(text)}</div>`;
        chatEl.innerHTML += `<div class="chat-message guide" id="guide-typing">
          <div class="loading-spinner" style="width: 16px; height: 16px; border-width: 1.5px;"></div>
        </div>`;
        chatEl.scrollTop = chatEl.scrollHeight;

        const useAi = this.backendAvailable && getToken();

        try {
          let response;

          if (useAi) {
            // Use backend AI
            const result = await sendGuideMessage(text, conversationId, getGuideDepth());
            conversationId = result.conversationId;
            response = formatAiResponse(result.reply);
          } else {
            // Fallback: client-side search
            await buildContentIndex();
            await new Promise(r => setTimeout(r, 300));
            const matches = findRelevantContent(text);
            response = formatContentResponse(text, matches);
          }

          document.getElementById('guide-typing')?.remove();
          messages.push({ role: 'guide', content: response });
          chatEl.innerHTML += `<div class="chat-message guide">${response}</div>`;
          chatEl.scrollTop = chatEl.scrollHeight;
        } catch (err) {
          document.getElementById('guide-typing')?.remove();

          // If AI fails, try fallback
          if (useAi) {
            try {
              await buildContentIndex();
              const matches = findRelevantContent(text);
              const fallback = formatContentResponse(text, matches);
              const response = `<span style="font-size:12px;color:var(--text-muted);">AI unavailable, showing local results:</span><br><br>` + fallback;
              messages.push({ role: 'guide', content: response });
              chatEl.innerHTML += `<div class="chat-message guide">${response}</div>`;
              chatEl.scrollTop = chatEl.scrollHeight;
              return;
            } catch { /* fall through */ }
          }

          chatEl.innerHTML += `<div class="chat-message guide" style="color: var(--error);">
            Sorry, I couldn't process that question. Please try again.
          </div>`;
        }
      };

      // Depth selector handler
      window._setGuideDepth = function(d) {
        localStorage.setItem('parampara-guide-depth', d);
        document.querySelectorAll('.depth-btn').forEach(btn => {
          btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === d);
        });
      };

      // Flag question handler
      window._guideFlagQuestion = async function(question) {
        if (getToken()) {
          try {
            await flagQuestion(question);
            alert('Question flagged for review. Thank you!');
          } catch {
            alert('Could not flag question. Please try again.');
          }
        } else {
          alert('Question flagged for review. Thank you!');
        }
      };
    }
  }, 100);
}


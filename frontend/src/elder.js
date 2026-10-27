/**
 * Elder Wisdom - A dedicated recording page for elders.
 *
 * Designed for simplicity: large buttons, voice-first input,
 * Web Speech API for live transcription, falls back to manual typing.
 * Elders can freely share traditions, stories, and recipes.
 * Content is saved as family notes and available to the AI guide.
 */

import { createNote, uploadNoteFile, getToken } from './api.js';

let _recognition = null;
let _transcript = '';
let _isRecording = false;
let _mediaRecorder = null;
let _audioChunks = [];

function getSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-AU';
  return recognition;
}

export function renderElderWisdom(app) {
  const container = document.getElementById('main-content');

  if (!getToken()) {
    container.innerHTML = `
      <div class="view active" style="padding: 16px;">
        <div class="event-back" onclick="app.closeEventPage()">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 10H5M5 10l5-5M5 10l5 5"/>
          </svg>
          Back
        </div>
        <div class="elder-wisdom-page">
          <h1 class="event-title">Elder Wisdom</h1>
          <div class="info-card" style="text-align:center;">
            <p style="color:var(--text-secondary);">Sign in to record elder stories and traditions.</p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="view active" style="padding: 16px;">
      <div class="event-back" onclick="app.closeEventPage()">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 10H5M5 10l5-5M5 10l5 5"/>
        </svg>
        Back
      </div>
      <div class="elder-wisdom-page">
        <h1 class="event-title">Elder Wisdom</h1>
        <p class="elder-wisdom-intro">Hand the phone to an elder, or sit with them. They can speak freely about any tradition, story, or recipe. We'll save it for your family.</p>

        <div class="info-card elder-wisdom-topic">
          <label class="settings-label">What is this about?</label>
          <select id="elder-topic" class="settings-select">
            <option value="">Choose an observance (optional)</option>
            <option value="pongal">Pongal</option>
            <option value="deepavali">Deepavali</option>
            <option value="navaratri-golu">Navaratri Golu</option>
            <option value="karthigai-deepam">Karthigai Deepam</option>
            <option value="thaipusam">Thaipusam</option>
            <option value="varalakshmi-vratam">Varalakshmi Vratam</option>
            <option value="vinayagar-chaturthi">Vinayagar Chaturthi</option>
            <option value="maha-shivaratri">Maha Shivaratri</option>
            <option value="ekadashi">Ekadashi</option>
            <option value="pradosham">Pradosham</option>
            <option value="purnima">Purnima</option>
            <option value="amavasya">Amavasya</option>
            <option value="onam">Onam</option>
            <option value="ugadi">Ugadi / Puthandu / Vishu</option>
            <option value="skanda-shashthi">Skanda Shashthi</option>
            <option value="aadi-perukku">Aadi Perukku</option>
            <option value="ayyappa-mandalam">Ayyappa Mandalam</option>
            <option value="ram-navami">Sri Rama Navami</option>
            <option value="sankashti-chaturthi">Sankashti Chaturthi</option>
            <option value="_general">General family tradition</option>
            <option value="_recipe">Family recipe</option>
          </select>

          <label class="settings-label" style="margin-top:12px;">Who is sharing?</label>
          <input type="text" id="elder-name" class="settings-select" placeholder="e.g. Paatti, Thatha, Amma..." style="width:100%;box-sizing:border-box;">

          <label class="settings-label" style="margin-top:12px;">Share with</label>
          <select id="elder-visibility" class="settings-select">
            <option value="household">My household only</option>
            <option value="group">Everyone in the group</option>
          </select>
        </div>

        <div class="info-card elder-wisdom-record">
          <div id="elder-record-status" class="elder-record-status">
            Tap the button below to start recording
          </div>
          <div id="elder-transcript" class="elder-transcript" style="display:none;"></div>
          <div class="elder-record-controls">
            <button id="elder-record-btn" class="elder-record-btn" onclick="window._elderStartRecording()">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
                <circle cx="16" cy="16" r="12"/>
              </svg>
              <span>Start Recording</span>
            </button>
          </div>
        </div>

        <div class="info-card elder-wisdom-type" style="margin-top:12px;">
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">Or type it out:</p>
          <textarea id="elder-typed-text" class="note-edit-area" rows="4" placeholder="Type what the elder shares..."></textarea>
        </div>

        <button id="elder-save-btn" class="elder-save-btn" onclick="window._elderSave()">
          Save This Story
        </button>
      </div>
    </div>
  `;
}

if (typeof window !== 'undefined') {
  window._elderStartRecording = async function() {
    const btn = document.getElementById('elder-record-btn');
    const status = document.getElementById('elder-record-status');
    const transcriptEl = document.getElementById('elder-transcript');

    if (_isRecording) {
      // Stop recording
      _isRecording = false;
      if (_recognition) { _recognition.stop(); _recognition = null; }
      if (_mediaRecorder && _mediaRecorder.state === 'recording') {
        _mediaRecorder.stop();
      }
      btn.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor"><circle cx="16" cy="16" r="12"/></svg>
        <span>Start Recording</span>
      `;
      btn.classList.remove('recording');
      status.textContent = 'Recording saved. You can record more or save.';
      return;
    }

    // Start recording
    _isRecording = true;
    _transcript = '';
    _audioChunks = [];

    btn.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor"><rect x="8" y="8" width="16" height="16" rx="2"/></svg>
      <span>Stop Recording</span>
    `;
    btn.classList.add('recording');
    status.textContent = 'Listening...';
    transcriptEl.style.display = 'block';
    transcriptEl.textContent = '';

    // Start speech recognition for live transcript
    const recognition = getSpeechRecognition();
    if (recognition) {
      _recognition = recognition;
      let finalTranscript = '';

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        _transcript = finalTranscript;
        transcriptEl.textContent = finalTranscript + (interim ? `...${interim}` : '');

        // Also put in the textarea
        const typed = document.getElementById('elder-typed-text');
        if (typed) typed.value = finalTranscript.trim();
      };

      recognition.onerror = (event) => {
        if (event.error !== 'no-speech') {
          status.textContent = `Speech recognition: ${event.error}. Audio is still recording.`;
        }
      };

      recognition.onend = () => {
        // Restart if still recording (recognition auto-stops sometimes)
        if (_isRecording && _recognition) {
          try { _recognition.start(); } catch { /* already started */ }
        }
      };

      try { recognition.start(); } catch { /* ok */ }
    } else {
      status.textContent = 'Recording audio... (Speech-to-text not available in this browser. Type along if you can.)';
    }

    // Start audio recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      _mediaRecorder = new MediaRecorder(stream);
      _mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) _audioChunks.push(e.data); };
      _mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
      };
      _mediaRecorder.start();
    } catch (err) {
      status.textContent = 'Microphone access denied. You can type instead.';
      _isRecording = false;
      btn.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor"><circle cx="16" cy="16" r="12"/></svg>
        <span>Start Recording</span>
      `;
      btn.classList.remove('recording');
    }
  };

  window._elderSave = async function() {
    const topic = document.getElementById('elder-topic')?.value;
    const elderName = document.getElementById('elder-name')?.value.trim();
    const visibility = document.getElementById('elder-visibility')?.value || 'household';
    const typedText = document.getElementById('elder-typed-text')?.value.trim();
    const saveBtn = document.getElementById('elder-save-btn');

    if (!topic) {
      alert('Please choose what this story is about.');
      return;
    }

    const observanceId = topic.startsWith('_') ? topic : topic;
    const hasAudio = _audioChunks.length > 0;
    const hasText = typedText.length > 0;

    if (!hasAudio && !hasText) {
      alert('Please record or type something first.');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      // Prefix with elder's name if given
      const prefix = elderName ? `From ${elderName}: ` : '';

      // Save text note
      if (hasText) {
        await createNote(observanceId, prefix + typedText, 'text', { scope: 'our_way', visibility });
      }

      // Save audio as voice note
      if (hasAudio) {
        const blob = new Blob(_audioChunks, { type: _mediaRecorder?.mimeType || 'audio/webm' });
        const ext = (_mediaRecorder?.mimeType || '').includes('mp4') ? '.m4a' : '.webm';
        const file = new File([blob], `elder-wisdom${ext}`, { type: blob.type });
        await uploadNoteFile(observanceId, file, 'voice', { scope: 'our_way', visibility });
      }

      // Clear state
      _audioChunks = [];
      _transcript = '';
      _isRecording = false;
      _mediaRecorder = null;

      // Show success
      saveBtn.textContent = 'Saved!';
      saveBtn.style.background = 'var(--success, #38a169)';

      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save This Story';
        saveBtn.style.background = '';
        // Reset the form
        document.getElementById('elder-typed-text').value = '';
        const transcriptEl = document.getElementById('elder-transcript');
        if (transcriptEl) { transcriptEl.style.display = 'none'; transcriptEl.textContent = ''; }
        document.getElementById('elder-record-status').textContent = 'Tap the button below to start recording';
      }, 2000);
    } catch (err) {
      alert('Could not save: ' + err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save This Story';
    }
  };
}

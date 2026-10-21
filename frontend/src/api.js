/**
 * API client for Parampara backend.
 * Handles auth tokens, guide chat, and family traditions.
 */

const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('parampara-token');
}

function setToken(token) {
  if (token) {
    localStorage.setItem('parampara-token', token);
  } else {
    localStorage.removeItem('parampara-token');
  }
}

function getUser() {
  const saved = localStorage.getItem('parampara-user');
  return saved ? JSON.parse(saved) : null;
}

function setUser(user) {
  if (user) {
    localStorage.setItem('parampara-user', JSON.stringify(user));
  } else {
    localStorage.removeItem('parampara-user');
  }
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    setToken(null);
    setUser(null);
    window.dispatchEvent(new Event('parampara-logout'));
    throw new Error('Session expired');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Auth
export async function requestMagicLink(email) {
  return apiFetch('/auth/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyMagicLink(token) {
  const data = await apiFetch('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  setToken(data.token);
  setUser(data.user);
  return data.user;
}

export async function bootstrapAdmin(code, email, name) {
  return apiFetch('/auth/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ code, email, name }),
  });
}

export async function getProfile() {
  return apiFetch('/auth/me');
}

export async function updateProfile(updates) {
  return apiFetch('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function logout() {
  try { await apiFetch('/auth/logout', { method: 'POST' }); } catch { /* ok */ }
  setToken(null);
  setUser(null);
}

export async function inviteUser(email, name) {
  return apiFetch('/auth/invite', {
    method: 'POST',
    body: JSON.stringify({ email, name }),
  });
}

export async function listUsers() {
  return apiFetch('/auth/users');
}

// Guide
export async function sendGuideMessage(message, conversationId) {
  return apiFetch('/guide/chat', {
    method: 'POST',
    body: JSON.stringify({ message, conversationId }),
  });
}

export async function flagQuestion(question, context) {
  return apiFetch('/guide/flag', {
    method: 'POST',
    body: JSON.stringify({ question, context }),
  });
}

// Family Notes
export async function getNotes(observanceId) {
  return apiFetch(`/traditions/${observanceId}`);
}

export async function getAllNotes() {
  return apiFetch('/traditions');
}

export async function createNote(observanceId, content, noteType = 'text') {
  return apiFetch('/traditions', {
    method: 'POST',
    body: JSON.stringify({ observanceId, content, noteType }),
  });
}

export async function updateNote(id, updates) {
  return apiFetch(`/traditions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function uploadNoteFile(observanceId, file, noteType) {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  form.append('observanceId', observanceId);
  form.append('noteType', noteType);

  const res = await fetch(`${API_BASE}/traditions/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (res.status === 401) {
    setToken(null); setUser(null);
    window.dispatchEvent(new Event('parampara-logout'));
    throw new Error('Session expired');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

export async function deleteNote(id) {
  return apiFetch(`/traditions/${id}`, {
    method: 'DELETE',
  });
}

// Health check
export async function checkBackend() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export { getToken, getUser, setToken, setUser };

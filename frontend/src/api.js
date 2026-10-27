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

export async function listHouseholds() {
  return apiFetch('/auth/households');
}

export async function assignHousehold(userId, householdId) {
  return apiFetch(`/auth/users/${userId}/household`, {
    method: 'PATCH',
    body: JSON.stringify({ householdId }),
  });
}

// Guide
export async function sendGuideMessage(message, conversationId, depth) {
  return apiFetch('/guide/chat', {
    method: 'POST',
    body: JSON.stringify({ message, conversationId, depth }),
  });
}

export async function flagQuestion(question, context) {
  return apiFetch('/guide/flag', {
    method: 'POST',
    body: JSON.stringify({ question, context }),
  });
}

// Family Notes
export async function getNotes(observanceId, scope) {
  const qs = scope ? `?scope=${scope}` : '';
  return apiFetch(`/traditions/${observanceId}${qs}`);
}

export async function getAllNotes(scope) {
  const qs = scope ? `?scope=${scope}` : '';
  return apiFetch(`/traditions${qs}`);
}

export async function createNote(observanceId, content, noteType = 'text', { scope = 'our_way', visibility = 'household', occurrenceYear } = {}) {
  return apiFetch('/traditions', {
    method: 'POST',
    body: JSON.stringify({ observanceId, content, noteType, scope, visibility, occurrenceYear }),
  });
}

export async function updateNote(id, updates) {
  return apiFetch(`/traditions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function uploadNoteFile(observanceId, file, noteType, { scope = 'our_way', visibility = 'household' } = {}) {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  form.append('observanceId', observanceId);
  form.append('noteType', noteType);
  form.append('scope', scope);
  form.append('visibility', visibility);

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

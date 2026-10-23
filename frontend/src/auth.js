/**
 * Auth screen - Login with magic link or bootstrap admin.
 */

import { requestMagicLink, verifyMagicLink, bootstrapAdmin, checkBackend } from './api.js';

export function renderAuth(onLogin) {
  const app = document.getElementById('app');

  // Check for magic link token in URL
  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = params.get('token');
  if (tokenFromUrl) {
    verifyFromUrl(tokenFromUrl, onLogin);
    return;
  }

  app.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-logo">Parampara</div>
        <div class="auth-subtitle">Hindu calendar & tradition companion</div>

        <div id="auth-form">
          <div id="auth-status" class="auth-status"></div>

          <div class="auth-section">
            <label class="auth-label">Sign in with your email</label>
            <input type="email" id="auth-email" class="auth-input" placeholder="your@email.com" autocomplete="email">
            <button id="auth-send-btn" class="auth-btn" onclick="window._authSendLink()">Send sign-in link</button>
          </div>

          <div class="auth-divider"><span>or</span></div>

          <button class="auth-link-btn" onclick="window._authShowSetup()">First time? Set up admin account</button>
          <button class="auth-link-btn" onclick="window._authSkip()">Continue without signing in</button>
        </div>

        <div id="auth-setup" style="display:none;">
          <button class="auth-back-btn" onclick="window._authShowLogin()">&larr; Back</button>
          <div class="auth-section">
            <label class="auth-label">Admin Setup</label>
            <input type="text" id="setup-name" class="auth-input" placeholder="Your name">
            <input type="email" id="setup-email" class="auth-input" placeholder="your@email.com">
            <input type="text" id="setup-code" class="auth-input" placeholder="Admin invite code">
            <button class="auth-btn" onclick="window._authBootstrap()">Create admin account</button>
          </div>
        </div>

        <div id="auth-check-sent" style="display:none;">
          <div class="auth-check-icon">&#9993;</div>
          <p>Check your email for a sign-in link.</p>
          <p class="auth-hint">The link expires in 15 minutes.</p>
          <div id="auth-dev-token" style="display:none;"></div>
          <button class="auth-link-btn" onclick="window._authShowLogin()">Try a different email</button>
        </div>
      </div>
    </div>
  `;

  window._authSendLink = async () => {
    const email = document.getElementById('auth-email').value.trim();
    if (!email) return showStatus('Enter your email address', 'error');

    const btn = document.getElementById('auth-send-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      const result = await requestMagicLink(email);
      document.getElementById('auth-form').style.display = 'none';
      document.getElementById('auth-check-sent').style.display = 'block';

      // Dev mode: show token for easy testing
      if (result.token) {
        const devDiv = document.getElementById('auth-dev-token');
        devDiv.style.display = 'block';
        devDiv.innerHTML = `
          <div class="auth-dev-notice">
            <b>Dev mode:</b> Click to sign in directly
            <button class="auth-btn" style="margin-top:8px;" onclick="window._authVerifyDev('${result.token}')">Sign in (dev)</button>
          </div>
        `;
      }
    } catch (err) {
      showStatus(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Send sign-in link';
    }
  };

  window._authVerifyDev = async (token) => {
    try {
      const user = await verifyMagicLink(token);
      onLogin(user);
    } catch (err) {
      showStatus(err.message, 'error');
    }
  };

  window._authShowSetup = () => {
    document.getElementById('auth-form').style.display = 'none';
    document.getElementById('auth-setup').style.display = 'block';
  };

  window._authShowLogin = () => {
    document.getElementById('auth-form').style.display = 'block';
    document.getElementById('auth-setup').style.display = 'none';
    document.getElementById('auth-check-sent').style.display = 'none';
  };

  window._authBootstrap = async () => {
    const name = document.getElementById('setup-name').value.trim();
    const email = document.getElementById('setup-email').value.trim();
    const code = document.getElementById('setup-code').value.trim();
    if (!name || !email || !code) return showStatus('All fields required', 'error');

    try {
      await bootstrapAdmin(code, email, name);
      showStatus('Admin created! Now sign in with your email.', 'success');
      document.getElementById('auth-email').value = email;
      window._authShowLogin();
    } catch (err) {
      showStatus(err.message, 'error');
    }
  };

  window._authSkip = () => {
    onLogin(null); // null user = offline/guest mode
  };

  function showStatus(msg, type) {
    const el = document.getElementById('auth-status');
    el.textContent = msg;
    el.className = `auth-status ${type}`;
    el.style.display = 'block';
  }

  // Auto-focus email input
  setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
}

async function verifyFromUrl(token, onLogin) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-logo">Parampara</div>
        <div class="auth-subtitle">Signing you in...</div>
      </div>
    </div>
  `;

  try {
    const user = await verifyMagicLink(token);
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    onLogin(user);
  } catch (err) {
    app.querySelector('.auth-subtitle').textContent = `Sign-in failed: ${err.message}`;
    app.querySelector('.auth-card').innerHTML += `
      <button class="auth-btn" style="margin-top:16px;" onclick="location.href='/'">Try again</button>
    `;
  }
}

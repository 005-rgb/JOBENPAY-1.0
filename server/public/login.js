/* global document, window, sessionStorage, FormData */

const form = document.querySelector('#login-form');
const statusNode = document.querySelector('#form-status');
const submitButton = document.querySelector('#submit-button');

function setStatus(message, tone = '') {
  statusNode.textContent = message;
  if (tone) {
    statusNode.dataset.tone = tone;
    return;
  }
  delete statusNode.dataset.tone;
}

async function routeAuthenticatedUser() {
  try {
    const response = await fetch('/api/v1/auth/me', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    if (payload?.csrfToken) {
      sessionStorage.setItem('jp_csrf', payload.csrfToken);
    }
    window.location.replace('/dashboard');
  } catch {
    // Keep the user on the login screen when the session check cannot complete.
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  setStatus('Signing you in...');

  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');

  try {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      setStatus(payload?.message || 'Authentication failed.', 'danger');
      submitButton.disabled = false;
      return;
    }

    if (payload?.csrfToken) {
      sessionStorage.setItem('jp_csrf', payload.csrfToken);
    }

    setStatus('Login successful. Redirecting...', 'success');
    window.location.replace('/dashboard');
  } catch {
    setStatus('Unable to reach the server right now.', 'danger');
    submitButton.disabled = false;
  }
});

routeAuthenticatedUser();

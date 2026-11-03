/* global document, window, sessionStorage */

const identityChip = document.querySelector('#identity-chip');
const logoutButton = document.querySelector('#logout-button');

function assignText(id, value, extraClass = '') {
  const node = document.querySelector(`#${id}`);
  if (!node) {
    return;
  }

  node.textContent = value;
  if (extraClass) {
    node.classList.add(extraClass);
  }
}

async function loadSession() {
  const response = await fetch('/api/v1/auth/me', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    window.location.replace('/login');
    return null;
  }

  const payload = await response.json();
  if (payload?.csrfToken) {
    sessionStorage.setItem('jp_csrf', payload.csrfToken);
  }

  const frozen = Boolean(payload?.frozen);
  const displayName = payload?.user?.display_name || payload?.user?.email || 'Unknown user';
  const orgName = payload?.org?.name || 'No organization';
  const orgId = payload?.org?.id || 'Unavailable';
  const role = payload?.role || 'VIEWER';
  const aiMode = payload?.aiMode || 'unknown';

  identityChip.textContent = `${displayName} | ${role}`;
  assignText('metric-org', orgName);
  assignText('metric-role', role);
  assignText('metric-ai-mode', aiMode);
  assignText('metric-frozen', frozen ? 'Frozen' : 'Operational', frozen ? 'tone-frozen' : 'tone-live');
  assignText('detail-name', displayName);
  assignText('detail-email', payload?.user?.email || 'Unavailable');
  assignText('detail-org-id', orgId);
  assignText('detail-judge', payload?.isJudge ? 'Enabled' : 'Not enabled');
}

logoutButton?.addEventListener('click', async () => {
  logoutButton.disabled = true;
  const csrfToken = sessionStorage.getItem('jp_csrf') || '';

  try {
    const response = await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
        Accept: 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      logoutButton.disabled = false;
      return;
    }

    sessionStorage.removeItem('jp_csrf');
    window.location.replace('/login');
  } catch {
    logoutButton.disabled = false;
  }
});

loadSession();

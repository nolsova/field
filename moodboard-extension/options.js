// options.js

const moodboardUrlInput = document.getElementById('moodboardUrl');
const apiKeyInput = document.getElementById('apiKey');
const accessClientIdInput = document.getElementById('accessClientId');
const accessClientSecretInput = document.getElementById('accessClientSecret');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const status = document.getElementById('status');

// Load saved settings on open
chrome.storage.local.get(
  ['moodboardUrl', 'apiKey', 'accessClientId', 'accessClientSecret'],
  ({ moodboardUrl, apiKey, accessClientId, accessClientSecret }) => {
    if (moodboardUrl) moodboardUrlInput.value = moodboardUrl;
    if (apiKey) apiKeyInput.value = apiKey;
    if (accessClientId) accessClientIdInput.value = accessClientId;
    if (accessClientSecret) accessClientSecretInput.value = accessClientSecret;
  }
);

saveBtn.addEventListener('click', async () => {
  const url = moodboardUrlInput.value.trim().replace(/\/$/, '');
  const key = apiKeyInput.value.trim();
  const accessClientId = accessClientIdInput.value.trim();
  const accessClientSecret = accessClientSecretInput.value.trim();

  if (!url || !key || !accessClientId || !accessClientSecret) {
    showStatus('All fields are required — the site is now behind Cloudflare Access.', 'error');
    return;
  }

  await chrome.storage.local.set({ moodboardUrl: url, apiKey: key, accessClientId, accessClientSecret });
  showStatus('Settings saved.', 'success');
});

// Test connection by hitting /api/images — a safe read-only endpoint
// that should return a response if the URL and network are correct.
// The site now sits behind Cloudflare Access, so even this read-only
// request needs the service token headers to get past the Access wall.
testBtn.addEventListener('click', async () => {
  const url = moodboardUrlInput.value.trim().replace(/\/$/, '');
  const key = apiKeyInput.value.trim();
  const accessClientId = accessClientIdInput.value.trim();
  const accessClientSecret = accessClientSecretInput.value.trim();

  if (!url) {
    showStatus('Enter your moodboard URL first.', 'error');
    return;
  }

  showStatus('testing…', '');

  try {
    const res = await fetch(`${url}/api/images`, {
      headers: {
        'CF-Access-Client-Id': accessClientId,
        'CF-Access-Client-Secret': accessClientSecret,
      },
    });
    if (res.ok) {
      const data = await res.json();
      showStatus(`Connected ✓ — ${data.images?.length ?? 0} images in your collection.`, 'success');
    } else {
      showStatus(`Server returned ${res.status}. Check your URL.`, 'error');
    }
  } catch (err) {
    showStatus(`Could not reach ${url}. Check the URL and try again.`, 'error');
  }
});

function showStatus(msg, type) {
  status.textContent = msg;
  status.className = type;
}

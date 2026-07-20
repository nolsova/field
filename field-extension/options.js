// options.js

const moodboardUrlInput = document.getElementById('moodboardUrl');
const apiKeyInput = document.getElementById('apiKey');
const accessClientIdInput = document.getElementById('accessClientId');
const accessClientSecretInput = document.getElementById('accessClientSecret');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const status = document.getElementById('status');

const modeCloudBtn = document.getElementById('modeCloudBtn');
const modeLocalBtn = document.getElementById('modeLocalBtn');
const cloudFields = document.getElementById('cloudFields');
const urlHint = document.getElementById('urlHint');

// ===== Mode toggle =====
// 'cloud'  — field running on Cloudflare, needs the API key + Access
//            service token headers to get past Cloudflare Access.
// 'local'  — field running on the person's own Mac via the local server.
//            No auth of any kind is needed: a server that only listens
//            on someone's own network has no strangers to defend against,
//            so the key/token fields are hidden and simply not sent.
let currentMode = 'cloud';

function setMode(mode) {
  currentMode = mode;
  modeCloudBtn.classList.toggle('active', mode === 'cloud');
  modeLocalBtn.classList.toggle('active', mode === 'local');
  cloudFields.classList.toggle('visible', mode === 'cloud');

  urlHint.textContent = mode === 'cloud'
    ? 'The URL of your deployed field app — no trailing slash.'
    : 'Find this on the laptop running field: open the phone icon in the header, or the /connect page, for the exact address (e.g. http://192.168.1.42:3333).';
}

modeCloudBtn.addEventListener('click', () => setMode('cloud'));
modeLocalBtn.addEventListener('click', () => setMode('local'));

// Load saved settings on open
chrome.storage.local.get(
  ['mode', 'moodboardUrl', 'apiKey', 'accessClientId', 'accessClientSecret'],
  ({ mode, moodboardUrl, apiKey, accessClientId, accessClientSecret }) => {
    setMode(mode === 'local' ? 'local' : 'cloud'); // default to cloud for anyone upgrading from before this existed
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

  if (!url) {
    showStatus('Enter your field URL first.', 'error');
    return;
  }

  // Only the cloud mode needs the extra credentials — local mode has
  // nothing to authenticate against.
  if (currentMode === 'cloud' && (!key || !accessClientId || !accessClientSecret)) {
    showStatus('All fields are required for cloud mode — the site sits behind Cloudflare Access.', 'error');
    return;
  }

  await chrome.storage.local.set({
    mode: currentMode,
    moodboardUrl: url,
    apiKey: key,
    accessClientId,
    accessClientSecret,
  });
  showStatus('Settings saved.', 'success');
});

// Test connection by hitting /api/images — a safe read-only endpoint
// that should return a response if the URL and network are correct.
// Cloud mode needs the Access service token headers to get past
// Cloudflare Access; local mode sends nothing extra at all.
testBtn.addEventListener('click', async () => {
  const url = moodboardUrlInput.value.trim().replace(/\/$/, '');
  const accessClientId = accessClientIdInput.value.trim();
  const accessClientSecret = accessClientSecretInput.value.trim();

  if (!url) {
    showStatus('Enter your field URL first.', 'error');
    return;
  }

  showStatus('testing…', '');

  try {
    const headers = currentMode === 'cloud'
      ? { 'CF-Access-Client-Id': accessClientId, 'CF-Access-Client-Secret': accessClientSecret }
      : {};

    const res = await fetch(`${url}/api/images`, { headers });
    if (res.ok) {
      const data = await res.json();
      showStatus(`Connected ✓ — ${data.images?.length ?? 0} images in your collection.`, 'success');
    } else {
      showStatus(`Server returned ${res.status}. Check your URL.`, 'error');
    }
  } catch (err) {
    showStatus(
      currentMode === 'local'
        ? `Could not reach ${url}. Is field running on your Mac right now, and is this device on the same WiFi?`
        : `Could not reach ${url}. Check the URL and try again.`,
      'error'
    );
  }
});

function showStatus(msg, type) {
  status.textContent = msg;
  status.className = type;
}

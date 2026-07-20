// popup.js
//
// Handles the image picker popup UI. When opened:
// 1. Asks the content script to find all images on the current page
// 2. Renders them as a selectable grid
// 3. Lets the user pick images and add tags
// 4. Sends the selection to background.js which handles the actual upload

const imageGrid = document.getElementById('imageGrid');
const stateMsg = document.getElementById('stateMsg');
const footer = document.getElementById('footer');
const saveBtn = document.getElementById('saveBtn');
const selectedCountEl = document.getElementById('selectedCount');
const statusMsg = document.getElementById('statusMsg');
const settingsBtn = document.getElementById('settingsBtn');

let selectedImages = new Set(); // set of image src URLs
let pageImages = [];            // full list of images found on the page
let pageUrl = '';
let pageTitle = '';
let tagChips = [];              // current tag list managed by the chip input

// --- Settings button ---
settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// --- Check extension is configured before doing anything else ---
// What "configured" means depends on the saved mode:
//   local  — only a URL is needed, nothing to authenticate against
//   cloud  — URL + API key + Access service token, same as before
// Anyone who saved settings before "mode" existed is implicitly cloud —
// matches the same default used in options.js and background.js.
async function checkConfig() {
  const { mode, moodboardUrl, apiKey } = await chrome.storage.local.get(['mode', 'moodboardUrl', 'apiKey']);
  const effectiveMode = mode === 'local' ? 'local' : 'cloud';
  const configured = effectiveMode === 'local'
    ? Boolean(moodboardUrl)
    : Boolean(moodboardUrl && apiKey);

  if (!configured) {
    stateMsg.innerHTML = 'Extension not set up yet.<br><br><a href="#" id="openSettings" style="color: #d4cfc4;">Open settings →</a>';
    document.getElementById('openSettings')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    return false;
  }
  return true;
}

// --- Scan the current tab for images ---
async function scanPage() {
  const configured = await checkConfig();
  if (!configured) return;

  // Ask the content script running on the active tab to find all images.
  // We use scripting.executeScript as a fallback in case the content script
  // didn't load (e.g. on chrome:// pages or pages that loaded before the
  // extension was installed).
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'get-page-images' });
    pageImages = response.images || [];
    pageUrl = response.pageUrl || tab.url || '';
    pageTitle = response.pageTitle || tab.title || '';
  } catch (err) {
    // Content script not reachable on this page (e.g. a browser internal page)
    stateMsg.textContent = 'Can\'t scan this page. Try on a regular website.';
    return;
  }

  if (pageImages.length === 0) {
    stateMsg.textContent = 'No images found on this page.';
    return;
  }

  renderGrid(pageImages);
}

// --- Render image grid ---
function renderGrid(images) {
  stateMsg.style.display = 'none';
  imageGrid.style.display = 'grid';
  footer.style.display = 'flex';
  imageGrid.innerHTML = '';

  images.forEach((img) => {
    const tile = document.createElement('div');
    tile.className = 'img-tile';
    tile.title = img.alt || img.src;

    const imgEl = document.createElement('img');
    imgEl.src = img.src;
    imgEl.alt = img.alt || '';
    imgEl.loading = 'lazy';

    const check = document.createElement('div');
    check.className = 'check';
    check.textContent = '✓';

    tile.appendChild(imgEl);
    tile.appendChild(check);

    tile.addEventListener('click', () => toggleSelect(img.src, tile));
    imageGrid.appendChild(tile);
  });

  setupTagChipInput();
}

// --- Selection logic ---
function toggleSelect(src, tile) {
  if (selectedImages.has(src)) {
    selectedImages.delete(src);
    tile.classList.remove('selected');
  } else {
    selectedImages.add(src);
    tile.classList.add('selected');
  }
  updateFooter();
}

function updateFooter() {
  const count = selectedImages.size;
  selectedCountEl.textContent = `${count} selected`;
  saveBtn.disabled = count === 0;
}

// --- Chip tag input (same logic as the main app) ---
function setupTagChipInput() {
  const container = document.getElementById('tagChipInput');
  tagChips = [];

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'chip-text-input';
  textInput.placeholder = 'add a tag…';

  function render() {
    container.innerHTML = '';
    tagChips.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `<span>${tag}</span>`;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'chip-remove';
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        tagChips = tagChips.filter((t) => t !== tag);
        render();
      });

      chip.appendChild(removeBtn);
      container.appendChild(chip);
    });
    container.appendChild(textInput);
    textInput.placeholder = tagChips.length ? '' : 'add a tag…';
  }

  function commit() {
    const raw = textInput.value.trim().toLowerCase();
    if (raw && !tagChips.includes(raw)) tagChips.push(raw);
    textInput.value = '';
    render();
    textInput.focus();
  }

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    else if (e.key === 'Backspace' && textInput.value === '' && tagChips.length > 0) {
      tagChips = tagChips.slice(0, -1);
      render();
    }
  });

  textInput.addEventListener('blur', () => { if (textInput.value.trim()) commit(); });
  container.addEventListener('click', () => textInput.focus());
  render();
}

// --- Save selected images ---
saveBtn.addEventListener('click', async () => {
  if (selectedImages.size === 0) return;

  saveBtn.disabled = true;
  statusMsg.className = '';
  statusMsg.textContent = `saving ${selectedImages.size} image${selectedImages.size > 1 ? 's' : ''}…`;

  const notesValue = document.getElementById('notesInput').value.trim();

  // Find the bounding rect for each selected image so background.js can
  // crop the screenshot fallback to just that image's area if needed.
  const imageRects = {};
  pageImages.forEach((img) => {
    if (selectedImages.has(img.src)) {
      imageRects[img.src] = img.rect || null;
    }
  });

  const imagesToSave = Array.from(selectedImages).map((src) => ({
    imageUrl: src,
    pageUrl,
    pageTitle,
    tags: [...tagChips],
    notes: notesValue,
    rect: imageRects[src] || null,
  }));

  const response = await chrome.runtime.sendMessage({
    type: 'save-images',
    images: imagesToSave,
  });

  if (response.success) {
    const failed = response.results.filter((r) => !r.success);
    const usedFallback = response.results.filter((r) => r.usedFallback);
    if (failed.length === 0) {
      statusMsg.className = 'success';
      statusMsg.textContent = usedFallback.length > 0
        ? `saved ✓ (${usedFallback.length} via screenshot)`
        : 'saved! ✓';
      selectedImages.clear();
      document.querySelectorAll('.img-tile.selected').forEach((t) => t.classList.remove('selected'));
      document.getElementById('notesInput').value = '';
      updateFooter();
    } else {
      statusMsg.className = 'error';
      statusMsg.textContent = `${failed.length} failed to save`;
    }
  } else {
    statusMsg.className = 'error';
    statusMsg.textContent = `error: ${response.error}`;
  }

  saveBtn.disabled = selectedImages.size === 0;
});

// --- Kick things off ---
scanPage();

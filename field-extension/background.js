// background.js
//
// The service worker that runs persistently in the background.
// Responsibilities:
// 1. Creates the right-click context menu item on install
// 2. Handles right-click saves (context menu clicks)
// 3. Handles messages from popup.js when saving from the picker
// 4. Falls back to a screenshot crop if direct image fetch is blocked

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-field",
    title: "Save to Field",
    contexts: ["image"],
  });
});

// Handle right-click "Save to Field" clicks.
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-to-field") return;

  await saveImageFromUrl({
    imageUrl: info.srcUrl,
    pageUrl: info.pageUrl,
    pageTitle: tab?.title || "",
    tags: [],
    notes: "",
    rect: null,
    tabId: tab?.id,
  });
});

// Handle messages from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "save-images") {
    // Get the active tab ID so we can capture a screenshot if needed
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;
      const results = await saveMultipleImages(message.images, tabId);
      sendResponse({ success: true, results });
    });
    return true;
  }
});

// Tries to save an image. First attempts a direct fetch of the image file.
// If that's blocked (cross-origin restriction, 403, etc.), falls back to
// capturing a screenshot of the tab and cropping it to the image's area.
async function saveImageFromUrl({ imageUrl, pageUrl, pageTitle, tags, notes, rect, tabId }) {
  const { mode, moodboardUrl, apiKey, accessClientId, accessClientSecret } = await chrome.storage.local.get([
    "mode",
    "moodboardUrl",
    "apiKey",
    "accessClientId",
    "accessClientSecret",
  ]);
  // Anyone who saved settings before "mode" existed is implicitly cloud —
  // matches the same default used in options.js.
  const effectiveMode = mode === "local" ? "local" : "cloud";

  // In LOCAL mode, only the URL is required — a server that only listens
  // on someone's own WiFi has no strangers to defend against, so there's
  // no key or Access token to check for. In CLOUD mode, the site sits
  // behind Cloudflare Access, so the extension needs its own service
  // token (separate from the human email-login flow) plus the API key.
  const configured = effectiveMode === "local"
    ? Boolean(moodboardUrl)
    : Boolean(moodboardUrl && apiKey && accessClientId && accessClientSecret);

  if (!configured) {
    chrome.runtime.openOptionsPage();
    return { error: "Not configured" };
  }

  // Build the source note automatically
  const sourceNote = [
    notes,
    `Source: ${pageUrl}`,
    pageTitle ? `Page: "${pageTitle}"` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let imageBlob = null;
  let usedFallback = false;

  // --- Attempt 1: direct fetch ---
  try {
    const response = await fetch(imageUrl, { mode: "cors" });
    if (response.ok) {
      imageBlob = await response.blob();
    }
  } catch (fetchErr) {
    // Cross-origin block or network error — try the screenshot fallback
    imageBlob = null;
  }

  // --- Attempt 2: screenshot crop ---
  // If the direct fetch failed AND we have a tab ID and bounding rect,
  // capture a screenshot of the visible tab and crop it to the image area.
  if (!imageBlob && tabId && rect) {
    try {
      imageBlob = await screenshotCrop(tabId, rect);
      usedFallback = true;
    } catch (ssErr) {
      throw new Error(`Could not save image: direct fetch blocked and screenshot failed (${ssErr.message})`);
    }
  }

  if (!imageBlob) {
    throw new Error("Could not download image — site may be blocking external access");
  }

  // Extract filename from URL, fall back to timestamp
  const filename = imageUrl.split("/").pop().split("?")[0] || `image-${Date.now()}.jpg`;
  const safeFilename = usedFallback ? `screenshot-${Date.now()}.jpg` : filename;

  const formData = new FormData();
  formData.append("image", imageBlob, safeFilename);
  formData.append("tags", tags.join(","));
  formData.append("notes", sourceNote);

  const uploadUrl = moodboardUrl.replace(/\/$/, "") + "/api/upload";
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: effectiveMode === "cloud"
      ? {
          "x-api-key": apiKey,
          "CF-Access-Client-Id": accessClientId,
          "CF-Access-Client-Secret": accessClientSecret,
        }
      : {}, // local mode: no auth of any kind needed
    body: formData,
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return { ...data, usedFallback };
}

// Captures the visible area of a tab and crops it to the given rect.
// rect is { top, left, width, height } in CSS pixels relative to the viewport.
async function screenshotCrop(tabId, rect) {
  // Capture the visible tab as a base64 PNG data URL
  const dataUrl = await chrome.tabs.captureVisibleTab(null, {
    format: "jpeg",
    quality: 85,
  });

  // To crop the screenshot we need to draw it onto a canvas and extract
  // just the portion that matches the image's bounding rect.
  // Service workers don't have access to the DOM or Canvas API directly,
  // so we inject a tiny helper script into the page to do the crop there,
  // then send the result back.
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: cropScreenshot,
    args: [dataUrl, rect],
  });

  if (!result?.result) throw new Error("Screenshot crop returned empty result");

  // Convert the returned base64 data URL back to a Blob
  const base64 = result.result.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

// This function runs INSIDE the page (injected via scripting.executeScript),
// so it has access to the DOM and Canvas API. It draws the screenshot onto
// a canvas and crops to the image's bounding rect, accounting for device
// pixel ratio (retina screens capture at 2x or 3x resolution).
function cropScreenshot(dataUrl, rect) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");

      ctx.drawImage(
        img,
        rect.left * dpr,
        rect.top * dpr,
        rect.width * dpr,
        rect.height * dpr,
        0,
        0,
        canvas.width,
        canvas.height
      );

      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  });
}

// Saves multiple images in sequence
async function saveMultipleImages(images, tabId) {
  const results = [];
  for (const img of images) {
    try {
      const result = await saveImageFromUrl({ ...img, tabId });
      results.push({ url: img.imageUrl, success: true, usedFallback: result.usedFallback, result });
    } catch (err) {
      results.push({ url: img.imageUrl, success: false, error: err.message });
    }
  }
  return results;
}

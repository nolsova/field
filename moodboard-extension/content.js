// content.js
//
// Runs on every page you visit. Its only job for now is to collect all
// the images on the page and return them when the popup asks for them.
// It also provides the page title and URL as source context.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get-page-images") {
    const images = collectPageImages();
    sendResponse({
      images,
      pageUrl: window.location.href,
      pageTitle: document.title,
    });
  }
});

function collectPageImages() {
  const seen = new Set();
  const results = [];

  // Collect <img> tags
  document.querySelectorAll("img").forEach((img) => {
    const src = img.src || img.currentSrc;
    if (!src || seen.has(src)) return;

    // Skip tiny images (icons, spacers, tracking pixels etc.)
    // Only include images that are at least 80x80px on screen.
    const rect = img.getBoundingClientRect();
    const naturalW = img.naturalWidth || 0;
    const naturalH = img.naturalHeight || 0;

    // Use the larger of rendered size vs natural size to decide
    const w = Math.max(rect.width, naturalW);
    const h = Math.max(rect.height, naturalH);
    if (w < 80 || h < 80) return;

    seen.add(src);
    results.push({
      src,
      alt: img.alt || "",
      width: Math.round(w),
      height: Math.round(h),
      // Include the bounding rect so background.js can crop a screenshot
      // to just this image's area if the direct fetch is blocked.
      rect: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  });

  // Also check CSS background-image on elements, since some sites render
  // images that way instead of <img> tags (Pinterest does this, for example).
  document.querySelectorAll("*").forEach((el) => {
    const style = window.getComputedStyle(el);
    const bg = style.backgroundImage;
    if (!bg || bg === "none") return;

    // Extract the URL from url("...") or url('...')
    const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
    if (!match) return;

    const src = match[1];
    if (seen.has(src)) return;

    const rect = el.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return;

    seen.add(src);
    results.push({
      src,
      alt: el.getAttribute("aria-label") || el.getAttribute("title") || "",
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  });

  // Sort by size (largest first) so the most likely "real" images
  // appear at the top of the picker grid rather than buried below icons.
  results.sort((a, b) => b.width * b.height - a.width * a.height);

  return results;
}

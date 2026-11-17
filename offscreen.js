// CopyScreen offscreen document: crops the screenshot, runs Tesseract OCR,
// and writes the result to the clipboard.

// Read at native resolution first (fast, and best for normal-size text). Only
// when Tesseract is unsure AND the area is small (so it stays cheap) retry at
// 2x, which rescues tiny text (~13px and below). Thresholds from benchmarks.
const RETRY_BELOW_CONFIDENCE = 93;
const RETRY_MAX_PIXELS = 600_000;

// We only use the plain text; skip building hOCR/TSV/block structures.
const TEXT_ONLY = { text: true, blocks: false, hocr: false, tsv: false };

let workerPromise = null;

function getWorker() {
  workerPromise ??= Tesseract.createWorker('eng', 1, {
    workerPath: chrome.runtime.getURL('lib/tesseract/worker.min.js'),
    corePath: chrome.runtime.getURL('lib/tesseract/core'),
    langPath: chrome.runtime.getURL('lib/tesseract/lang'),
    workerBlobURL: false, // blob: workers are blocked by the extension CSP
    cacheMethod: 'none',
    gzip: true,
  }).catch((err) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'cs-offscreen') return;
  if (msg.type === 'warmup') {
    getWorker().then(() => sendResponse({ ok: true }), (err) => sendResponse({ error: String(err) }));
    return true;
  }
  if (msg.type === 'ocr') {
    recognize(msg).then(sendResponse, (err) => sendResponse({ error: String(err?.message || err) }));
    return true;
  }
});

async function recognize({ dataUrl, rect, viewportWidth }) {
  const [region, worker] = await Promise.all([crop(dataUrl, rect, viewportWidth), getWorker()]);

  let { data } = await worker.recognize(prepare(region, 1), {}, TEXT_ONLY);
  if (data.confidence < RETRY_BELOW_CONFIDENCE && region.width * region.height <= RETRY_MAX_PIXELS) {
    const retry = (await worker.recognize(prepare(region, 2), {}, TEXT_ONLY)).data;
    if (retry.confidence > data.confidence) data = retry;
  }
  region.close();

  const text = data.text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  const copied = text ? copyToClipboard(text) : false;
  return { text, copied };
}

// Cut the selected region out of the screenshot (as an ImageBitmap).
async function crop(dataUrl, rect, viewportWidth) {
  const blob = await (await fetch(dataUrl)).blob();
  const img = await createImageBitmap(blob);
  // Screenshot pixels per CSS pixel (covers devicePixelRatio and page zoom).
  const scale = img.width / viewportWidth;
  const sx = Math.max(0, Math.round(rect.x * scale));
  const sy = Math.max(0, Math.round(rect.y * scale));
  const sw = Math.max(1, Math.min(img.width - sx, Math.round(rect.w * scale)));
  const sh = Math.max(1, Math.min(img.height - sy, Math.round(rect.h * scale)));
  const region = await createImageBitmap(img, sx, sy, sw, sh);
  img.close();
  return region;
}

// Grayscale, optionally upscaled. (Extra contrast measured slightly worse.)
function prepare(region, up) {
  const canvas = document.createElement('canvas');
  canvas.width = region.width * up;
  canvas.height = region.height * up;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = 'grayscale(1)';
  ctx.drawImage(region, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function copyToClipboard(text) {
  const ta = document.getElementById('clipboard');
  ta.value = text;
  ta.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.value = '';
  }
}

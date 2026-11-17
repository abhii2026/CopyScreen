// CopyScreen offscreen document: crops the screenshot, runs Tesseract OCR,
// and writes the result to the clipboard.

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
  if (msg?.target !== 'cs-offscreen' || msg.type !== 'ocr') return;
  recognize(msg).then(sendResponse, (err) => sendResponse({ error: String(err?.message || err) }));
  return true;
});

async function recognize({ dataUrl, rect, viewportWidth }) {
  const canvas = await crop(dataUrl, rect, viewportWidth);
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  const text = data.text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  const copied = text ? copyToClipboard(text) : false;
  return { text, copied };
}

async function crop(dataUrl, rect, viewportWidth) {
  const blob = await (await fetch(dataUrl)).blob();
  const img = await createImageBitmap(blob);
  // Screenshot pixels per CSS pixel (covers devicePixelRatio and page zoom).
  const scale = img.width / viewportWidth;

  const sx = Math.max(0, Math.round(rect.x * scale));
  const sy = Math.max(0, Math.round(rect.y * scale));
  const sw = Math.min(img.width - sx, Math.round(rect.w * scale));
  const sh = Math.min(img.height - sy, Math.round(rect.h * scale));

  // Upscale small regions; Tesseract does best with text ~30px+ tall.
  const up = sh < 400 ? 2 : 1;

  const canvas = document.createElement('canvas');
  canvas.width = sw * up;
  canvas.height = sh * up;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = 'grayscale(1) contrast(1.2)';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  img.close();
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

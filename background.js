// CopyScreen service worker: injects the marquee tool, captures the tab,
// and hands the screenshot to the offscreen document for OCR.

const OFFSCREEN_PATH = 'offscreen.html';

// Screenshots waiting for OCR, keyed by tab id.
const pendingShots = new Map();

// Icon / Alt+Shift+S: select a region -> editor (image copied, draw, copy text, save).
chrome.action.onClicked.addListener((tab) => start(tab, 'shot'));

// Alt+Shift+C: quick text-only copy, no editor.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'quick-copy-text' && tab) start(tab, 'text');
});

// mode: 'text' (OCR + copy text) or 'shot' (screenshot editor)
async function start(tab, mode) {
  const target = { tabId: tab.id };
  try {
    await chrome.scripting.executeScript({
      target,
      func: (m) => { window.__copyScreenMode = m; },
      args: [mode],
    });
    await chrome.scripting.insertCSS({ target, files: ['content.css'] });
    await chrome.scripting.executeScript({ target, files: ['editor.js', 'content.js'] });
    warmUpOcr(); // load the OCR engine while the user is still dragging
  } catch (err) {
    console.warn('CopyScreen cannot run on this page:', err);
    flashBadge(tab.id, "CopyScreen can't run on this page");
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'cs-capture') {
    capture(msg, sender).then(sendResponse, (err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg?.type === 'cs-shot') {
    chrome.tabs
      .captureVisibleTab(sender.tab.windowId, { format: 'png' })
      .then((dataUrl) => sendResponse({ dataUrl }), (err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg?.type === 'cs-ocr') {
    ocr(sender).then(sendResponse, (err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg?.type === 'cs-ocr-image') {
    // Whole image from the editor: the "crop" is the full image.
    runOcr({
      dataUrl: msg.dataUrl,
      rect: { x: 0, y: 0, w: msg.width, h: msg.height },
      viewportWidth: msg.width,
    }).then(sendResponse, (err) => sendResponse({ error: err.message }));
    return true;
  }
});

async function capture(msg, sender) {
  const tab = sender.tab;
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  pendingShots.set(tab.id, { dataUrl, rect: msg.rect, viewportWidth: msg.viewportWidth });
  return { ok: true };
}

async function ocr(sender) {
  const shot = pendingShots.get(sender.tab.id);
  pendingShots.delete(sender.tab.id);
  if (!shot) throw new Error('No screenshot to read');
  return runOcr(shot);
}

async function runOcr(shot) {
  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({ target: 'cs-offscreen', type: 'ocr', ...shot });
  if (!result) throw new Error('OCR engine did not respond');
  return result;
}

function warmUpOcr() {
  ensureOffscreen()
    .then(() => chrome.runtime.sendMessage({ target: 'cs-offscreen', type: 'warmup' }))
    .catch((err) => console.warn('CopyScreen: OCR warm-up failed', err));
}

let creatingOffscreen = null;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['WORKERS', 'CLIPBOARD'],
      justification: 'Run Tesseract OCR in a web worker and copy the recognized text to the clipboard.',
    })
    .finally(() => { creatingOffscreen = null; });
  await creatingOffscreen;
}

function flashBadge(tabId, title) {
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#d93025' });
  chrome.action.setBadgeText({ tabId, text: '!' });
  chrome.action.setTitle({ tabId, title });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    const defaultTitle = chrome.runtime.getManifest().action.default_title;
    chrome.action.setTitle({ tabId, title: defaultTitle }).catch(() => {});
  }, 3000);
}

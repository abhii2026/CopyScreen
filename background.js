// CopyScreen service worker: injects the marquee tool, captures the tab,
// and hands the screenshot to the offscreen document for OCR.

const OFFSCREEN_PATH = 'offscreen.html';

// Screenshots waiting for OCR, keyed by tab id.
const pendingShots = new Map();

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (err) {
    console.warn('CopyScreen cannot run on this page:', err);
    flashBadge(tab.id, "CopyScreen can't run on this page");
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'cs-capture') {
    capture(msg, sender).then(sendResponse, (err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg?.type === 'cs-ocr') {
    ocr(sender).then(sendResponse, (err) => sendResponse({ error: err.message }));
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
  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({ target: 'cs-offscreen', type: 'ocr', ...shot });
  if (!result) throw new Error('OCR engine did not respond');
  return result;
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

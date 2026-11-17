// CopyScreen marquee tool. Injected on demand by background.js (after editor.js).
// Modes: 'shot' (default) = screenshot the region, copy the image, open the editor
//        (draw, copy text via OCR, save).
//        'text' = quick path: OCR the region and copy the text, no editor.
// Uses the popover top layer so it also sits above fullscreen videos.
(() => {
  if (window.__copyScreenActive || window.__copyScreenEditorOpen) return;
  window.__copyScreenActive = true;

  const mode = window.__copyScreenMode === 'text' ? 'text' : 'shot';
  const MIN_SIZE = 5;

  const overlay = document.createElement('div');
  overlay.id = 'copyscreen-overlay';
  overlay.popover = 'manual';
  overlay.dataset.mode = mode;

  const box = document.createElement('div');
  box.className = 'copyscreen-box';
  overlay.appendChild(box);

  const bar = document.createElement('div');
  bar.className = 'copyscreen-bar';
  bar.textContent = (mode === 'text'
    ? 'Quick copy text: drag around the text'
    : 'Drag to select an area') + ' · Esc to cancel';
  overlay.appendChild(bar);

  document.documentElement.appendChild(overlay);
  overlay.showPopover();

  let start = null;
  let rect = null;

  function onPointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    overlay.setPointerCapture(e.pointerId);
    start = { x: e.clientX, y: e.clientY };
    rect = { x: start.x, y: start.y, w: 0, h: 0 };
    overlay.classList.add('copyscreen-dragging');
    bar.remove();
    draw();
  }

  function onPointerMove(e) {
    if (!start) return;
    e.preventDefault();
    const x = clamp(e.clientX, 0, window.innerWidth);
    const y = clamp(e.clientY, 0, window.innerHeight);
    rect = {
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      w: Math.abs(x - start.x),
      h: Math.abs(y - start.y),
    };
    draw();
  }

  function onPointerUp(e) {
    if (!start) return;
    e.preventDefault();
    e.stopPropagation();
    const selection = rect;
    cleanup();
    if (selection.w < MIN_SIZE || selection.h < MIN_SIZE) return;
    if (mode === 'shot') runShot(selection);
    else runText(selection);
  }

  function onKeyDown(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    cleanup();
  }

  function draw() {
    box.style.left = rect.x + 'px';
    box.style.top = rect.y + 'px';
    box.style.width = rect.w + 'px';
    box.style.height = rect.h + 'px';
  }

  function cleanup() {
    start = null;
    window.removeEventListener('keydown', onKeyDown, true);
    try { overlay.hidePopover(); } catch {}
    overlay.remove();
    window.__copyScreenActive = false;
  }

  overlay.addEventListener('pointerdown', onPointerDown);
  overlay.addEventListener('pointermove', onPointerMove);
  overlay.addEventListener('pointerup', onPointerUp);
  overlay.addEventListener('contextmenu', (e) => { e.preventDefault(); cleanup(); });
  window.addEventListener('keydown', onKeyDown, true);

  // Let the overlay disappear from the rendered frame before the screenshot.
  async function waitForRepaint() {
    await nextFrame();
    await nextFrame();
  }

  async function runText(selection) {
    await waitForRepaint();
    try {
      const cap = await chrome.runtime.sendMessage({
        type: 'cs-capture',
        rect: selection,
        viewportWidth: window.innerWidth,
      });
      if (cap?.error) throw new Error(cap.error);

      const t = toast('Reading text…', 'busy');
      const res = await chrome.runtime.sendMessage({ type: 'cs-ocr' });
      t.close();
      if (res?.error) throw new Error(res.error);

      if (!res.text) {
        toast('No text found in the selection', 'warn', 2500);
      } else if (res.copied) {
        toast('Copied: ' + preview(res.text), 'ok', 3000);
      } else {
        // Clipboard write failed in the extension; try from the page.
        await navigator.clipboard.writeText(res.text);
        toast('Copied: ' + preview(res.text), 'ok', 3000);
      }
    } catch (err) {
      console.warn('CopyScreen:', err);
      toast('CopyScreen error: ' + err.message, 'error', 4000);
    }
  }

  async function runShot(selection) {
    await waitForRepaint();
    try {
      const res = await chrome.runtime.sendMessage({ type: 'cs-shot' });
      if (!res || res.error) throw new Error(res?.error || 'Screenshot failed');
      const { canvas, scale } = await cropScreenshot(res.dataUrl, selection);
      window.__copyScreenEditor.open(canvas, scale);
    } catch (err) {
      console.warn('CopyScreen:', err);
      toast('CopyScreen error: ' + err.message, 'error', 4000);
    }
  }

  // Decode the data URL by hand (no <img>/fetch) so page CSP can't block it.
  async function cropScreenshot(dataUrl, sel) {
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));

    // Screenshot pixels per CSS pixel (covers devicePixelRatio and page zoom).
    const scale = img.width / window.innerWidth;
    const sx = Math.max(0, Math.round(sel.x * scale));
    const sy = Math.max(0, Math.round(sel.y * scale));
    const sw = Math.min(img.width - sx, Math.round(sel.w * scale));
    const sh = Math.min(img.height - sy, Math.round(sel.h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    img.close();
    return { canvas, scale };
  }

  function toast(message, kind, duration) {
    document.querySelectorAll('.copyscreen-toast').forEach((el) => el.remove());
    const el = document.createElement('div');
    el.className = 'copyscreen-toast copyscreen-' + kind;
    el.popover = 'manual';
    el.textContent = message;
    document.documentElement.appendChild(el);
    el.showPopover();
    const close = () => {
      try { el.hidePopover(); } catch {}
      el.remove();
    };
    if (duration) setTimeout(close, duration);
    return { close };
  }

  function preview(text) {
    const flat = text.replace(/\s+/g, ' ');
    return flat.length > 80 ? flat.slice(0, 77) + '…' : flat;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function nextFrame() { return new Promise((r) => requestAnimationFrame(() => r())); }
})();

// CopyScreen screenshot editor: shows the captured region, lets you draw on it,
// copies the plain capture once on open, and copies drawings only when you press
// Copy image (Ctrl+C). Nothing touches the disk unless you press Save.
// Exposes window.__copyScreenEditor.open(canvas, scale).
(() => {
  if (window.__copyScreenEditor) return;

  const COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#111111', '#ffffff'];
  const STROKES = [2, 4, 8]; // CSS px, per size step
  const FONTS = [16, 24, 36]; // CSS px, per size step

  const ICONS = {
    pen: ['M4 20l1-4L16 5l3 3L8 19l-4 1z', 'M14 7l3 3'],
    highlighter: ['M9 14l6-6 4 4-6 6-4-4z', 'M9 14l-3 3v2h4l2-2', 'M4 21h16'],
    arrow: ['M5 19L19 5', 'M10 5h9v9'],
    rect: ['M4 6h16v12H4z'],
    text: ['M5 7V5h14v2', 'M12 5v14', 'M9 19h6'],
    undo: ['M9 14L4 9l5-5', 'M4 9h11a5 5 0 010 10h-3'],
    redo: ['M15 14l5-5-5-5', 'M20 9H9a5 5 0 000 10h3'],
    copy: ['M9 9h11v11H9z', 'M5 15V4h11'],
    save: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
    close: ['M6 6l12 12', 'M18 6L6 18'],
    ocr: ['M4 8V4h4', 'M16 4h4v4', 'M20 16v4h-4', 'M8 20H4v-4', 'M8 9h8', 'M8 12h8', 'M8 15h5'],
  };

  const TOOLS = [
    { id: 'pen', key: 'p', title: 'Pen (P)' },
    { id: 'highlighter', key: 'h', title: 'Highlighter (H)' },
    { id: 'arrow', key: 'a', title: 'Arrow (A)' },
    { id: 'rect', key: 'r', title: 'Rectangle (R)' },
    { id: 'text', key: 't', title: 'Text (T)' },
  ];

  const CSS = `
    :host { all: initial; }
    .wrap {
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 12px;
      background: rgba(10, 10, 14, 0.72);
      font: 500 13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: #eee;
    }
    .bar {
      display: flex; align-items: center; flex-wrap: wrap; justify-content: center;
      gap: 2px; padding: 6px; max-width: calc(100vw - 32px); box-sizing: border-box;
      background: #1d1d22; border: 1px solid #34343c; border-radius: 10px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
    }
    .sep { width: 1px; height: 22px; background: #3a3a44; margin: 0 6px; }
    button {
      all: unset; box-sizing: border-box; height: 32px; min-width: 32px; padding: 0 8px;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      border-radius: 6px; cursor: pointer; color: #ddd; font: inherit;
    }
    button:hover { background: #2c2c34; }
    button:focus-visible { outline: 2px solid #0a84ff; outline-offset: -2px; }
    button.on { background: #0a84ff; color: #fff; }
    button.swatch-btn.on, button.size-btn.on { background: #34343e; box-shadow: inset 0 0 0 2px #0a84ff; }
    button:disabled { opacity: 0.35; cursor: default; background: none; }
    button.primary { background: #0a84ff; color: #fff; }
    button.primary:hover { background: #2b95ff; }
    svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;
          stroke-linecap: round; stroke-linejoin: round; flex: none; }
    .swatch { width: 16px; height: 16px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.4); }
    .dot { border-radius: 50%; background: currentColor; }
    .status { min-width: 104px; text-align: center; font-size: 12px; color: #8fd19e; }
    .status.err { color: #ff8a80; }
    .status.busy { color: #9ec5ff; }
    .panel {
      box-sizing: border-box; max-width: calc(100vw - 48px); padding: 6px 8px 8px;
      background: #1d1d22; border: 1px solid #34343c; border-radius: 10px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
    }
    .panel[hidden] { display: none; }
    .panel-head { display: flex; align-items: center; gap: 2px; margin-bottom: 6px; }
    .panel-title { flex: 1; color: #a8a8b0; font-size: 12px; padding-left: 4px; }
    .panel button { height: 28px; min-width: 28px; font-size: 12px; }
    .textout {
      all: unset; display: block; box-sizing: border-box; width: 100%; height: 96px;
      padding: 8px 10px; background: #121216; border-radius: 6px; color: #eee;
      font: 13px/1.45 ui-monospace, "Cascadia Mono", Consolas, monospace;
      white-space: pre-wrap; overflow: auto; cursor: text;
    }
    .textout:focus { box-shadow: inset 0 0 0 1px #0a84ff; }
    .stage { position: relative; line-height: 0; }
    canvas { display: block; border-radius: 3px; cursor: crosshair; background: #fff;
             box-shadow: 0 0 0 1px rgba(255,255,255,0.15), 0 10px 40px rgba(0,0,0,0.6); }
    canvas.text-tool { cursor: text; }
    .hint { color: #a8a8b0; font-size: 12px; text-align: center; padding: 0 16px; }
    .stage textarea {
      position: absolute; margin: 0; padding: 0 2px; box-sizing: content-box;
      border: 1px dashed currentColor; border-radius: 2px; background: rgba(0, 0, 0, 0.12);
      outline: none; resize: none; overflow: hidden; white-space: pre;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-weight: 600;
      line-height: 1.2; field-sizing: content; min-width: 1ch;
    }
  `;

  let sheet = null;
  function getSheet() {
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
    }
    return sheet;
  }

  // Tiny DOM helpers (no innerHTML, so Trusted Types / CSP pages are fine)
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function icon(name) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    for (const d of ICONS[name]) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
    return svg;
  }
  function button(title, content, onClick, cls) {
    const b = el('button', cls);
    b.type = 'button';
    b.title = title;
    for (const c of [].concat(content)) b.append(c);
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }
  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  }

  function open(base, scale) {
    window.__copyScreenEditorOpen = true;

    // ---------- DOM ----------
    const host = document.createElement('div');
    host.popover = 'manual';
    const hs = host.style;
    hs.setProperty('all', 'initial', 'important');
    for (const [k, v] of Object.entries({
      position: 'fixed', inset: '0', width: '100vw', height: '100vh', margin: '0', padding: '0',
      border: '0', background: 'transparent', overflow: 'hidden', 'z-index': '2147483647',
    })) hs.setProperty(k, v, 'important');

    const root = host.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [getSheet()];

    const wrap = el('div', 'wrap');
    const bar = el('div', 'bar');
    const stage = el('div', 'stage');
    const canvas = el('canvas');
    const hint = el('div', 'hint',
      'Image copied — paste it anywhere. To copy your drawings, press Copy image (Ctrl+C). ' +
      'Copy text: Ctrl+Shift+C · Save: Ctrl+S · Done: Enter / Esc');
    stage.append(canvas);

    // Recognized-text panel (shown after "Copy text")
    const panel = el('div', 'panel');
    panel.hidden = true;
    const textOut = el('textarea', 'textout');
    textOut.spellcheck = false;
    const panelHead = el('div', 'panel-head');
    panelHead.append(
      el('span', 'panel-title', 'Text from image (you can edit it)'),
      button('Copy this text', [icon('copy'), 'Copy'], copyPanelText),
      button('Hide', icon('close'), () => { panel.hidden = true; fit(); }),
    );
    panel.append(panelHead, textOut);

    wrap.append(bar, stage, panel, hint);
    root.append(wrap);

    // ---------- state ----------
    let tool = 'pen';
    let color = COLORS[0];
    let sizeIdx = 1;
    const shapes = [];
    const redoStack = [];
    let draft = null;
    let activeText = null;
    let statusTimer = null;

    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext('2d');

    // ---------- toolbar ----------
    const toolButtons = {};
    for (const t of TOOLS) {
      toolButtons[t.id] = button(t.title, icon(t.id), () => setTool(t.id));
      bar.append(toolButtons[t.id]);
    }
    bar.append(el('div', 'sep'));

    const colorButtons = COLORS.map((c, i) => {
      const sw = el('span', 'swatch');
      sw.style.background = c;
      const b = button(`Color ${i + 1}`, sw, () => setColor(c), 'swatch-btn');
      bar.append(b);
      return b;
    });
    bar.append(el('div', 'sep'));

    const sizeButtons = [5, 8, 12].map((px, i) => {
      const dot = el('span', 'dot');
      dot.style.width = dot.style.height = px + 'px';
      const b = button(['Small', 'Medium', 'Large'][i] + ' size', dot, () => setSize(i), 'size-btn');
      bar.append(b);
      return b;
    });
    bar.append(el('div', 'sep'));

    const undoBtn = button('Undo (Ctrl+Z)', icon('undo'), undo);
    const redoBtn = button('Redo (Ctrl+Y)', icon('redo'), redo);
    bar.append(undoBtn, redoBtn, el('div', 'sep'));

    const status = el('span', 'status');
    const ocrBtn = button('Read the text in the image and copy it (Ctrl+Shift+C)', [icon('ocr'), 'Copy text'], extractText);
    bar.append(
      status,
      ocrBtn,
      button('Copy image to clipboard (Ctrl+C)', [icon('copy'), 'Copy image'], () => copyNow()),
      button('Save as PNG (Ctrl+S)', [icon('save'), 'Save'], save),
      button('Done (Enter / Esc)', [icon('close')], close),
    );

    function refreshToolbar() {
      for (const [id, b] of Object.entries(toolButtons)) b.classList.toggle('on', id === tool);
      colorButtons.forEach((b, i) => b.classList.toggle('on', COLORS[i] === color));
      sizeButtons.forEach((b, i) => b.classList.toggle('on', i === sizeIdx));
      undoBtn.disabled = shapes.length === 0;
      redoBtn.disabled = redoStack.length === 0;
      canvas.classList.toggle('text-tool', tool === 'text');
    }
    function setTool(t) { commitText(); tool = t; refreshToolbar(); }
    function setColor(c) {
      color = c;
      if (activeText) activeText.el.style.color = c;
      refreshToolbar();
    }
    function setSize(i) {
      sizeIdx = i;
      if (activeText) styleTextBox(activeText.el);
      refreshToolbar();
    }

    // kind: 'ok' (fades), 'err' or 'busy' (stays until replaced)
    function setStatus(text, kind = 'ok') {
      status.textContent = text;
      status.classList.toggle('err', kind === 'err');
      status.classList.toggle('busy', kind === 'busy');
      clearTimeout(statusTimer);
      if (kind === 'ok') statusTimer = setTimeout(() => { status.textContent = ''; }, 2500);
    }

    // ---------- layout ----------
    function fit() {
      const natW = base.width / scale;
      const natH = base.height / scale;
      const availW = window.innerWidth - 48;
      const panelH = panel.hidden ? 0 : panel.offsetHeight + 12;
      const availH = window.innerHeight - bar.offsetHeight - hint.offsetHeight - panelH - 72;
      const s = Math.min(1, availW / natW, Math.max(0.05, availH / natH));
      const w = Math.max(1, natW * s);
      canvas.style.width = w + 'px';
      canvas.style.height = Math.max(1, natH * s) + 'px';
      panel.style.width = Math.max(460, w) + 'px';
    }
    // Image pixels per CSS pixel of the displayed canvas.
    function ratio() { return canvas.width / canvas.getBoundingClientRect().width; }
    function toImage(e) {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height),
      };
    }

    // ---------- rendering ----------
    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      for (const s of shapes) drawShape(s);
      if (draft) drawShape(draft);
    }

    function drawShape(s) {
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      switch (s.tool) {
        case 'highlighter':
          ctx.globalAlpha = 0.4;
          ctx.lineCap = 'square';
        // fall through
        case 'pen':
          strokePath(s.points, s.width);
          break;
        case 'rect':
          ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
          break;
        case 'arrow':
          drawArrow(s);
          break;
        case 'text':
          ctx.font = `600 ${s.fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
          ctx.textBaseline = 'top';
          s.text.split('\n').forEach((line, i) => {
            ctx.fillText(line, s.x, s.y + s.fontSize * (0.1 + 1.2 * i));
          });
          break;
      }
      ctx.restore();
    }

    function strokePath(pts, width) {
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }

    function drawArrow(s) {
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      const head = Math.min(len * 0.6, Math.max(s.width * 4, 10 * s.r));
      const bx = s.x2 - Math.cos(ang) * head * 0.6;
      const by = s.y2 - Math.sin(ang) * head * 0.6;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - head * Math.cos(ang - 0.45), s.y2 - head * Math.sin(ang - 0.45));
      ctx.lineTo(s.x2 - head * Math.cos(ang + 0.45), s.y2 - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    }

    // ---------- drawing input ----------
    function onPointerDown(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      if (activeText) { commitText(); return; }
      const p = toImage(e);
      if (tool === 'text') { startText(e, p); return; }

      const r = ratio();
      const width = STROKES[sizeIdx] * r * (tool === 'highlighter' ? 4 : 1);
      draft = (tool === 'pen' || tool === 'highlighter')
        ? { tool, color, width, points: [p] }
        : { tool, color, width, r, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      canvas.setPointerCapture(e.pointerId);
      render();
    }

    function onPointerMove(e) {
      if (!draft) return;
      const p = toImage(e);
      if (draft.points) draft.points.push(p);
      else { draft.x2 = p.x; draft.y2 = p.y; }
      render();
    }

    function onPointerUp() {
      if (!draft) return;
      const d = draft;
      draft = null;
      const tiny = !d.points && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 3 * ratio();
      if (!tiny) addShape(d);
      else render();
    }

    function addShape(s) {
      shapes.push(s);
      redoStack.length = 0;
      changed();
    }
    function undo() {
      commitText();
      if (!shapes.length) return;
      redoStack.push(shapes.pop());
      changed();
    }
    function redo() {
      if (!redoStack.length) return;
      shapes.push(redoStack.pop());
      changed();
    }
    function changed() {
      render();
      refreshToolbar();
    }

    // ---------- text tool ----------
    function styleTextBox(ta) {
      // Same on-screen size the committed text will have (FONTS * ratio image px).
      ta.style.fontSize = FONTS[sizeIdx] + 'px';
    }

    function startText(e, p) {
      const ta = el('textarea');
      ta.rows = 1;
      ta.spellcheck = false;
      ta.style.color = color;
      styleTextBox(ta);
      const sr = stage.getBoundingClientRect();
      // Offset by border + padding so typed text lines up with the drawn text.
      ta.style.left = (e.clientX - sr.left - 3) + 'px';
      ta.style.top = (e.clientY - sr.top - 1) + 'px';
      stage.append(ta);
      activeText = { el: ta, x: p.x, y: p.y };
      ta.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Escape') { ev.preventDefault(); cancelText(); }
        else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitText(); }
      });
      ta.addEventListener('blur', () => commitText());
      setTimeout(() => ta.focus(), 0);
    }

    function commitText() {
      if (!activeText) return;
      const { el: ta, x, y } = activeText;
      activeText = null;
      const text = ta.value.replace(/\s+$/, '');
      ta.remove();
      if (text) {
        addShape({ tool: 'text', color, text, x, y, fontSize: FONTS[sizeIdx] * ratio() });
      }
    }

    function cancelText() {
      if (!activeText) return;
      activeText.el.remove();
      activeText = null;
    }

    // ---------- clipboard / save ----------
    function toBlob() {
      return new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/png');
      });
    }

    async function copyNow() {
      commitText(); // include text still being typed
      try {
        // Passing the promise keeps the user-activation from the click/keypress.
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob() })]);
        setStatus('Image copied ✓');
      } catch (err) {
        console.warn('CopyScreen: clipboard write failed', err);
        setStatus('Copy failed — use Save', 'err');
      }
    }

    // ---------- OCR ("Copy text") ----------
    let ocrBusy = false;

    async function extractText() {
      commitText();
      // Already read once: just copy (possibly edited) text again.
      if (!panel.hidden && textOut.value) return copyPanelText();
      if (ocrBusy) return;
      ocrBusy = true;
      ocrBtn.disabled = true;
      setStatus('Reading text…', 'busy');
      try {
        // OCR the original capture, not the drawings on top of it.
        const res = await chrome.runtime.sendMessage({
          type: 'cs-ocr-image',
          dataUrl: base.toDataURL('image/png'),
          width: base.width,
          height: base.height,
        });
        if (!res || res.error) throw new Error(res?.error || 'OCR failed');
        if (!res.text) {
          setStatus('No text found', 'err');
          return;
        }
        textOut.value = res.text;
        panel.hidden = false;
        fit();
        let copied = res.copied;
        if (!copied) {
          try { await navigator.clipboard.writeText(res.text); copied = true; } catch {}
        }
        setStatus(copied ? 'Text copied ✓' : 'Copy failed', copied ? 'ok' : 'err');
      } catch (err) {
        console.warn('CopyScreen: OCR failed', err);
        setStatus('Text read failed', 'err');
      } finally {
        ocrBusy = false;
        ocrBtn.disabled = false;
      }
    }

    async function copyPanelText() {
      try {
        await navigator.clipboard.writeText(textOut.value);
        setStatus('Text copied ✓');
      } catch (err) {
        console.warn('CopyScreen: clipboard write failed', err);
        setStatus('Copy failed', 'err');
      }
    }

    async function save() {
      commitText();
      try {
        const blob = await toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `screenshot-${stamp()}.png`;
        root.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setStatus('Saved ✓');
      } catch (err) {
        console.warn('CopyScreen: save failed', err);
        setStatus('Save failed', 'err');
      }
    }

    // ---------- keyboard ----------
    function onKeyDown(e) {
      const target = e.composedPath()[0];
      // Let the drawing text box handle its own keys.
      if (activeText && target === activeText.el) return;
      e.stopPropagation(); // keep page shortcuts (e.g. video players) quiet
      // Typing in the recognized-text panel: only Esc (leave the box) is ours.
      if (target === textOut) {
        if (e.key === 'Escape') { e.preventDefault(); textOut.blur(); }
        return;
      }
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      let handled = true;
      if (k === 'escape' || k === 'enter') close();
      else if (mod && e.shiftKey && k === 'c') extractText();
      else if (mod && k === 'z' && e.shiftKey) redo();
      else if (mod && k === 'z') undo();
      else if (mod && k === 'y') redo();
      else if (mod && k === 'c') copyNow();
      else if (mod && k === 's') save();
      else if (!mod && !e.altKey && TOOLS.some((t) => t.key === k)) setTool(TOOLS.find((t) => t.key === k).id);
      else handled = false;
      if (handled) e.preventDefault();
    }
    const swallow = (e) => e.stopPropagation();

    // ---------- open / close ----------
    function close() {
      commitText();
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', swallow, true);
      window.removeEventListener('keypress', swallow, true);
      window.removeEventListener('resize', fit);
      try { host.hidePopover(); } catch {}
      host.remove();
      window.__copyScreenEditorOpen = false;
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu']) {
      host.addEventListener(type, swallow);
    }
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', swallow, true);
    window.addEventListener('keypress', swallow, true);
    window.addEventListener('resize', fit);

    document.documentElement.appendChild(host);
    host.showPopover();
    refreshToolbar();
    fit();
    render();
    copyNow(); // the plain screenshot is pasteable right away
  }

  window.__copyScreenEditor = { open };
})();

# CopyScreen

Chrome/Edge Manifest V3 extension: drag a box on any page to screenshot + annotate it, or to copy its text via offline OCR (Tesseract.js, English). See README.md for user-facing features and shortcuts.

## Running / testing
- No build step, no package manager, no tests. Plain JS loaded directly.
- Test by loading the folder unpacked at `chrome://extensions` (Developer mode), then click the reload icon on the extension card after every change and refresh the target tab.
- Quick syntax check: `node --check <file>.js`.
- Can't run on `chrome://`, Web Store or PDF viewer pages (icon shows a red `!`). DRM video captures as black.

## Architecture
- `background.js` (service worker): handles the icon / `Alt+Shift+S` (mode `shot`) and `Alt+Shift+C` (mode `text`), injects `content.css`, `editor.js`, `content.js` on demand, calls `captureVisibleTab`, and manages the offscreen document.
- `content.js`: the marquee overlay. `shot` mode crops the screenshot and opens the editor; `text` mode sends the capture for OCR and shows a toast.
- `editor.js`: screenshot editor in a shadow-DOM popover (pen, highlighter, arrow, rect, text, undo/redo, Copy text, Copy image, Save). Exposes `window.__copyScreenEditor.open(canvas, scale)`.
- `offscreen.html` / `offscreen.js`: hidden page that runs the Tesseract worker and writes OCR text to the clipboard via `execCommand('copy')`.
- Overlays use the popover top layer so they sit above fullscreen video; no `innerHTML` (Trusted Types / strict-CSP pages).
- `wasm-unsafe-eval` in the CSP and `workerBlobURL: false` are required for Tesseract under MV3.

## Rules
- Do not edit `lib/tesseract/` (vendored tesseract.js 5.1.1 + core + `eng` tessdata_fast).
- Clipboard behavior (deliberate): the editor copies the plain capture once on open; drawings are copied ONLY when the user presses Copy image / Ctrl+C. Never add automatic re-copying on draw, undo or close.
- Keep README.md (features, shortcuts) in sync with behavior changes.
- Bump `version` in `manifest.json` for each release; commit messages use `CopyScreen vX.Y.Z: <summary>`.

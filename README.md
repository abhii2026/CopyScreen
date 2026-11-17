# CopyScreen

Chrome/Edge extension: draw a box around text on a video (or anywhere on a page) and the text is copied to your clipboard. OCR runs fully offline with Tesseract.js (English).

## Install
1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick this `CopyScreen` folder.
4. Pin the extension to the toolbar.

## Use

Pausing the video on the frame you want is recommended.

### Capture: icon or Alt+Shift+S
1. Click the CopyScreen icon or press **Alt+Shift+S**, then drag a rectangle around an area (**Esc** or right-click cancels).
2. The image is **copied to the clipboard immediately**, so you can paste it right away. An editor opens:
   - **Draw:** Pen `P`, Highlighter `H`, Arrow `A`, Rectangle `R`, Text `T` (Enter to place, Shift+Enter for a new line), 6 colors, 3 sizes, Undo `Ctrl+Z` / Redo `Ctrl+Y`. Every change is re-copied automatically.
   - **Copy text** (`Ctrl+Shift+C`): reads the words in the capture and copies them. They also appear in a panel under the image, where you can edit them and copy again.
   - **Copy image** (`Ctrl+C`): copies the image again (e.g. after copying the text).
   - **Save** (`Ctrl+S`): downloads a PNG. Nothing is written to disk unless you save.
   - **Enter**, **Esc**, or **×**: done.

### Quick copy text: Alt+Shift+C
Drag around the text and it's copied straight away, with no editor. A toast at the bottom-right shows a preview.

Text reading typically takes 0.1–0.4 s. The OCR engine starts loading as soon as the selection overlay opens, so it's ready by the time you finish dragging.

Shortcuts can be changed at `chrome://extensions/shortcuts`.

## Notes
- Doesn't run on browser pages (`chrome://`, the Web Store, the PDF viewer); the icon shows a red `!` there.
- DRM-protected videos (e.g. Netflix) are captured as black frames by the browser, so there's no text to read.
- Bundled: tesseract.js 5.1.1, tesseract.js-core 5.1.1, `eng` traineddata from [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) (all Apache-2.0; see `lib/tesseract/LICENSE.md`).

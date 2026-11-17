# CopyScreen

Chrome/Edge extension: draw a box around text on a video (or anywhere on a page) and the text is copied to your clipboard. OCR runs fully offline with Tesseract.js (English).

## Install
1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick this `CopyScreen` folder.
4. Pin the extension to the toolbar.

## Use
1. Pause the video on the frame with the text (recommended).
2. Click the CopyScreen icon, or press **Alt+Shift+C**.
3. Drag a rectangle around the text. Press **Esc** or right-click to cancel.
4. The text is on your clipboard and a toast at the bottom-right shows a preview.

The first OCR after the browser starts takes a second or two longer while the engine loads.

## Notes
- Doesn't run on browser pages (`chrome://`, the Web Store, the PDF viewer); the icon shows a red `!` there.
- DRM-protected videos (e.g. Netflix) are captured as black frames by the browser, so there's no text to read.
- Bundled: tesseract.js 5.1.1, tesseract.js-core 5.1.1, `eng` traineddata (4.0.0_best_int). See `lib/tesseract/LICENSE.md` (Apache-2.0).

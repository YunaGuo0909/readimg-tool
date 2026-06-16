# ReadAloud

A Progressive Web App (PWA) that extracts text from images using OCR and reads it aloud with text-to-speech. Supports English and Chinese, works on iPhone, iPad, and desktop browsers.

## Features

- **Multi-image OCR** — Select up to 20 images at once from gallery, camera, clipboard paste, or drag-and-drop
- **Chinese & English** — Recognizes both languages with automatic detection (powered by Tesseract.js)
- **Text-to-Speech** — Read recognized text aloud with play, pause, resume, and stop controls
- **Speed Control** — Adjustable playback speed from 0.5x to 2.5x
- **Drag to Reorder** — Rearrange image order by dragging thumbnails (mouse and touch)
- **PWA** — Install to home screen on iOS/Android, works offline after first load
- **No backend required** — Everything runs in the browser

## Tech Stack

| Component | Technology |
|-----------|------------|
| OCR | [Tesseract.js](https://github.com/naptha/tesseract.js) v5 (chi_sim + eng) |
| TTS | Web Speech API |
| UI | Vanilla HTML / CSS / JS |
| Offline | Service Worker |
| Install | PWA Manifest |

## Getting Started

### Prerequisites

- Node.js (for local dev server) or any static file server
- A modern browser (Chrome, Safari, Edge, Firefox)

### Run Locally

```bash
git clone https://github.com/YunaGuo0909/readimg-tool.git
cd readimg-tool
npx serve .
```

Open `http://localhost:3000` in your browser.

### Deploy

This is a static site — deploy to any static hosting:

**GitHub Pages:**

1. Go to repo Settings > Pages
2. Set source to `main` branch, root `/`
3. Access at `https://YunaGuo0909.github.io/readimg-tool/`

**Vercel:**

```bash
npm i -g vercel
vercel
```

**Netlify:**

Drag the project folder into [Netlify Drop](https://app.netlify.com/drop).

### Install on iPhone / iPad

1. Open the deployed URL in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"

## Project Structure

```
readimg-tool/
├── index.html        # Main page
├── app.js            # OCR, TTS, drag-reorder, image queue logic
├── style.css         # Responsive styles, thumbnail strip, controls
├── sw.js             # Service Worker for offline caching
├── manifest.json     # PWA manifest
├── icon-192.png      # App icon 192x192
├── icon-512.png      # App icon 512x512
└── .gitignore
```

## Usage

1. **Add images** — Use Camera, Gallery (multi-select), paste (`Ctrl+V`), or drag-and-drop
2. **Reorder** — Drag thumbnails to change reading order
3. **Wait for OCR** — Progress bar shows recognition status per image
4. **Read** — Tap "Read All" to hear the text; use Pause/Resume to control playback
5. **Copy** — Tap "Copy All" to copy all recognized text to clipboard

## Browser Compatibility

| Browser | OCR | TTS | PWA Install |
|---------|-----|-----|-------------|
| Chrome (Desktop) | Yes | Yes | Yes |
| Safari (iOS 17+) | Yes | Yes | Yes |
| Edge | Yes | Yes | Yes |
| Firefox | Yes | Yes | No |

## License

MIT

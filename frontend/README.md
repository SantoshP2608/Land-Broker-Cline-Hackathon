# LandShield homepage

React + JSX + Vite homepage based on the supplied design, including the responsive hero and navbar. Authentication and verification APIs are not connected yet.

## Run locally

From your repository checkout (Node.js 20.19+ or 22.12+):

```sh
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173).

```powershell
npm.cmd test
npm.cmd run build
```

## Implemented scope

- Left hero: demo notice, gradient headline, description, two actions, and four feature items.
- Responsive mobile layout, keyboard focus styles, and reduced-motion support.
- Inline SVG fallback icons; no external font, icon, or animation dependencies.
- Preview actions open accessible native dialogs with honest demo/workflow information. They are not connected to login, verification, or a video.
- Navbar: Home, How It Works, Features, About, Demo, Sign In, and Get Started; no logo or site name.
- Mobile navigation supports Escape, outside-click dismissal, and closing after selection or switching to desktop layout.
- Sign In is an informational preview and does not collect credentials. The right-side illustration is not implemented.

## Connect the supplied assets

The uploaded hero and four icons are connected in App.jsx. The served hero is frontend/public/assets/Main-hero.png. Icons are mapped as assurance → trusted, ai-verf → extraction, doc-search → comparison, and human-shield → transparency. Transparent, cropped display copies are generated while the uploaded originals remain untouched.

The background retains its aspect ratio, fades into #031a34, and continues with that navy colour if the content is taller than the artwork. No fixed-height content clipping is used.

To regenerate public artwork (requires Python and Pillow):

```sh
# From the frontend directory:
python scripts/prepare_home_assets.py
```

Optional browser validation uses Playwright with installed Microsoft Edge (not a runtime dependency): install using `npm.cmd install --no-save --package-lock=false playwright`, then run `node scripts/check_home_browser.mjs` from the frontend directory. Screenshots are stored in ignored artifacts/.


Put public-only design assets under frontend/public/assets and supply URLs from App.jsx:

```jsx
<HomeLeft
  backgroundImage="/assets/hero.webp"
  featureIcons={{
    trusted: '/assets/trusted.svg',
    extraction: '/assets/extraction.svg',
    comparison: '/assets/comparison.svg',
    transparency: '/assets/transparency.svg',
  }}
  onTryDemo={() => openPanel('demo')}
  onWatchHowItWorks={() => openPanel('workflow')}
/>
```

Use actual supplied filenames. Alternatively, import assets from src/assets and pass the imported URLs. Missing handlers explicitly disable their respective buttons. Private property/identity documents must never be stored in public/assets.

The notice mirrors the design's proposed government-controlled deployment language; it is not a claim of government adoption. All records in a demo must remain synthetic and labelled simulated.

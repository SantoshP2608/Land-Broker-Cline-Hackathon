# Land Broker — Cline Hackathon

## First-page frontend

The LandShield homepage is implemented in `frontend/` using React and Vite. It includes the responsive hero, property-verification artwork, feature highlights, and desktop/mobile navigation without branding.

```sh
cd frontend
npm ci
npm run dev
```

Requires Node.js 20.19+ or 22.12+.

### Validation

```sh
npm test
npm run build
```

See [frontend/README.md](frontend/README.md) for browser checks and asset preparation instructions. Root PNG files are the original artwork used by the preparation script; served copies are in `frontend/public/assets/`.

This is a homepage preview: sign-in, buyer/seller flows, document verification, and government integrations are not connected. Demo dialogs do not collect credentials or process real property records.

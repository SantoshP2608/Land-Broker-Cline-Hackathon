# Land Broker — Cline Hackathon

## Frontend — pages 1–3

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

Pages 2 and 3 add responsive login/register (`#signin`) and profile/identity evidence (`#profile`) previews. Homepage Sign In, Get Started, Demo, and Try Demo lead to the account page. Buying/selling context, form validation, sample evidence selection, draft, and review confirmation work locally. Passwords are discarded, and account details/files remain only in memory. Nothing is sent to a backend; there is no real authentication, identity approval, or government integration. Use synthetic data only.

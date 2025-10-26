# Utility Guy — Hackathon README

Utility Guy is a single‑page React application scaffolded for rapid hackathon development. It combines
TanStack Router (file-based routes), React Query for data fetching, Firebase for auth & data, Tailwind CSS
for styling, and a small shadcn-style UI layer. The app demonstrates a utilities dashboard (metrics, wallet,
utilities management), account settings, and a simple admin area.

This README is focused on getting a team running fast during a hackathon and explaining where to find
the important bits to extend the project.

Why this is great for a hackathon
- Batteries included: auth, routing, and UI components already wired.
- File-based routing means drop-in pages appear instantly.
- React Query + Firebase makes prototyping backend flows quick.
- Tailwind + component primitives let you iterate UI rapidly.

Quick start (local)
1. Copy Firebase env vars into a `.env` file at repo root (Vite expects VITE_ prefixed vars):

   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...

2. Install and run:

```powershell
npm install
npm run dev
```

3. Open `http://localhost:3000` and sign in (use the auth flows in `/auth`).

Project structure (important files)
- `src/main.tsx` — app bootstrap and React Query provider
- `src/config/firebase.ts` — Firebase initialization and exported `auth`/`db`
- `src/routes/` — file-based routes (dashboard, auth, settings, admin)
- `src/routes/dashboard/route.tsx` — dashboard layout, mobile/desktop navigation
- `src/routes/dashboard/settings/` — settings page with profile & security flows
- `src/components/ui/` — reusable UI primitives (button, dialog, input, etc.)
- `src/styles.css` — Tailwind + global theming + font setup
- `package.json` / `vite.config.ts` / `vercel.json` — build & deploy config

Tips for the hackathon demo
- Add one clear, high-impact feature (e.g., auto top-up simulation, low-balance alerts).
- Keep auth simple during demos: seed a demo account or show a quick register flow.
- Use Firebase emulator for offline/local testing if you expect intermittent network.

Small implementation notes / gotchas
- Responsive font switching: this project uses a global CSS variable to swap fonts at `md` breakpoints; ensure
  Google Fonts import is reachable in the environment when testing.
- Mobile UI: dashboard contains an adaptive top nested nav and a bottom nav. Settings intentionally hide the
  global top nav on mobile to avoid duplication with in-page settings controls.

Deploy
- Vercel is configured; push to a GitHub repo and connect to Vercel or run `npm run build` and host the `dist` bundle.

Feature ideas for quick execution (1–2 day hacks)
- Auto top-up rules engine: UI to set thresholds, simulate triggers, and record events in Firestore.
- Transaction mock service: simulate payments, show in Wallet > History, add filtering and export.
- Multi-property support: add a property selector and scope UI/data by property ID.
- Analytics sparkline: add tiny in-card charts using a lightweight chart library.

Contributing during the hackathon
- Work in small, focused branches. Keep PRs small and demoable.
- Test auth + settings flows manually after changes (these are the most fragile parts).
- If you need a shared dev Firebase, consider a single test project with seeded accounts.

Commands
- `npm run dev` — start dev server (Vite)
- `npm run build` — production build (Vite + tsc)
- `npm run serve` — preview production build
- `npm run test` — run unit tests (Vitest)

Questions or want a feature wired quickly? Tell me which demo you want to ship and I'll scaffold it (routes, UI and a simple Firestore schema).

Good luck — ship something awesome!


# Utility Guy — README (updated)

This document explains how the application is organized, the core technologies used, and the main data flows so you can quickly understand and extend the project.

Summary
- Utility Guy is a single-page React app for monitoring and managing electricity and water meters, automated top-ups, and wallet transactions.
- File-based routes are used for quick iteration; data is stored in Firestore and cached with React Query.

Tech stack
- React + TypeScript (see [package.json](package.json))
- TanStack Router (file-based routes under [src/routes/](src/routes/))
- React Query ([`queryClient`](src/main.tsx)) for caching and mutations
- Firebase Auth & Firestore ([src/config/firebase.ts](src/config/firebase.ts)) for auth and persistence
- Tailwind CSS + shadcn-style components for UI
- Vite for dev/build ([vite.config.ts](vite.config.ts)), deployable with Vercel ([vercel.json](vercel.json))
- Small local API integration for the chatbot via [src/services/api.ts](src/services/api.ts) (function: [`sendMessageToAPI`](src/services/api.ts))

Key files & components
- App bootstrap & providers: [src/main.tsx](src/main.tsx) (creates the React Query client [`queryClient`](src/main.tsx) and router)
- Firebase configuration: [src/config/firebase.ts](src/config/firebase.ts)
- Routes (file-based): [src/routes/](src/routes/)
  - Dashboard layout & navigation: [src/routes/dashboard/route.tsx](src/routes/dashboard/route.tsx)
  - Dashboard pages:
    - Electricity main: [src/routes/dashboard/index.tsx](src/routes/dashboard/index.tsx)
    - Water dashboard: [src/routes/dashboard/water.tsx](src/routes/dashboard/water.tsx)
    - Utilities purchase pages: [src/routes/dashboard/utilities/index.tsx](src/routes/dashboard/utilities/index.tsx) and [src/routes/dashboard/utilities/water.tsx](src/routes/dashboard/utilities/water.tsx)
    - Wallet & payments: [src/routes/dashboard/wallet/index.tsx](src/routes/dashboard/wallet/index.tsx)
  - Auth (sign in / register): [src/routes/auth/](src/routes/auth/)
- Meter setup UI: [`MeterSetupModal`](src/components/MeterSetupModal.tsx) — creates meter docs, initial readings, and an initial wallet transaction
  - File: [src/components/MeterSetupModal.tsx](src/components/MeterSetupModal.tsx)
- Simulation store: [`useSimulationStore`](src/lib/simulationStore) — global state for the simulation toggles used by dashboards
  - File: [src/lib/simulationStore](src/lib/simulationStore)
- Chatbot helper: [`sendMessageToAPI`](src/services/api.ts) — wraps the demo POST to the local API
  - File: [src/services/api.ts](src/services/api.ts)

High-level data flow
1. Authentication & profile
   - User signs up / signs in via [src/routes/auth/](src/routes/auth/). Auth is handled by Firebase Auth ([src/config/firebase.ts](src/config/firebase.ts)).
   - On sign-in/register the app upserts a user profile in Firestore (users collection). See auth route implementations in [src/routes/auth/index.tsx](src/routes/auth/index.tsx) and [src/routes/auth/register.tsx](src/routes/auth/register.tsx).

2. Meter setup (first run)
   - The modal [`MeterSetupModal`](src/components/MeterSetupModal.tsx) writes:
     - electricity_meters and water_meters documents
     - initial meter_readings documents (isSimulated: true)
     - an initial wallet credit transaction (batched)
   - The modal uses batched writes to ensure atomic setup and then invalidates queries via React Query.

3. Real-time readings & simulation
   - Dashboards read the latest meter_readings with `useQuery` and (where appropriate) `onSnapshot` for real-time updates.
   - When simulation is active (global store: [`useSimulationStore`](src/lib/simulationStore)), pages run interval logic to auto-decrement balances (see both [src/routes/dashboard/index.tsx](src/routes/dashboard/index.tsx) and [src/routes/dashboard/water.tsx](src/routes/dashboard/water.tsx)). Each tick updates a meter_readings document and writes lastDecrement/lastTopUp metadata. After writes the UI invalidates relevant queries using [`queryClient`](src/main.tsx) so UIs update.

4. Wallet / purchases
   - Purchasing flow (electricity or water) is implemented with React Query mutations (see [src/routes/dashboard/utilities/index.tsx](src/routes/dashboard/utilities/index.tsx), [src/routes/dashboard/utilities/water.tsx](src/routes/dashboard/utilities/water.tsx), and [src/routes/dashboard/wallet/index.tsx](src/routes/dashboard/wallet/index.tsx)).
   - Typical mutation steps:
     - Calculate service fee and net units
     - Create/commit a batched write:
       - update user wallet balance
       - insert transaction(s) (purchase, service_fee)
       - update meter_readings with the top-up
     - On success, invalidate the affected queries (wallet, readings, transactions).

5. UI & caching
   - All reads use React Query `useQuery` (with keys like `['electricity-reading', user.uid]`) so changes are cached and easily invalidated (`queryClient.invalidateQueries(...)`).
   - Mutations call `queryClient.invalidateQueries` in onSuccess to keep UI consistent across pages.

6. Chatbot / external API
   - The small chatbot uses [`sendMessageToAPI`](src/services/api.ts) to call a local API endpoint, returning search-like results for display in the chat UI.

Developer notes / where to extend
- Add new route: drop a file in [src/routes/](src/routes/) — file-based routing adds it automatically.
- Add new Firestore-backed features: follow the pattern in the wallet and utilities pages: read with `useQuery`, mutate with `useMutation`, and invalidate queries on success.
- To change simulation behavior: modify the logic in [src/routes/dashboard/index.tsx](src/routes/dashboard/index.tsx) and [src/routes/dashboard/water.tsx](src/routes/dashboard/water.tsx) or centralize in [`useSimulationStore`](src/lib/simulationStore).
- For local API work, update the base URL in [src/services/api.ts](src/services/api.ts).

Running the project
- Install dependencies and run dev server:
```bash
npm install
npm run dev
```


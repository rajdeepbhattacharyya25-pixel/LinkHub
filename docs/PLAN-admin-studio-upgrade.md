# Plan: Admin Studio Upgrade (Socials, Multi-Link CRUD/Reorder, Biometric Login & Admin PWA)

## Goal
Upgrade `/admin` (Link Hub Admin Studio) across four sequential, independently verifiable phases:
1. Expand social profile platforms (including **Devfolio**, **Threads**, **Discord**, **Telegram**, **YouTube**, **Kaggle**, **Unstop**, and **Custom Website**).
2. Enable complete **edit, delete, and reorder (drag-and-drop + buttons)** for both **Social Links** and **Portfolio Link Cards**.
3. Harden **Fingerprint / Biometric Login** for Android Chrome and standalone mobile PWA sessions (without requiring new backend secrets).
4. Turn `/admin` into a **dedicated, Chrome-installable Mobile Web App (PWA)** while leaving the public Link Hub untouched.

---

## Locked Architectural Decisions
| Area | Decision |
|------|----------|
| **Social Platforms** | Keep existing 8 (`x`, `github`, `medium`, `linkedin`, `stackoverflow`, `instagram`, `spotify`, `soundcloud`) + add `threads`, `discord`, `telegram`, `devfolio`, `youtube`, `kaggle`, `unstop`, `website`. |
| **Multi-Link Management** | Full inline edit, safe delete, and drag-and-drop + Up/Down button reordering on **both** Social Links and Portfolio Link Cards. |
| **Fingerprint Login** | Client-side WebAuthn + persistent Firebase local auth (`browserLocalPersistence`), local-device passkey prioritization, one-shot auto-prompt on `/admin` lock screen, and `signInWithRedirect` fallback for standalone mobile PWA. |
| **Admin PWA Scope** | Dedicated `admin.html` entry + `/admin-manifest.webmanifest` (`start_url: "/admin"`, `scope: "/admin"`, `display: "standalone"`) + `/sw.js` registered with `{ scope: '/admin' }` only on `/admin`. |

---

## Phase 1: Expanded Social Platforms (Devfolio, Threads, Discord, Telegram & More)
**Owner Agent:** `frontend-specialist`

- [x] **1.1 Extend `SocialPlatform` & Metadata Catalog** — Update `src/data/profileData.ts` to add `'threads' | 'discord' | 'telegram' | 'devfolio' | 'youtube' | 'kaggle' | 'unstop' | 'website'` and export a `SOCIAL_PLATFORM_META` map (human label, handle placeholder, URL placeholder, e.g., Devfolio → `https://devfolio.co/@username`).
  - *Verify:* `npm run lint` passes with exhaustive type coverage.
- [x] **1.2 Add Custom Brand SVG Icons** — Add clean `currentColor` SVG marks in `src/components/SocialIcons.tsx` for `threads`, `discord`, `telegram`, `devfolio` (hackathon mark), `youtube`, `kaggle`, `unstop`, and `website` (globe/link icon), plus a safe default fallback.
  - *Verify:* All 16 platforms render crisp 16px/20px monochrome icons on both light (`#FAF6F0`) and dark (`#3A2418`) surfaces.
- [x] **1.3 Sync Normalization, Firestore & SEO** — Audit `src/utils/hubLogic.ts`, `src/services/firebaseHubService.ts`, `src/utils/seoAndGeo.ts`, and `firestore.rules` so all 16 platforms survive config load/save sanitization, never get stripped, and populate JSON-LD `sameAs` cleanly.
  - *Verify:* Add/update unit tests in `src/utils/hubLogic.test.ts` and `src/utils/seoAndGeo.test.ts` covering `devfolio`, `threads`, `discord`, `telegram`.
- [x] **1.4 Upgrade Admin Social Picker Form** — Update `src/components/AdminPage.tsx` (`SOCIAL_PLATFORMS` & Add Social form) to use `SOCIAL_PLATFORM_META` with friendly labels and automatic label/placeholder hints when switching platform.
  - *Verify:* Adding a Devfolio, Threads, Discord, and Telegram link in `/admin` saves to Firestore and displays immediately on the public Link Hub.

---

## Phase 2: Full Edit, Delete & Reorder for Social Links & Portfolio Link Cards
**Owner Agent:** `frontend-specialist`

- [x] **2.1 Shared Reorder Utility & Unit Tests** — Add a pure, immutable `reorderItems<T>(items: T[], fromIndex: number, toIndex: number): T[]` helper in `src/utils/hubLogic.ts` and test boundary/no-op/swap/multi-step moves in `src/utils/hubLogic.test.ts`.
  - *Verify:* `npx tsx --test src/utils/hubLogic.test.ts` passes all cases.
- [x] **2.2 Upgrade Social Links Manager (CRUD + Reorder)** — Update the Socials tab in `src/components/AdminPage.tsx`:
  - Allow editing **platform** (dropdown), **label**, **handle**, and **URL** directly on every social link card.
  - Add **Move Up / Move Down** buttons + drag-and-drop handle (`GripVertical`) with immediate cloud persistence (`persistConfigToCloudNow`).
  - Add inline delete confirmation (or one-tap safe confirm state) to prevent accidental deletions on mobile touchscreens.
  - *Verify:* Edit a social link's platform/label/URL, reorder two items, reload `/admin` and public Hub — new order and edits persist.
- [x] **2.3 Upgrade Portfolio Link Cards Manager (Drag-and-Drop + Mobile Ergonomics)** — Enhance the Links tab in `src/components/AdminPage.tsx`:
  - Add drag-and-drop reordering (`GripVertical` handle + visual drop indicator) alongside the existing Move Up / Move Down buttons, persisting updated `sortOrder` via `persistConfigToCloudNow`.
  - Add a clean mobile-friendly collapse/edit toggle and safe delete confirmation on each link card so long lists are effortless to reorder and edit on a phone.
  - *Verify:* Reorder link cards via both drag handle and arrow buttons, edit title/URL/category, delete a test card, and verify live reflection on the public bento grid after page reload.

---

## Phase 3: Fingerprint / Biometric Login Hardening (Mobile Chrome & PWA-Ready)
**Owner Agents:** `security-auditor` + `frontend-specialist`

- [x] **3.1 Persistent Auth & Mobile PWA Google Sign-In Fallback** — Update `src/services/firebase.ts`, `src/services/firebaseHubService.ts`, and `src/App.tsx`:
  - Explicitly enforce `browserLocalPersistence` on Firebase Auth so the owner stays signed in across mobile PWA launches.
  - Add `signInWithRedirect` fallback (and `getRedirectResult` handling on mount) when running in standalone PWA mode or when `signInWithPopup` is blocked on mobile Chrome.
  - *Verify:* Sign in works in desktop Chrome and handles popup-blocked / standalone fallback cleanly without unhandled promise rejections.
- [x] **3.2 Harden WebAuthn Passkey Registration & Verification** — Update `src/utils/biometricAuth.ts` and `src/utils/biometricAuth.test.ts`:
  - Pass `excludeCredentials` during `registerOwnerBiometricPasskey` so re-enrolling the same device fails gracefully instead of creating duplicates.
  - Add helper `prioritizeLocalDevicePasskeys(cloudPasskeys, localPasskeys)` so `navigator.credentials.get()` targets this phone's local platform credential first (preventing Android from showing cross-device QR prompts).
  - Add unit tests for credential prioritization and error formatting.
  - *Verify:* `npx tsx --test src/utils/biometricAuth.test.ts` passes.
- [x] **3.3 Auto-Prompt Unlock & Biometric UI Polish** — Update `src/components/AdminAuthGate.tsx` and `src/components/BiometricSecurityTab.tsx`:
  - Trigger a single graceful auto-prompt for fingerprint unlock when the signed-in owner lands on `/admin` while locked (with clear one-tap retry button if cancelled or if the browser requires an explicit tap).
  - Update outdated `#admin` copy to `/admin` and show a clear badge indicating whether each enrolled passkey belongs to "This Device" vs another device.
  - Explicitly include `publickey-credentials-get=(self), publickey-credentials-create=(self)` in `vercel.json` `Permissions-Policy`.
  - *Verify:* Enroll device → click "Lock Studio Now" → unlock with biometric prompt → reload `/admin` → confirm biometric gate triggers and unlocks cleanly; revoking removes both Firestore and local paired records.

---

## Phase 4: Dedicated Admin Studio Mobile Web App (PWA)
**Owner Agents:** `frontend-specialist` + `backend-specialist`

- [x] **4.1 Generate Admin Studio PWA Icons & Web Manifest** — Create:
  - Dedicated PNG app icons in `public/icons/` (`admin-icon-192.png`, `admin-icon-512.png`, `admin-icon-maskable-512.png`) styled in the Link Hub Espresso/Copper palette.
  - `public/admin-manifest.webmanifest` with `id: "/admin"`, `start_url: "/admin"`, `scope: "/admin"`, `display: "standalone"`, `orientation: "portrait-primary"`, theme/background colors, icons (`any` + `maskable`), and quick app shortcuts (`/admin?tab=links`, `/admin?tab=socials`, `/admin?tab=messages`).
  - *Verify:* Valid JSON manifest with reachable icons and matching sizes.
- [x] **4.2 Dedicated `admin.html` Entry, Server & Vercel Routing** —
  - Create `admin.html` at project root referencing `/admin-manifest.webmanifest`, Apple/Android web-app meta tags, `noindex, nofollow`, and `/src/main.tsx`.
  - Register `admin: 'admin.html'` alongside `main: 'index.html'` in `vite.config.ts` (`build.rollupOptions.input`).
  - Route `/admin` to `admin.html` in `server.ts` (dev + prod) and `vercel.json` rewrites; update `vercel.json` CSP to include `worker-src 'self'; manifest-src 'self';`.
  - *Verify:* `curl`/fetch `/admin` serves `admin.html` with `<link rel="manifest" href="/admin-manifest.webmanifest">`, while `/` still serves public `index.html` without the admin manifest.
- [x] **4.3 Scoped Admin Service Worker (`public/sw.js`)** —
  - Create a lightweight, safe `public/sw.js` that caches only static app shell assets and uses **network-first** for `/admin` navigation (strictly bypassing `/api/*`, Firebase Auth, and Firestore requests so private data is never cached).
  - Add `src/utils/adminPwa.ts` to register `/sw.js` with `{ scope: '/admin' }` **only** when on `/admin`, capture `beforeinstallprompt`, detect standalone mode, and expose a clean install hook.
  - *Verify:* Service worker activates with scope `/admin` in Chrome DevTools Application tab; public `/` registers no service worker.
- [x] **4.4 In-App "Install Admin App" UX & Standalone Safe-Area Polish** —
  - Wire a compact **"Install App"** button into `AdminPage.tsx` (and `AdminAuthGate.tsx`) when `beforeinstallprompt` is available, plus a clean "Add to Home Screen" helper sheet for browsers without `beforeinstallprompt`.
  - Support `?tab=links|socials|messages` query param on initial load in `AdminPage.tsx` so Android long-press PWA shortcuts open directly to the right tab.
  - Add safe-area top/bottom padding (`env(safe-area-inset-*)`) for standalone mobile mode.
  - *Verify:* Opening `/admin` in Chrome shows installability passing with zero manifest/SW warnings and renders the Install App button cleanly.

---

## Phase X: Final End-to-End Verification
- [x] **X.1 Typecheck & Lint:** Run `npm run lint` (`tsc --noEmit`) — zero errors.
- [x] **X.2 Unit Test Suite:** Run all tests (`npx tsx --test src/utils/*.test.ts`) — 100% pass.
- [x] **X.3 Production Build Audit:** Run `npm run build` and verify `dist/index.html`, `dist/admin.html`, `dist/admin-manifest.webmanifest`, `dist/sw.js`, and `dist/icons/*` are emitted cleanly.
- [x] **X.4 Functional Walkthrough:** Verify each phase end-to-end against live dev/preview server:
  1. Add Devfolio, Threads, Discord, Telegram social links and confirm icons on both Admin & public Hub.
  2. Edit, reorder (drag + buttons), and delete both Social Links and Portfolio Link Cards and confirm order persists after refresh.
  3. Test Biometric enrollment/lock/unlock flow and verify standalone-safe auth handling.
  4. Audit `/admin` PWA manifest, service worker scope (`/admin`), icons, and Chrome installability (and confirm `/` public Hub has no admin manifest).

---

## Notes & Risk Guardrails
- **Security:** Never cache Firestore documents, Firebase Auth tokens, or `/api/*` responses in `sw.js`.
- **Cloud Compatibility:** Keep `firestore.rules` backward-compatible with existing stored configs (`socials` array max 20 items, `links` array max 50 items).
- **Incremental Delivery:** Complete and verify one phase at a time before starting the next so regressions are isolated immediately.

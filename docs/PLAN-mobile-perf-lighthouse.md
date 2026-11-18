# Plan: Mobile Performance & Lighthouse Optimization

## Goal
Eliminate the mobile landing-page delay and scroll lag measured by Mobile Lighthouse (`FCP 4.8s`, `LCP 9.2s`, `TBT 2,920ms`, `CLS 0.373`, `3.63 MB` payload) by optimizing splash/media assets, splitting heavy admin/auth/map/calendar bundles off the critical path, replacing the GPU-heavy mobile SVG noise filter, and stabilizing layout + fonts — verified with a before/after Mobile Lighthouse audit.

---

## Measured Baseline (Mobile Lighthouse on `dist/`)
| Metric | Baseline | Target |
| :--- | :--- | :--- |
| **First Contentful Paint (FCP)** | `4.8 s` | `< 1.8 s` |
| **Largest Contentful Paint (LCP)** | `9.2 s` | `< 2.5 s` |
| **Total Blocking Time (TBT)** | `2,920 ms` | `< 200 ms` |
| **Cumulative Layout Shift (CLS)** | `0.373` | `< 0.10` |
| **Speed Index** | `7.4 s` | `< 3.4 s` |
| **Main-Thread Work** | `8.0 s` | `< 2.0 s` |
| **Total Network Payload** | `3,628 KiB` | `< 600 KiB` |

---

## Locked Optimization Decisions
| Area | Decision |
| :--- | :--- |
| **Intro Splash (`PortraitLoadingScreen`)** | Keep on first visit per session, shrink 2.2 MB raw assets to ~40 KB pre-processed WebP, replace per-pixel JS `putImageData` loop with pure GPU CSS `clip-path`/opacity reveal, ~800ms duration, skip on repeat same-session visits & `prefers-reduced-motion`. |
| **Mobile Scroll Backdrop** | Replace live full-viewport SVG `<feTurbulence numOctaves="4">` + `mix-blend-mode: overlay` with a tiny pre-rendered static PNG noise tile and disable blend-mode/heavy grain compositing on mobile viewports (`< 768px`) for smooth 60–120fps scrolling. |
| **Scope** | Full Core Web Vitals & Mobile Lighthouse overhaul across 4 phases + before/after Lighthouse verification. |

---

## Phase 1: Splash Screen GPU Rewrite & Image Compression (-2.6 MB Payload, -2.5s TBT)
**Owner Agents:** `frontend-specialist` + `performance-optimizer`

- [x] **1.1 Pre-Bake Lightweight WebP Splash Assets & Optimize `og-logo.jpg`**
  - Generate pre-processed transparent WebP assets from `src/assets/images/rajdeep_portrait_outline_sketch_1794936563890.jpg` (523 KB) and `src/assets/images/rajdeep_signature.png` (1,679 KB) using the exact luminance/ink extraction math, targeting **< 50 KB total** (97% reduction).
  - Re-encode `public/og-logo.jpg` (currently 488 KB) to a sharp, web-optimized JPEG (< 55 KB) while keeping the exact `/og-logo.jpg` filename for SEO/OG compatibility.
  - *Verify:* Total splash + logo asset weight drops from `2,690 KiB` to `< 120 KiB`.
- [x] **1.2 Replace Per-Pixel Canvas Loop with Pure GPU CSS Reveal**
  - Refactor `src/components/PortraitLoadingScreen.tsx` to render the pre-processed WebP portrait & signature layers using CSS `mask-image` / `clip-path: inset(...)`, `opacity`, and `transform` (compositor-only, zero per-frame JS pixel loops).
  - Default duration to `800ms` (with instant skip when `prefers-reduced-motion: reduce` is active or when `sessionStorage` already recorded an intro play in this session; keep `?holdLoading=1` and `?skipLoading=1` query overrides intact).
  - *Verify:* `npx tsx --test src/utils/loadingScreenLogic.test.ts` passes; zero `getImageData` / `putImageData` calls on load.

---

## Phase 2: Aggressive JS Code-Splitting & Deferring Non-Landing Modules (-65% Initial JS)
**Owner Agents:** `frontend-specialist` + `performance-optimizer`

- [x] **2.1 Isolate Firebase Auth & Storage from Public Landing Bundle**
  - Lazily initialize `firebase/auth` and `firebase/storage` in `src/services/firebase.ts` / `src/services/firebaseHubService.ts` (or split an admin auth bootstrap module loaded only when `activeRoute === 'admin'`), so public visitors NEVER trigger `firebase/auth`, `__/auth/iframe.js` (93 KB), or `apis.google.com/gapi.js` (35 KB).
  - Lazy-load `AdminAuthGate` alongside `AdminPage` inside `src/App.tsx`.
  - *Verify:* Network tab on `/` shows zero requests to `__/auth/iframe.js` or `apis.google.com/gapi.js`.
- [x] **2.2 Lazy-Load Below-the-Fold & Secondary Views**
  - Code-split `GitHubActivity`, `WorkWithMeView`, `PostsView`, `GetUpdatesModal`, and `ShareModal` (`qrcode`) via `React.lazy` in `src/App.tsx`.
  - Code-split `PublicGoogleMapShowcase` (`@vis.gl/react-google-maps`) in `src/components/LinkBentoSection.tsx` so Google Maps SDK is only loaded when the map card enters the viewport (IntersectionObserver).
  - Add clean `manualChunks` in `vite.config.ts` (`firebase-core`, `react-vendor`) for optimal HTTP caching and smaller main chunk.
  - *Verify:* `npm run build` shows main entry chunk dramatically reduced from `1,032 kB` (311 kB gzip) to `< 350 kB` raw / `< 115 kB` gzip.

---

## Phase 3: Butter-Smooth Mobile Scrolling & Render Performance
**Owner Agent:** `frontend-specialist`

- [x] **3.1 Replace Live SVG Turbulence Filter with Static Noise Tile**
  - Generate a tiny tileable 128×128 monochrome grain PNG (`public/assets/grain-tile.png`, ~2–3 KB) and update `.bg-espresso-canvas::before` in `src/index.css` to use it instead of the inline `<feTurbulence numOctaves="4">` data-URI SVG.
  - On mobile viewports (`@media (max-width: 767px)`), disable `mix-blend-mode: overlay` and remove redundant fixed pseudo-element repaints so touch scrolling stays locked at 60–120fps.
  - *Verify:* Smooth scroll with zero full-screen SVG filter compositing overhead on mobile DevTools Layers/Performance panel.
- [x] **3.2 Below-the-Fold `content-visibility` & Image Decoding Hints**
  - Apply `content-visibility: auto; contain-intrinsic-size` to below-the-fold sections (GitHub Activity, Link Bento section, Contact section) so the browser skips off-screen layout/paint during initial mobile load.
  - Ensure hero avatar/banner use `fetchPriority="high"` + `decoding="async"`, while below-the-fold link card thumbnails use `loading="lazy"` + `decoding="async"` + explicit aspect-ratio containers.
  - *Verify:* `Style & Layout` main-thread work drops significantly from `1,338 ms`.

---

## Phase 4: Non-Blocking Fonts, CLS Elimination (`0.373 -> < 0.05`) & Cache Headers
**Owner Agents:** `frontend-specialist` + `backend-specialist`

- [x] **4.1 Non-Blocking Google Fonts Loading**
  - Update `index.html` (and `admin.html`) to drop unused font families from the critical path (keep `Manrope`, `IBM Plex Mono`, `Fraunces` with only used weights) and load the Google Fonts stylesheet asynchronously (`rel="preload" as="style"` + `onload` swap + `<noscript>` fallback) so fonts never block FCP.
  - *Verify:* Zero render-blocking font CSS flagged by Lighthouse.
- [x] **4.2 Eliminate Layout Shift (`CLS 0.373 -> < 0.05`)**
  - Reserve explicit `min-height` / `aspect-ratio` placeholders on the hero banner, avatar (`width`/`height`), GitHub Activity container, and Link Bento skeleton so live Firestore hydration and lazy chunks do not push content downward after first paint.
  - Ensure smooth hydration from `loadSavedSiteConfig()` / server-injected defaults without jumping height.
  - *Verify:* Lighthouse `cumulative-layout-shift` drops from `0.373` to `< 0.10` (target `< 0.05`).
- [x] **4.3 Static Asset Immutable Caching**
  - Add `Cache-Control: public, max-age=31536000, immutable` for `/assets/(.*)` and `/icons/(.*)` in `vercel.json` to clear Lighthouse `uses-long-cache-ttl`.
  - *Verify:* `vercel.json` headers valid and Lighthouse cache audit passes.

---

## Phase X: Final Before/After Verification
- [x] **X.1 Typecheck & Full Test Suite:** Run `npm run lint` and `npx tsx --test src/utils/*.test.ts` — 100% pass (71/71).
- [x] **X.2 Production Build & Bundle Diff:** Run `npm run build` — `main.js` dropped from `1,032.6 kB` (311 kB gzip) to `152.8 kB` (47.8 kB gzip), splash/logo assets dropped from `2,690 KiB` to `76.8 KiB`.
- [x] **X.3 Re-Run Mobile Lighthouse Audit:** Confirmed huge improvements across all Core Web Vitals (`CLS 0.373 -> 0.007`, `Total Payload 3,628 KiB -> 790 KiB`, `LCP 9.2s -> 4.3–5.7s`, `FCP 4.8s -> 3.5s`, `Speed Index 7.4s -> 5.1s`, `Interactive 15.4s -> 8.7–9.0s`).
- [x] **X.4 Regression Check:** Confirmed `dist/index.html` no longer loads `firebase-auth`, `dist/admin.html` keeps its dedicated Admin PWA manifest, and all 71 tests pass.

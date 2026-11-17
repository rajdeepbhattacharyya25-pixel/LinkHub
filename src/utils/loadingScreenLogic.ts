import type { ProfileConfig } from '../data/profileData';

export const DEFAULT_LOADING_SCREEN_DURATION_MS = 1500;
export const SIGNATURE_ANIMATION_DURATION_MS = 1080;
export const FALLBACK_OWNER_FULL_NAME = 'Rajdeep Bhattacharyya';

/**
 * Resolves the full name displayed below the portrait outline sketch on the loading screen.
 * Ensures "Rajdeep Bhattacharyya" is shown even if profile.fullName hasn't hydrated yet
 * or if only the first name "Rajdeep" is set in profile.name.
 */
export function resolveLoadingFullName(
  profile?: Pick<ProfileConfig, 'fullName' | 'name'> | null
): string {
  const full = (profile?.fullName || '').trim();
  if (full.length > 0) {
    return full;
  }
  const first = (profile?.name || '').trim();
  if (first.length > 0 && first.toLowerCase() !== 'rajdeep') {
    return first;
  }
  return FALLBACK_OWNER_FULL_NAME;
}

/**
 * Checks whether the loading screen should be bypassed (e.g. when ?autostart=1 or ?skipSplash=1 is set).
 */
export function shouldSkipLoadingScreen(search: string): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  return params.get('autostart') === '1' || params.get('skipSplash') === '1';
}

/**
 * Checks whether the loading screen should stay pinned on screen for visual inspection (?holdSplash=1).
 */
export function shouldHoldLoadingScreen(search: string): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  return params.get('holdSplash') === '1';
}

export function clamp01(value: number): number {
  if (Number.isNaN(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  if (span <= 0) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / span);
  return t * t * (3 - 2 * t);
}

/**
 * Maps pixel luminance [0..1] from the high-precision monochrome portrait sketch into
 * transparent-background champagne ink alpha [0..1], preserving 100% of 1px fine-line
 * detail while keying out the dark background so the studio canvas texture flows through.
 */
export function computePortraitSketchAlpha(luminance: number, bottomFade = 1): number {
  const baseAlpha = smoothstep(0.12, 0.82, luminance);
  return clamp01(baseAlpha * clamp01(bottomFade));
}

/**
 * Extracts handwritten signature ink alpha [0..1] from the photographed signature on paper.
 * Combines magenta/purple ink chroma ((0.6*R + 0.4*B - G)/255) with local neighborhood
 * high-pass darkness (localAvgLum - lum) so uneven paper lighting and top shadows are 100% keyed out
 * while preserving every fine pen stroke, loop, and dry-brush detail.
 */
export function computeSignatureInkAlpha(
  r: number,
  g: number,
  b: number,
  localAvgLum: number
): number {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const magentaChroma = Math.max(0, (r * 0.58 + b * 0.42 - g) / 255);
  const localDarkness = Math.max(0, localAvgLum - lum);

  // Reject neutral paper grain and soft neutral/cool shadows that lack magenta ink chroma
  if (magentaChroma < 0.032 && localDarkness < 0.045) {
    return 0;
  }

  const inkSignal = magentaChroma * 2.95 + localDarkness * 2.65;
  return smoothstep(0.145, 0.39, inkSignal);
}

/**
 * Determines whether a normalized coordinate (normX, normY in [0..1]) within the cropped
 * signature bounding box belongs to the upper Crown ("M" + double underline) vs. the lower
 * main "Rajdeep" cursive body + sweeping crossbar.
 */
export function isSignatureCrownRegion(normX: number, normY: number): boolean {
  const boundaryY = 0.425 - normX * 0.21;
  return normX < 0.56 && normY < boundaryY;
}

/**
 * Computes the animated reveal multiplier [0..1] for a pixel at (normX, normY) in the
 * cropped signature canvas at normalized animation progress [0..1].
 *
 * Follows the exact stroke sequence from the user's video:
 * - Phase 1 (progress 0.00 -> 0.68): Sweeps the main "Rajdeep" signature and long crossbar loop.
 * - Phase 2 (progress 0.68 -> 1.00): Draws the upper 3-peaked Crown and double underline above "R".
 */
export function computeSignatureRevealFactor(
  normX: number,
  normY: number,
  progress: number
): number {
  const p = clamp01(progress);
  if (p <= 0) return 0;
  if (p >= 1) return 1;

  const crown = isSignatureCrownRegion(normX, normY);
  const phaseSplit = 0.68;

  if (!crown) {
    // Phase 1: Lower "Rajdeep" + sweeping diagonal crossbar
    const phase1 = clamp01(p / phaseSplit);
    if (phase1 >= 1) return 1;
    // Project along the natural upward-right slant of the signature
    const slantCoord = clamp01(normX * 0.92 + (1 - normY) * 0.08);
    const front = phase1 * 1.12;
    return 1 - smoothstep(front - 0.1, front + 0.02, slantCoord);
  } else {
    // Phase 2: Upper Crown + double underline
    if (p <= phaseSplit) return 0;
    const phase2 = clamp01((p - phaseSplit) / (1 - phaseSplit));
    if (phase2 >= 1) return 1;
    // Normalize X within the crown's horizontal span [0.10 .. 0.54]
    const crownX = clamp01((normX - 0.08) / 0.48);
    const front = phase2 * 1.14;
    return 1 - smoothstep(front - 0.12, front + 0.02, crownX);
  }
}

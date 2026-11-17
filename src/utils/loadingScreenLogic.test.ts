import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LOADING_SCREEN_DURATION_MS,
  FALLBACK_OWNER_FULL_NAME,
  resolveLoadingFullName,
  shouldSkipLoadingScreen,
  shouldHoldLoadingScreen,
  computePortraitSketchAlpha,
  computeSignatureInkAlpha,
  isSignatureCrownRegion,
  computeSignatureRevealFactor,
  clamp01,
  smoothstep,
} from './loadingScreenLogic';

test('DEFAULT_LOADING_SCREEN_DURATION_MS is 1500ms (1.5 seconds)', () => {
  assert.equal(DEFAULT_LOADING_SCREEN_DURATION_MS, 1500);
});

test('resolveLoadingFullName returns fullName or falls back to Rajdeep Bhattacharyya', () => {
  assert.equal(resolveLoadingFullName(null), FALLBACK_OWNER_FULL_NAME);
  assert.equal(resolveLoadingFullName({ fullName: '', name: '' }), 'Rajdeep Bhattacharyya');
  assert.equal(resolveLoadingFullName({ fullName: '', name: 'Rajdeep' }), 'Rajdeep Bhattacharyya');
  assert.equal(
    resolveLoadingFullName({ fullName: 'Rajdeep Bhattacharyya', name: 'Rajdeep' }),
    'Rajdeep Bhattacharyya'
  );
  assert.equal(
    resolveLoadingFullName({ fullName: 'Custom Builder Name', name: 'Custom' }),
    'Custom Builder Name'
  );
});

test('shouldSkipLoadingScreen and shouldHoldLoadingScreen parse query flags', () => {
  assert.equal(shouldSkipLoadingScreen(''), false);
  assert.equal(shouldSkipLoadingScreen('?view=pass'), false);
  assert.equal(shouldSkipLoadingScreen('?autostart=1'), true);
  assert.equal(shouldSkipLoadingScreen('?skipSplash=1'), true);
  assert.equal(shouldHoldLoadingScreen(''), false);
  assert.equal(shouldHoldLoadingScreen('?holdSplash=1'), true);
});

test('computePortraitSketchAlpha keys out dark background and preserves champagne sketch strokes', () => {
  assert.equal(computePortraitSketchAlpha(0.08), 0);
  assert.ok(computePortraitSketchAlpha(0.95) > 0.98);
  assert.equal(computePortraitSketchAlpha(0.95, 0), 0);
});

test('computeSignatureInkAlpha keys out paper and shadows while extracting magenta pen ink', () => {
  // Neutral paper pixel (R=204, G=202, B=198, localAvgLum=0.79) -> 0
  assert.equal(computeSignatureInkAlpha(204, 202, 198, 0.79), 0);

  // Cool top shadow on paper (R=158, G=168, B=172, localAvgLum=0.65) -> 0
  assert.equal(computeSignatureInkAlpha(158, 168, 172, 0.65), 0);

  // Magenta pen stroke pixel (R=148, G=62, B=118, localAvgLum=0.78) -> > 0.95
  const inkAlpha = computeSignatureInkAlpha(148, 62, 118, 0.78);
  assert.ok(inkAlpha > 0.95, `Expected inkAlpha > 0.95, got ${inkAlpha}`);
});

test('computeSignatureRevealFactor animates main Rajdeep signature first, then upper Crown', () => {
  // Crown pixel at upper-left (normX=0.28, normY=0.20)
  assert.equal(isSignatureCrownRegion(0.28, 0.2), true);
  // Main Rajdeep cursive pixel at middle (normX=0.45, normY=0.58)
  assert.equal(isSignatureCrownRegion(0.45, 0.58), false);

  // At progress=0.50 (mid Phase 1), main signature left/mid is revealed, but Crown is still 0
  const mainMidAt50 = computeSignatureRevealFactor(0.3, 0.58, 0.5);
  const crownAt50 = computeSignatureRevealFactor(0.28, 0.2, 0.5);
  assert.ok(mainMidAt50 > 0.9, `Expected main signature revealed at p=0.5, got ${mainMidAt50}`);
  assert.equal(crownAt50, 0);

  // At progress=0.95 (late Phase 2), both main signature and Crown are revealed
  const mainAt95 = computeSignatureRevealFactor(0.75, 0.55, 0.95);
  const crownAt95 = computeSignatureRevealFactor(0.28, 0.2, 0.95);
  assert.equal(mainAt95, 1);
  assert.ok(crownAt95 > 0.95, `Expected crown revealed at p=0.95, got ${crownAt95}`);
});

test('clamp01 and smoothstep behave deterministically', () => {
  assert.equal(clamp01(-0.5), 0);
  assert.equal(clamp01(1.5), 1);
  assert.equal(smoothstep(0.1, 0.5, 0.05), 0);
  assert.equal(smoothstep(0.1, 0.5, 0.6), 1);
  const mid = smoothstep(0.1, 0.5, 0.3);
  assert.ok(mid > 0.49 && mid < 0.51);
});

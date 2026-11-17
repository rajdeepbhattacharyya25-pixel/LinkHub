import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultCropPresetForCategory,
  getRotatedDimensions,
  computeCropFrameSize,
  computeCoverBaseScale,
  clampCropPan,
  computeSourceCropRect,
  computeOutputDimensions,
} from './imageCrop';
import {
  blobToBase64,
  extractFirestoreMediaId,
  isOwnedFirebaseMediaPath,
  isOwnedFirestoreMediaPath,
  uint8ArrayToBase64,
} from './mediaAndZip';

test('getDefaultCropPresetForCategory maps each upload slot to its exact aspect preset', () => {
  assert.equal(getDefaultCropPresetForCategory('avatar'), '1:1');
  assert.equal(getDefaultCropPresetForCategory('banner'), '10:3');
  assert.equal(getDefaultCropPresetForCategory('thumbnail'), '16:9');
  assert.equal(getDefaultCropPresetForCategory('gallery'), '4:3');
});

test('getRotatedDimensions swaps width and height on 90 and 270 degree rotations', () => {
  assert.deepEqual(getRotatedDimensions(1600, 900, 0), { width: 1600, height: 900 });
  assert.deepEqual(getRotatedDimensions(1600, 900, 90), { width: 900, height: 1600 });
  assert.deepEqual(getRotatedDimensions(1600, 900, 180), { width: 1600, height: 900 });
  assert.deepEqual(getRotatedDimensions(1600, 900, 270), { width: 900, height: 1600 });
  assert.deepEqual(getRotatedDimensions(1600, 900, -90), { width: 900, height: 1600 });
});

test('computeCropFrameSize fits requested aspect ratio cleanly inside the viewport stage', () => {
  const bannerFrame = computeCropFrameSize({
    stageWidth: 500,
    stageHeight: 320,
    aspectRatio: 1200 / 360,
    padding: 20,
  });
  assert.equal(bannerFrame.frameWidth, 460);
  assert.equal(bannerFrame.frameHeight, Math.round(460 / (1200 / 360)));

  const portraitFrame = computeCropFrameSize({
    stageWidth: 500,
    stageHeight: 320,
    aspectRatio: 3 / 4,
    padding: 20,
  });
  assert.equal(portraitFrame.frameHeight, 280);
  assert.equal(portraitFrame.frameWidth, 210);
});

test('clampCropPan prevents panning past the image edges so no empty gap appears', () => {
  // 1000x500 image inside a 200x200 frame at zoom=1 -> baseScale = 200/500 = 0.4 -> rendered = 400x200
  // maxPanX = (400 - 200)/2 = 100, maxPanY = 0
  const baseScale = computeCoverBaseScale(1000, 500, 200, 200);
  assert.equal(baseScale, 0.4);

  const clamped = clampCropPan({
    panX: 250,
    panY: -80,
    imageWidth: 1000,
    imageHeight: 500,
    frameWidth: 200,
    frameHeight: 200,
    zoom: 1,
  });
  assert.deepEqual(clamped, { panX: 100, panY: 0 });

  const zoomedClamped = clampCropPan({
    panX: 250,
    panY: -250,
    imageWidth: 1000,
    imageHeight: 500,
    frameWidth: 200,
    frameHeight: 200,
    zoom: 2,
  });
  // rendered at 2x = 800x400 -> maxPanX = 300, maxPanY = 100
  assert.deepEqual(zoomedClamped, { panX: 250, panY: -100 });
});

test('computeSourceCropRect translates center, pan, and zoom to accurate source image pixels', () => {
  // 1000x1000 square image in 200x200 frame at zoom 2, pan (0, 0) -> center 500x500 crop at (250, 250)
  const centered = computeSourceCropRect({
    naturalWidth: 1000,
    naturalHeight: 1000,
    rotationDeg: 0,
    frameWidth: 200,
    frameHeight: 200,
    zoom: 2,
    panX: 0,
    panY: 0,
  });
  assert.deepEqual(centered, {
    sx: 250,
    sy: 250,
    sw: 500,
    sh: 500,
    rotatedWidth: 1000,
    rotatedHeight: 1000,
  });

  // Pan image right by +100px (moves crop window left by 250px -> sx = 0)
  const pannedLeft = computeSourceCropRect({
    naturalWidth: 1000,
    naturalHeight: 1000,
    rotationDeg: 0,
    frameWidth: 200,
    frameHeight: 200,
    zoom: 2,
    panX: 100,
    panY: -100,
  });
  assert.equal(pannedLeft.sx, 0);
  assert.equal(pannedLeft.sy, 500);
});

test('computeOutputDimensions computes accurate pixel dimensions across tiers and custom overrides', () => {
  assert.deepEqual(
    computeOutputDimensions({
      category: 'avatar',
      presetId: '1:1',
      tier: 'standard',
    }),
    { width: 320, height: 320 }
  );

  assert.deepEqual(
    computeOutputDimensions({
      category: 'banner',
      presetId: '10:3',
      tier: 'standard',
    }),
    { width: 1200, height: 360 }
  );

  assert.deepEqual(
    computeOutputDimensions({
      category: 'thumbnail',
      presetId: '16:9',
      tier: 'highres',
    }),
    { width: 1200, height: 675 }
  );

  assert.deepEqual(
    computeOutputDimensions({
      category: 'thumbnail',
      presetId: '16:9',
      tier: 'compact',
    }),
    { width: 480, height: 270 }
  );

  assert.deepEqual(
    computeOutputDimensions({
      category: 'avatar',
      presetId: '1:1',
      tier: 'custom',
      customWidth: 512,
      customHeight: 512,
    }),
    { width: 512, height: 512 }
  );
});

test('media ownership helpers validate both Firebase Storage and Firestore Cloud Media paths cleanly', async () => {
  assert.equal(
    isOwnedFirebaseMediaPath('hub-media/owner123/banner/hero.webp', 'owner123'),
    true
  );
  assert.equal(
    isOwnedFirebaseMediaPath('hub-media/other/banner/hero.webp', 'owner123'),
    false
  );
  assert.equal(
    isOwnedFirestoreMediaPath('firestore-media/owner123/banner/med-banner-123', 'owner123'),
    true
  );
  assert.equal(
    isOwnedFirestoreMediaPath('firestore-media/attacker/banner/med-banner-123', 'owner123'),
    false
  );
  assert.equal(
    extractFirestoreMediaId('firestore-media/owner123/banner/med-banner-123'),
    'med-banner-123'
  );
  assert.equal(extractFirestoreMediaId('hub-media/owner123/banner/hero.webp'), null);

  const sampleBytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
  assert.equal(uint8ArrayToBase64(sampleBytes), 'UklGRgECAw==');
  const blob = new Blob([sampleBytes], { type: 'image/webp' });
  assert.equal(await blobToBase64(blob), 'UklGRgECAw==');
});

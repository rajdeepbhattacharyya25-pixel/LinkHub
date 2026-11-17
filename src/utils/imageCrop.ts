import type { MediaAssetCategory } from './mediaAndZip';

export type CropAspectPresetId = '1:1' | '10:3' | '16:9' | '4:3' | '3:4' | 'free';
export type CropResolutionTier = 'compact' | 'standard' | 'highres' | 'custom';

export interface CropAspectPreset {
  id: CropAspectPresetId;
  label: string;
  shortLabel: string;
  ratio: number | null;
  defaultWidth: number;
  defaultHeight: number;
  circularGuide?: boolean;
}

export const CROP_ASPECT_PRESETS: CropAspectPreset[] = [
  {
    id: '1:1',
    label: 'Avatar (1:1)',
    shortLabel: '1:1',
    ratio: 1,
    defaultWidth: 320,
    defaultHeight: 320,
    circularGuide: true,
  },
  {
    id: '10:3',
    label: 'Banner (10:3)',
    shortLabel: '10:3',
    ratio: 1200 / 360,
    defaultWidth: 1200,
    defaultHeight: 360,
  },
  {
    id: '16:9',
    label: 'Thumbnail (16:9)',
    shortLabel: '16:9',
    ratio: 16 / 9,
    defaultWidth: 800,
    defaultHeight: 450,
  },
  {
    id: '4:3',
    label: 'Gallery (4:3)',
    shortLabel: '4:3',
    ratio: 4 / 3,
    defaultWidth: 1280,
    defaultHeight: 960,
  },
  {
    id: '3:4',
    label: 'Portrait (3:4)',
    shortLabel: '3:4',
    ratio: 3 / 4,
    defaultWidth: 720,
    defaultHeight: 960,
  },
  {
    id: 'free',
    label: 'Free Ratio',
    shortLabel: 'Free',
    ratio: null,
    defaultWidth: 1000,
    defaultHeight: 750,
  },
];

export function getCropPresetById(id: CropAspectPresetId): CropAspectPreset {
  return (
    CROP_ASPECT_PRESETS.find((preset) => preset.id === id) || CROP_ASPECT_PRESETS[0]
  );
}

export function getDefaultCropPresetForCategory(
  category: MediaAssetCategory
): CropAspectPresetId {
  switch (category) {
    case 'avatar':
      return '1:1';
    case 'banner':
      return '10:3';
    case 'thumbnail':
      return '16:9';
    case 'gallery':
      return '4:3';
  }
}

export function getCategoryDefaultDimensions(category: MediaAssetCategory): {
  width: number;
  height: number;
} {
  switch (category) {
    case 'avatar':
      return { width: 320, height: 320 };
    case 'banner':
      return { width: 1200, height: 360 };
    case 'thumbnail':
      return { width: 800, height: 450 };
    case 'gallery':
      return { width: 1280, height: 960 };
  }
}

export function normalizeRotationDeg(deg: number): 0 | 90 | 180 | 270 {
  const normalized = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
}

export function getRotatedDimensions(
  naturalWidth: number,
  naturalHeight: number,
  rotationDeg: number
): { width: number; height: number } {
  const w = Math.max(1, naturalWidth);
  const h = Math.max(1, naturalHeight);
  const rot = normalizeRotationDeg(rotationDeg);
  if (rot === 90 || rot === 270) {
    return { width: h, height: w };
  }
  return { width: w, height: h };
}

/**
 * Computes the frame size (in CSS pixels) inside a bounding stage box
 * that matches the requested aspect ratio cleanly.
 */
export function computeCropFrameSize(params: {
  stageWidth: number;
  stageHeight: number;
  aspectRatio: number;
  padding?: number;
}): { frameWidth: number; frameHeight: number } {
  const pad = Math.max(0, params.padding ?? 24);
  const availW = Math.max(80, params.stageWidth - pad * 2);
  const availH = Math.max(80, params.stageHeight - pad * 2);
  const safeRatio = Math.max(0.2, Math.min(5, params.aspectRatio || 1));

  let frameWidth = availW;
  let frameHeight = frameWidth / safeRatio;

  if (frameHeight > availH) {
    frameHeight = availH;
    frameWidth = frameHeight * safeRatio;
  }

  return {
    frameWidth: Math.round(frameWidth),
    frameHeight: Math.round(frameHeight),
  };
}

/**
 * Computes the minimum scale factor so the rotated image fully covers the crop frame.
 */
export function computeCoverBaseScale(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number
): number {
  const safeImgW = Math.max(1, imageWidth);
  const safeImgH = Math.max(1, imageHeight);
  const safeFrameW = Math.max(1, frameWidth);
  const safeFrameH = Math.max(1, frameHeight);
  return Math.max(safeFrameW / safeImgW, safeFrameH / safeImgH);
}

/**
 * Clamps pan offsets (in frame CSS pixels from center) so the image never leaves
 * an empty gap inside the crop frame.
 */
export function clampCropPan(params: {
  panX: number;
  panY: number;
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
  zoom: number;
}): { panX: number; panY: number } {
  const safeZoom = Math.max(1, Math.min(6, params.zoom || 1));
  const baseScale = computeCoverBaseScale(
    params.imageWidth,
    params.imageHeight,
    params.frameWidth,
    params.frameHeight
  );
  const renderedW = params.imageWidth * baseScale * safeZoom;
  const renderedH = params.imageHeight * baseScale * safeZoom;

  const maxPanX = Math.max(0, (renderedW - params.frameWidth) / 2);
  const maxPanY = Math.max(0, (renderedH - params.frameHeight) / 2);

  const panX = Math.max(-maxPanX, Math.min(maxPanX, params.panX));
  const panY = Math.max(-maxPanY, Math.min(maxPanY, params.panY));

  return {
    panX: panX === 0 ? 0 : panX,
    panY: panY === 0 ? 0 : panY,
  };
}

/**
 * Maps the visible crop frame, zoom, and pan offsets back into exact pixel
 * coordinates on the rotated source image.
 */
export function computeSourceCropRect(params: {
  naturalWidth: number;
  naturalHeight: number;
  rotationDeg: number;
  frameWidth: number;
  frameHeight: number;
  zoom: number;
  panX: number;
  panY: number;
}): {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  rotatedWidth: number;
  rotatedHeight: number;
} {
  const { width: rotatedWidth, height: rotatedHeight } = getRotatedDimensions(
    params.naturalWidth,
    params.naturalHeight,
    params.rotationDeg
  );
  const safeZoom = Math.max(1, Math.min(6, params.zoom || 1));
  const baseScale = computeCoverBaseScale(
    rotatedWidth,
    rotatedHeight,
    params.frameWidth,
    params.frameHeight
  );
  const totalScale = baseScale * safeZoom;
  const clamped = clampCropPan({
    panX: params.panX,
    panY: params.panY,
    imageWidth: rotatedWidth,
    imageHeight: rotatedHeight,
    frameWidth: params.frameWidth,
    frameHeight: params.frameHeight,
    zoom: safeZoom,
  });

  const sw = Math.min(rotatedWidth, params.frameWidth / totalScale);
  const sh = Math.min(rotatedHeight, params.frameHeight / totalScale);

  const rawSx = (rotatedWidth - sw) / 2 - clamped.panX / totalScale;
  const rawSy = (rotatedHeight - sh) / 2 - clamped.panY / totalScale;

  const sx = Math.max(0, Math.min(rotatedWidth - sw, rawSx));
  const sy = Math.max(0, Math.min(rotatedHeight - sh, rawSy));

  return {
    sx,
    sy,
    sw,
    sh,
    rotatedWidth,
    rotatedHeight,
  };
}

/**
 * Computes the final exported pixel dimensions for the selected aspect preset and resize tier.
 */
export function computeOutputDimensions(params: {
  category: MediaAssetCategory;
  presetId: CropAspectPresetId;
  freeAspectRatio?: number;
  tier: CropResolutionTier;
  customWidth?: number;
  customHeight?: number;
}): { width: number; height: number } {
  const preset = getCropPresetById(params.presetId);
  const categoryDefaults = getCategoryDefaultDimensions(params.category);

  const effectiveRatio =
    preset.ratio ??
    Math.max(0.25, Math.min(4, params.freeAspectRatio || 4 / 3));

  // Base dimensions anchored to category or preset
  let baseWidth =
    params.presetId === getDefaultCropPresetForCategory(params.category)
      ? categoryDefaults.width
      : preset.defaultWidth;
  let baseHeight = Math.round(baseWidth / effectiveRatio);

  if (params.presetId === 'free') {
    baseWidth = categoryDefaults.width;
    baseHeight = Math.max(120, Math.round(baseWidth / effectiveRatio));
  }

  if (params.tier === 'compact') {
    return {
      width: Math.max(64, Math.round(baseWidth * 0.6)),
      height: Math.max(64, Math.round(baseHeight * 0.6)),
    };
  }

  if (params.tier === 'highres') {
    const scaledW = Math.min(2400, Math.round(baseWidth * 1.5));
    const scaledH = Math.max(64, Math.round(scaledW / effectiveRatio));
    return {
      width: scaledW,
      height: Math.min(2400, scaledH),
    };
  }

  if (params.tier === 'custom') {
    const safeW = Math.max(
      64,
      Math.min(2400, Math.round(Number(params.customWidth) || baseWidth))
    );
    const safeH = Math.max(
      64,
      Math.min(2400, Math.round(Number(params.customHeight) || baseHeight))
    );
    return { width: safeW, height: safeH };
  }

  return {
    width: Math.max(64, Math.round(baseWidth)),
    height: Math.max(64, Math.round(baseHeight)),
  };
}

/**
 * Renders the cropped, rotated, flipped, and resized image onto an HTML5 Canvas
 * and returns a real `File` + Data URL preview.
 */
export async function renderCroppedImageToFile(params: {
  image: HTMLImageElement;
  rotationDeg: number;
  flipX: boolean;
  frameWidth: number;
  frameHeight: number;
  zoom: number;
  panX: number;
  panY: number;
  outputWidth: number;
  outputHeight: number;
  filenameBase: string;
  quality?: number;
}): Promise<{
  file: File;
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}> {
  const naturalW = params.image.naturalWidth || params.image.width;
  const naturalH = params.image.naturalHeight || params.image.height;
  if (!naturalW || !naturalH) {
    throw new Error('Image dimensions are not ready yet.');
  }

  const rot = normalizeRotationDeg(params.rotationDeg);
  const { sx, sy, sw, sh, rotatedWidth, rotatedHeight } = computeSourceCropRect({
    naturalWidth: naturalW,
    naturalHeight: naturalH,
    rotationDeg: rot,
    frameWidth: params.frameWidth,
    frameHeight: params.frameHeight,
    zoom: params.zoom,
    panX: params.panX,
    panY: params.panY,
  });

  // Step 1: Render rotated + flipped source image onto intermediate canvas
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = rotatedWidth;
  sourceCanvas.height = rotatedHeight;
  const sCtx = sourceCanvas.getContext('2d');
  if (!sCtx) {
    throw new Error('Canvas 2D context unavailable');
  }

  sCtx.save();
  sCtx.translate(rotatedWidth / 2, rotatedHeight / 2);
  sCtx.rotate((rot * Math.PI) / 180);
  if (params.flipX) {
    sCtx.scale(-1, 1);
  }
  sCtx.drawImage(params.image, -naturalW / 2, -naturalH / 2, naturalW, naturalH);
  sCtx.restore();

  // Step 2: Crop & resize to exact outputWidth x outputHeight
  const outW = Math.max(32, Math.round(params.outputWidth));
  const outH = Math.max(32, Math.round(params.outputHeight));
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const oCtx = outCanvas.getContext('2d');
  if (!oCtx) {
    throw new Error('Output Canvas 2D context unavailable');
  }

  oCtx.imageSmoothingEnabled = true;
  oCtx.imageSmoothingQuality = 'high';
  oCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

  const quality = params.quality ?? 0.9;
  let mimeType = 'image/webp';
  let dataUrl = outCanvas.toDataURL(mimeType, quality);
  if (!dataUrl.startsWith('data:image/webp')) {
    mimeType = 'image/jpeg';
    dataUrl = outCanvas.toDataURL(mimeType, quality);
  }

  const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
  const cleanBase =
    (params.filenameBase || 'cropped-image')
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'cropped-image';

  const blob = await new Promise<Blob>((resolve, reject) => {
    outCanvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to encode cropped image.'));
      },
      mimeType,
      quality
    );
  });

  const file = new File([blob], `${cleanBase}-cropped.${ext}`, {
    type: mimeType,
    lastModified: Date.now(),
  });

  return {
    file,
    dataUrl,
    width: outW,
    height: outH,
    sizeBytes: blob.size,
    mimeType,
  };
}

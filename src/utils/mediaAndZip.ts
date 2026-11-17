/**
 * Client-Side Media Compression Pipeline & Zero-Dependency Portable ZIP Archive Generator
 * Supports:
 * - Avatar (320x320 WebP/JPEG)
 * - Cover Banner (1200x360 WebP/JPEG)
 * - Project Thumbnail (800x450 WebP/JPEG)
 * - Project Gallery Images (1280x960 WebP/JPEG)
 * - Portable ZIP archive packaging `link-hub-config.json` + `/media/*` binary files + SQL schema
 */

export type MediaAssetCategory = 'avatar' | 'banner' | 'thumbnail' | 'gallery';

export interface MediaAssetRecord {
  id: string;
  profileSlug: string;
  category: MediaAssetCategory;
  filename: string;
  bucketPath: string;
  relativeStaticPath: string;
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
  originalBytes: number;
  width: number;
  height: number;
  createdAt: string;
}

const TARGET_DIMENSIONS: Record<
  MediaAssetCategory,
  { maxWidth: number; maxHeight: number; quality: number; folder: string }
> = {
  avatar: { maxWidth: 320, maxHeight: 320, quality: 0.86, folder: 'avatars' },
  banner: { maxWidth: 1200, maxHeight: 360, quality: 0.85, folder: 'banners' },
  thumbnail: { maxWidth: 800, maxHeight: 450, quality: 0.85, folder: 'thumbnails' },
  gallery: { maxWidth: 1280, maxHeight: 960, quality: 0.85, folder: 'gallery' },
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

const FIREBASE_MEDIA_PATH_RE =
  /^hub-media\/([a-zA-Z0-9_-]{1,128})\/(avatar|banner|thumbnail|gallery)\/[^/]+$/;

const FIRESTORE_MEDIA_PATH_RE =
  /^firestore-media\/([a-zA-Z0-9_-]{1,128})\/(avatar|banner|thumbnail|gallery)\/([a-zA-Z0-9_-]{1,128})$/;

/**
 * Validates that a Storage path belongs to the expected owner inside `/hub-media/{ownerUid}/{category}/`.
 */
export function isOwnedFirebaseMediaPath(
  storagePath: string | undefined | null,
  ownerUid: string
): boolean {
  if (!storagePath || !ownerUid) return false;
  const trimmed = storagePath.trim();
  if (!trimmed || trimmed.length > 300) return false;
  const match = FIREBASE_MEDIA_PATH_RE.exec(trimmed);
  if (!match) return false;
  return match[1] === ownerUid.trim();
}

/**
 * Validates that a Firestore fallback media path belongs to the expected owner
 * inside `firestore-media/{ownerUid}/{category}/{mediaId}`.
 */
export function isOwnedFirestoreMediaPath(
  storagePath: string | undefined | null,
  ownerUid: string
): boolean {
  if (!storagePath || !ownerUid) return false;
  const trimmed = storagePath.trim();
  if (!trimmed || trimmed.length > 300) return false;
  const match = FIRESTORE_MEDIA_PATH_RE.exec(trimmed);
  if (!match) return false;
  return match[1] === ownerUid.trim();
}

export function extractFirestoreMediaId(
  storagePath: string | undefined | null
): string | null {
  if (!storagePath) return null;
  const match = FIRESTORE_MEDIA_PATH_RE.exec(storagePath.trim());
  return match ? match[3] : null;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  return uint8ArrayToBase64(new Uint8Array(buf));
}

/**
 * Ensures an image Blob fits under a strict byte ceiling (e.g. 600 KB for Firestore docs).
 * Returns the original blob untouched if it already fits.
 */
export async function compressImageBlobToMaxBytes(params: {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  maxBytes?: number;
}): Promise<{ blob: Blob; mimeType: string; width: number; height: number }> {
  const maxBytes = params.maxBytes ?? 600_000;
  if (params.blob.size <= maxBytes) {
    return {
      blob: params.blob,
      mimeType: params.mimeType,
      width: params.width,
      height: params.height,
    };
  }

  const imgUrl = URL.createObjectURL(params.blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Unable to re-compress image for cloud storage.'));
      el.src = imgUrl;
    });

    const attempts: Array<{ scale: number; quality: number }> = [
      { scale: 1, quality: 0.76 },
      { scale: 1, quality: 0.62 },
      { scale: 0.85, quality: 0.6 },
      { scale: 0.7, quality: 0.54 },
    ];

    for (const attempt of attempts) {
      const targetW = Math.max(64, Math.round((img.naturalWidth || params.width) * attempt.scale));
      const targetH = Math.max(64, Math.round((img.naturalHeight || params.height) * attempt.scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0, targetW, targetH);

      let mimeType = 'image/webp';
      let dataUrl = canvas.toDataURL(mimeType, attempt.quality);
      if (!dataUrl.startsWith('data:image/webp')) {
        mimeType = 'image/jpeg';
        dataUrl = canvas.toDataURL(mimeType, attempt.quality);
      }

      const candidateBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else {
              const bytes = dataUriToUint8Array(dataUrl);
              resolve(new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }));
            }
          },
          mimeType,
          attempt.quality
        );
      });

      if (candidateBlob.size <= maxBytes) {
        return {
          blob: candidateBlob,
          mimeType,
          width: targetW,
          height: targetH,
        };
      }
    }

    throw new Error(
      `Compressed image (${formatBytes(params.blob.size)}) exceeds the ${formatBytes(maxBytes)} cloud limit. Try choosing Compact or Standard resolution.`
    );
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

/**
 * Compresses and resizes an image File in the browser using HTML5 Canvas.
 * Returns both a binary Blob (for direct upload to the customer's Supabase Storage bucket or ZIP archive)
 * and a Data URL (for instant preview / Static Mode browser draft).
 */
export async function compressImageFileClientSide(
  file: File,
  category: MediaAssetCategory,
  profileSlug = 'primary',
  ownerUid = 'local',
  customMaxDimensions?: { maxWidth: number; maxHeight: number }
): Promise<{
  blob: Blob;
  dataUrl: string;
  record: MediaAssetRecord;
}> {
  const spec = TARGET_DIMENSIONS[category];
  const effectiveMaxWidth = customMaxDimensions?.maxWidth
    ? Math.max(64, Math.min(2400, Math.round(customMaxDimensions.maxWidth)))
    : spec.maxWidth;
  const effectiveMaxHeight = customMaxDimensions?.maxHeight
    ? Math.max(64, Math.min(2400, Math.round(customMaxDimensions.maxHeight)))
    : spec.maxHeight;
  const cleanBase = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || category;

  const timestamp = Date.now();
  const imgUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Unable to decode image "${file.name}".`));
      el.src = imgUrl;
    });

    let targetW = img.naturalWidth || effectiveMaxWidth;
    let targetH = img.naturalHeight || effectiveMaxHeight;

    const scale = Math.min(1, effectiveMaxWidth / targetW, effectiveMaxHeight / targetH);
    targetW = Math.max(1, Math.round(targetW * scale));
    targetH = Math.max(1, Math.round(targetH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }

    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Prefer image/webp, fallback to image/jpeg
    let mimeType = 'image/webp';
    let dataUrl = canvas.toDataURL(mimeType, spec.quality);
    if (!dataUrl.startsWith('data:image/webp')) {
      mimeType = 'image/jpeg';
      dataUrl = canvas.toDataURL(mimeType, spec.quality);
    }

    const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
    const filename = `${cleanBase}-${timestamp}.${ext}`;
    const relativeStaticPath = `/media/${spec.folder}/${filename}`;
    const bucketPath = `${ownerUid}/${profileSlug}/${spec.folder}/${filename}`;

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (b) => {
          if (b) {
            resolve(b);
          } else {
            const bytes = dataUriToUint8Array(dataUrl);
            resolve(new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }));
          }
        },
        mimeType,
        spec.quality
      );
    });

    if (blob.size > 2 * 1024 * 1024) {
      throw new Error(
        `Compressed image (${formatBytes(blob.size)}) exceeds the 2 MB bucket policy limit.`
      );
    }

    const record: MediaAssetRecord = {
      id: `media-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
      profileSlug,
      category,
      filename,
      bucketPath,
      relativeStaticPath,
      publicUrl: dataUrl,
      mimeType,
      sizeBytes: blob.size,
      originalBytes: file.size,
      width: targetW,
      height: targetH,
      createdAt: new Date().toISOString(),
    };

    return { blob, dataUrl, record };
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

export function dataUriToUint8Array(dataUri: string): Uint8Array {
  const commaIdx = dataUri.indexOf(',');
  if (commaIdx === -1) {
    return new TextEncoder().encode(dataUri);
  }
  const meta = dataUri.slice(0, commaIdx);
  const payload = dataUri.slice(commaIdx + 1);
  if (meta.includes(';base64')) {
    const binStr =
      typeof atob === 'function'
        ? atob(payload)
        : Buffer.from(payload, 'base64').toString('binary');
    const out = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      out[i] = binStr.charCodeAt(i);
    }
    return out;
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

/* ============================================================================
 * ZERO-DEPENDENCY PKZIP BUILDER (CRC32 + STORE METHOD)
 * Packages `link-hub-config.json`, SQL migrations, `.env.example`, and `/media/*`
 * binary image files into a valid `.zip` file that extracts cleanly on macOS,
 * Windows, and Linux.
 * ========================================================================== */

export interface ZipEntryInput {
  path: string; // e.g., "public/link-hub-config.json" or "public/media/thumbnails/app.webp"
  data: string | Uint8Array;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildPortableZipArchive(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const cleanPath = entry.path.replace(/^\/+/, '');
    const nameBytes = encoder.encode(cleanPath);
    const contentBytes =
      typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    const crc = computeCrc32(contentBytes);
    const size = contentBytes.length;

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Compression method 0 (Store)
    lv.setUint16(10, 0, true); // Mod time
    lv.setUint16(12, 0, true); // Mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, contentBytes);

    // Central directory header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central file header signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // Store method
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    offset += localHeader.length + contentBytes.length;
  }

  let centralSize = 0;
  for (const c of centralChunks) centralSize += c.length;

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralSize + eocd.length;
  const output = new Uint8Array(totalSize);
  let ptr = 0;
  for (const chunk of localChunks) {
    output.set(chunk, ptr);
    ptr += chunk.length;
  }
  for (const chunk of centralChunks) {
    output.set(chunk, ptr);
    ptr += chunk.length;
  }
  output.set(eocd, ptr);

  return output;
}

export function triggerBrowserDownload(
  filename: string,
  content: string | Uint8Array | Blob,
  mimeType = 'application/octet-stream'
): void {
  const blob =
    content instanceof Blob
      ? content
      : typeof content === 'string'
      ? new Blob([content], { type: mimeType })
      : new Blob([content.buffer as ArrayBuffer], { type: mimeType });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

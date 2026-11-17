import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
  type StorageReference,
} from 'firebase/storage';
import {
  auth,
  db,
  googleProvider,
  storage,
  OWNER_ADMIN_EMAIL,
  OperationType,
  evaluateAdminAccessGuard,
  handleFirestoreError,
  trackGa4Event,
  type AdminGuardEvaluation,
} from './firebase';
import {
  DEFAULT_SITE_CONFIG,
  LEGACY_DEMO_LINK_IDS,
  isUntouchedLegacyDemoHub,
  normalizeSiteConfig,
  type SiteConfigState,
} from '../data/profileData';
import {
  normalizeCategoryId,
  sanitizeCategoryEntry,
  type LinkCardItem,
} from '../utils/hubLogic';
import { normalizeLinkPreviewType } from '../utils/linkPreview';
import {
  blobToBase64,
  compressImageBlobToMaxBytes,
  compressImageFileClientSide,
  extractFirestoreMediaId,
  isOwnedFirebaseMediaPath,
  isOwnedFirestoreMediaPath,
  type MediaAssetCategory,
  type MediaAssetRecord,
} from '../utils/mediaAndZip';
import type { StoredMessage } from '../components/SubViewsAndModals';
import {
  removePairedDevicePasskey,
  savePairedDevicePasskey,
  type AdminPasskeyRecord,
} from '../utils/biometricAuth';

export interface FirestoreAnalyticsRecord {
  id: string;
  linkId: string;
  linkTitle: string;
  category: string;
  eventType: 'link_click' | 'profile_view';
  source: 'hub' | 'pass' | 'bento';
  createdAtMs: number;
}

export interface AdminSubscriberRecord {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

export function sanitizeFirestoreId(raw: string, fallbackPrefix = 'item'): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  if (cleaned.length >= 1) return cleaned;
  return `${fallbackPrefix}-${Date.now()}`;
}

export function sanitizeHttpUrl(raw: string, fallback = 'https://example.com'): string {
  const trimmed = (raw || '').trim();
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProto.slice(0, 1000) || fallback;
}

export function sanitizeHubPublicData(config: SiteConfigState, ownerUid: string) {
  return {
    ownerUid: sanitizeFirestoreId(ownerUid, 'owner'),
    profile: config.profile,
    designSystem: config.designSystem,
    featuredSong: config.featuredSong,
    socials: (config.socials || []).slice(0, 20),
    posts: (config.posts || []).slice(0, 100),
    customCategories: (config.customCategories || [])
      .map((c) => sanitizeCategoryEntry(c))
      .filter(Boolean)
      .slice(0, 30),
    showGithubSection: Boolean(config.showGithubSection),
    showSongCard: Boolean(config.showSongCard),
    showMapCard: Boolean(config.showMapCard),
    showContactSection: Boolean(config.showContactSection),
  };
}

export function sanitizeLinkPayload(
  link: LinkCardItem,
  index: number,
  ownerUid: string
) {
  const safeId = sanitizeFirestoreId(link.id, 'link');
  const cleanUrl = sanitizeHttpUrl(link.url);
  const cleanDisplay =
    (link.displayUrl || '').trim().slice(0, 200) ||
    cleanUrl.replace(/^https?:\/\//, '').slice(0, 200) ||
    'external-link';
  const cleanCategory = normalizeCategoryId(link.category) || 'project';
  const previewType = normalizeLinkPreviewType(link.previewType, 'chat');

  return {
    id: safeId,
    title: (link.title || 'Untitled Link').trim().slice(0, 120) || 'Untitled Link',
    url: cleanUrl,
    displayUrl: cleanDisplay,
    description:
      (link.description || 'External link.').trim().slice(0, 500) ||
      'External link.',
    pinned: Boolean(link.pinned),
    orderIndex: Number.isFinite(index) ? index : 0,
    category: cleanCategory.slice(0, 64),
    previewType,
    thumbnailUrl: (link.thumbnailUrl || '').trim().slice(0, 2000),
    autoThumbnailUrl: (link.autoThumbnailUrl || '').trim().slice(0, 2000),
    thumbnailPath: (link.thumbnailPath || '').trim().slice(0, 300),
    galleryUrls: Array.isArray(link.galleryUrls)
      ? link.galleryUrls.slice(0, 10).map((u) => String(u).slice(0, 1000))
      : [],
    clicks: Math.max(0, Math.round(Number(link.clicks) || 0)),
    isPublic: true,
    ownerUid: sanitizeFirestoreId(ownerUid, 'owner'),
  };
}

function formatFirestoreTimestamp(ts: unknown): string {
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as Timestamp).toDate === 'function') {
    const d = (ts as Timestamp).toDate();
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return 'Just now';
}

function getTimestampMs(ts: unknown): number {
  if (ts && typeof ts === 'object' && 'toMillis' in ts && typeof (ts as Timestamp).toMillis === 'function') {
    return (ts as Timestamp).toMillis();
  }
  return Date.now();
}

/* ============================================================================
 * 1. GOOGLE AUTHENTICATION & SOLO-OWNER UID LOCK
 * ========================================================================== */

export async function signInOwnerWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutOwner(): Promise<void> {
  await signOut(auth);
}

/**
 * Verifies Google Auth email allowlist (`rajdeep.bhattacharyya25@gmail.com` + verified) AND enforces
 * an immutable Firestore UID lock document (`/config/adminLock` + `/admins/{uid}`).
 */
export async function verifyAndLockSoloOwner(
  user: User | null
): Promise<{ evaluation: AdminGuardEvaluation; lockedUid: string | null }> {
  if (!user) {
    return {
      evaluation: evaluateAdminAccessGuard({ user: null }),
      lockedUid: null,
    };
  }

  // First evaluate email allowlist & verified flag before touching Firestore
  const preCheck = evaluateAdminAccessGuard({ user });
  if (!preCheck.authorized) {
    return { evaluation: preCheck, lockedUid: null };
  }

  const lockRef = doc(db, 'config', 'adminLock');
  let existingLockedUid: string | null = null;

  try {
    const lockSnap = await getDoc(lockRef);
    if (lockSnap.exists()) {
      const lockData = lockSnap.data();
      const lockEmail = String(lockData?.email || '').trim().toLowerCase();
      if (lockEmail !== OWNER_ADMIN_EMAIL.toLowerCase()) {
        // One-time migration from previous placeholder email lock to the verified solo owner
        await setDoc(lockRef, {
          uid: user.uid,
          email: OWNER_ADMIN_EMAIL,
          role: 'owner',
          lockedAt: serverTimestamp(),
        });
        existingLockedUid = user.uid;
      } else {
        existingLockedUid = String(lockData?.uid || '');
      }
    } else {
      // Bootstrap immutable UID lock for the first verified solo-owner login
      await setDoc(lockRef, {
        uid: user.uid,
        email: OWNER_ADMIN_EMAIL,
        role: 'owner',
        lockedAt: serverTimestamp(),
      });
      existingLockedUid = user.uid;
    }

    const adminRef = doc(db, 'admins', user.uid);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists() && existingLockedUid === user.uid) {
      await setDoc(adminRef, {
        uid: user.uid,
        email: OWNER_ADMIN_EMAIL,
        role: 'owner',
        lockedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'config/adminLock');
  }

  const finalCheck = evaluateAdminAccessGuard({
    user,
    lockedUid: existingLockedUid,
  });
  return {
    evaluation: finalCheck,
    lockedUid: existingLockedUid,
  };
}

/* ============================================================================
 * 2. PUBLIC HUB & LINKS REAL-TIME SUBSCRIPTION
 * ========================================================================== */

export function subscribePublicHubAndLinks(callbacks: {
  onConfigUpdate: (
    next: SiteConfigState,
    meta: { cloudSeeded: boolean; cloudLinkIds: string[]; legacyDemoDetected: boolean }
  ) => void;
}): Unsubscribe {
  let latestHubDoc: Partial<SiteConfigState> | null = null;
  let latestLinks: LinkCardItem[] | null = null;
  let hubSeeded = false;
  let cloudLinkIds: string[] = [];

  const emitCombined = () => {
    const legacyDemoDetected = isUntouchedLegacyDemoHub(latestHubDoc);
    const effectiveHubDoc = legacyDemoDetected ? null : latestHubDoc;
    const effectiveHubSeeded = hubSeeded && !legacyDemoDetected;

    const base = effectiveHubDoc
      ? normalizeSiteConfig(effectiveHubDoc)
      : DEFAULT_SITE_CONFIG;
    const linksToUse =
      latestLinks !== null
        ? legacyDemoDetected
          ? latestLinks.filter((lnk) => !LEGACY_DEMO_LINK_IDS.has(lnk.id))
          : latestLinks
        : base.links;
    callbacks.onConfigUpdate(
      {
        ...base,
        links: linksToUse,
      },
      {
        cloudSeeded: effectiveHubSeeded,
        cloudLinkIds,
        legacyDemoDetected,
      }
    );
  };

  const unsubHub = onSnapshot(
    doc(db, 'hub', 'public'),
    (snap) => {
      hubSeeded = snap.exists();
      latestHubDoc = snap.exists() ? (snap.data() as Partial<SiteConfigState>) : null;
      emitCombined();
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'hub/public');
    }
  );

  const linksQuery = query(collection(db, 'links'), where('isPublic', '==', true));
  const unsubLinks = onSnapshot(
    linksQuery,
    (snap) => {
      const parsed: (LinkCardItem & { orderIndex: number })[] = [];
      const ids: string[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        ids.push(docSnap.id);
        parsed.push({
          id: docSnap.id,
          title: String(d.title || ''),
          url: String(d.url || ''),
          displayUrl: String(d.displayUrl || ''),
          description: String(d.description || ''),
          pinned: Boolean(d.pinned),
          category: String(d.category || 'project'),
          previewType: normalizeLinkPreviewType(d.previewType, 'chat'),
          thumbnailUrl: d.thumbnailUrl ? String(d.thumbnailUrl) : '',
          autoThumbnailUrl: d.autoThumbnailUrl ? String(d.autoThumbnailUrl) : '',
          thumbnailPath: d.thumbnailPath ? String(d.thumbnailPath) : '',
          galleryUrls: Array.isArray(d.galleryUrls) ? d.galleryUrls : [],
          clicks: Number(d.clicks || 0),
          orderIndex: Number(d.orderIndex ?? 999),
        });
      });
      parsed.sort((a, b) => a.orderIndex - b.orderIndex);
      latestLinks = parsed.map(({ orderIndex: _ignored, ...rest }) => rest);
      cloudLinkIds = ids;
      emitCombined();
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'links');
    }
  );

  return () => {
    unsubHub();
    unsubLinks();
  };
}

/* ============================================================================
 * 3. OWNER PERSISTENCE (FIRESTORE /hub/public + /links/{linkId})
 * ========================================================================== */

export async function persistFullHubToFirestore(params: {
  siteConfig: SiteConfigState;
  ownerUid: string;
  knownCloudLinkIds: string[];
}): Promise<string[]> {
  const { siteConfig, ownerUid, knownCloudLinkIds } = params;
  const hubRef = doc(db, 'hub', 'public');
  const hubPayload = sanitizeHubPublicData(siteConfig, ownerUid);

  try {
    const existingHub = await getDoc(hubRef);
    if (!existingHub.exists()) {
      await setDoc(hubRef, {
        ...hubPayload,
        updatedAt: serverTimestamp(),
      });
    } else {
      const { ownerUid: _immutableOwner, ...updatableHubFields } = hubPayload;
      await updateDoc(hubRef, {
        ...updatableHubFields,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'hub/public');
  }

  const nextIds: string[] = [];
  for (let i = 0; i < siteConfig.links.length; i++) {
    const sanitized = sanitizeLinkPayload(siteConfig.links[i], i, ownerUid);
    nextIds.push(sanitized.id);
    const linkRef = doc(db, 'links', sanitized.id);
    try {
      const existingLink = await getDoc(linkRef);
      if (!existingLink.exists()) {
        await setDoc(linkRef, {
          ...sanitized,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const {
          id: _id,
          ownerUid: _ownerUid,
          ...updatableLinkFields
        } = sanitized;
        await updateDoc(linkRef, {
          ...updatableLinkFields,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `links/${sanitized.id}`);
    }
  }

  for (const oldId of knownCloudLinkIds) {
    if (!nextIds.includes(oldId)) {
      try {
        await deleteDoc(doc(db, 'links', oldId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `links/${oldId}`);
      }
    }
  }

  return nextIds;
}

let storageBucketUnavailableUntilMs = 0;

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      String((err as { code?: unknown }).code) === 'storage/canceled')
  );
}

function createAbortError(message = 'Upload cancelled.'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

async function uploadBlobResumableWithTimeout(params: {
  fileRef: StorageReference;
  blob: Blob;
  contentType: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progressPct: number, statusLabel: string) => void;
}): Promise<string> {
  const {
    fileRef,
    blob,
    contentType,
    timeoutMs = 5500,
    signal,
    onProgress,
  } = params;

  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, blob, { contentType });
    let settled = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', handleAbort);
    };

    const failWith = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const handleAbort = () => {
      try {
        task.cancel();
      } catch {
        // ignore cancel error
      }
      failWith(createAbortError('Upload cancelled.'));
    };

    signal?.addEventListener('abort', handleAbort, { once: true });

    const timer = setTimeout(() => {
      try {
        task.cancel();
      } catch {
        // ignore cancel error
      }
      failWith(new Error('Firebase Storage upload timed out.'));
    }, timeoutMs);

    task.on(
      'state_changed',
      (snapshot) => {
        if (settled) return;
        const pct =
          snapshot.totalBytes > 0
            ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            : 25;
        onProgress?.(Math.max(15, Math.min(82, 15 + Math.round(pct * 0.65))), `Uploading ${pct}%...`);
      },
      (err) => {
        if (settled) return;
        if (signal?.aborted) {
          failWith(createAbortError('Upload cancelled.'));
          return;
        }
        failWith(err instanceof Error ? err : new Error(String(err)));
      },
      () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      }
    );
  });

  throwIfAborted(signal);

  const downloadUrl = await Promise.race([
    getDownloadURL(fileRef),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timed out resolving storage download URL.')), 4500)
    ),
  ]);

  return downloadUrl;
}

/**
 * Deletes an owner's previous Firebase Storage file or Firestore Cloud Media payload
 * and its matching `/mediaAssets` doc so replaced images never accumulate orphaned space.
 */
export async function deleteMediaFromFirebaseStorage(params: {
  storagePath?: string;
  ownerUid: string;
}): Promise<boolean> {
  const cleanPath = (params.storagePath || '').trim();
  const cleanOwner = (params.ownerUid || '').trim();
  const isFirebaseObj = isOwnedFirebaseMediaPath(cleanPath, cleanOwner);
  const isFirestoreObj = isOwnedFirestoreMediaPath(cleanPath, cleanOwner);
  if (!isFirebaseObj && !isFirestoreObj) {
    return false;
  }

  let deletedStorage = false;
  if (isFirebaseObj) {
    try {
      await deleteObject(storageRef(storage, cleanPath));
      deletedStorage = true;
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'storage/object-not-found') {
        deletedStorage = true;
      }
    }
  } else if (isFirestoreObj) {
    const mediaId = extractFirestoreMediaId(cleanPath);
    if (mediaId) {
      try {
        await deleteDoc(doc(db, 'publicMedia', mediaId));
        deletedStorage = true;
      } catch {
        // Non-fatal cleanup
      }
    }
  }

  try {
    const assetsQ = query(
      collection(db, 'mediaAssets'),
      where('ownerUid', '==', cleanOwner),
      limit(100)
    );
    const snap = await getDocs(assetsQ);
    const matchingDeletes = snap.docs
      .filter((d) => String(d.data()?.storagePath || '') === cleanPath)
      .map((d) => deleteDoc(doc(db, 'mediaAssets', d.id)));
    if (matchingDeletes.length > 0) {
      await Promise.all(matchingDeletes);
    }
  } catch {
    // Metadata cleanup failure should not break UI flow
  }

  return deletedStorage;
}

export async function uploadCompressedMediaToFirebaseStorage(params: {
  file: File;
  category: MediaAssetCategory;
  ownerUid: string;
  previousStoragePath?: string;
  customMaxDimensions?: { maxWidth: number; maxHeight: number };
  onProgress?: (progressPct: number, statusLabel: string) => void;
  signal?: AbortSignal;
}): Promise<
  MediaAssetRecord & {
    replacedOldAsset: boolean;
    storageBackend: 'firebase-storage' | 'firestore-media';
  }
> {
  const {
    file,
    category,
    ownerUid,
    previousStoragePath,
    customMaxDimensions,
    onProgress,
    signal,
  } = params;

  const cleanOwner = sanitizeFirestoreId(ownerUid, '');
  if (!ownerUid.trim() || !cleanOwner) {
    throw new Error('Sign in with your verified owner Google account before uploading media.');
  }

  throwIfAborted(signal);
  onProgress?.(8, 'Compressing...');

  const { blob, record } = await compressImageFileClientSide(
    file,
    category,
    'solo',
    cleanOwner,
    customMaxDimensions
  );

  throwIfAborted(signal);

  const objectPath = `hub-media/${cleanOwner}/${category}/${record.filename}`;
  const assetId = sanitizeFirestoreId(record.id, 'media');

  let finalPublicUrl = '';
  let finalStoragePath = objectPath;
  let finalMimeType = record.mimeType;
  let finalSizeBytes = record.sizeBytes;
  let finalWidth = record.width;
  let finalHeight = record.height;
  let storageBackend: 'firebase-storage' | 'firestore-media' = 'firebase-storage';

  const shouldTryFirebaseStorage = Date.now() >= storageBucketUnavailableUntilMs;

  if (shouldTryFirebaseStorage) {
    try {
      onProgress?.(16, 'Uploading...');
      const fileRef = storageRef(storage, objectPath);
      finalPublicUrl = await uploadBlobResumableWithTimeout({
        fileRef,
        blob,
        contentType: record.mimeType,
        timeoutMs: 5500,
        signal,
        onProgress,
      });
    } catch (err) {
      if (isAbortError(err) && signal?.aborted) {
        throw createAbortError('Upload cancelled.');
      }
      // Firebase Storage bucket may be unprovisioned (404), CORS-blocked, or timing out.
      // Cache unavailability for 5 min so subsequent uploads switch instantly to Cloud Firestore Media.
      storageBucketUnavailableUntilMs = Date.now() + 5 * 60 * 1000;
      storageBackend = 'firestore-media';
    }
  } else {
    storageBackend = 'firestore-media';
  }

  if (storageBackend === 'firestore-media') {
    throwIfAborted(signal);
    onProgress?.(48, 'Saving to cloud...');

    const fitted = await compressImageBlobToMaxBytes({
      blob,
      mimeType: record.mimeType,
      width: record.width,
      height: record.height,
      maxBytes: 600_000,
    });

    throwIfAborted(signal);
    finalMimeType = fitted.mimeType;
    finalSizeBytes = fitted.blob.size;
    finalWidth = fitted.width;
    finalHeight = fitted.height;

    const mediaId = sanitizeFirestoreId(
      `med-${category}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      'med'
    );
    const dataBase64 = await blobToBase64(fitted.blob);
    throwIfAborted(signal);

    onProgress?.(72, 'Syncing media...');
    try {
      await setDoc(doc(db, 'publicMedia', mediaId), {
        id: mediaId,
        ownerUid: cleanOwner,
        category,
        filename: record.filename.slice(0, 160),
        mimeType: finalMimeType,
        sizeBytes: finalSizeBytes,
        width: finalWidth,
        height: finalHeight,
        dataBase64,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `publicMedia/${mediaId}`);
    }

    finalStoragePath = `firestore-media/${cleanOwner}/${category}/${mediaId}`;
    finalPublicUrl = `/api/media/${mediaId}`;
  }

  throwIfAborted(signal);
  onProgress?.(88, 'Finalizing...');

  try {
    await setDoc(doc(db, 'mediaAssets', assetId), {
      ownerUid: cleanOwner,
      category,
      filename: record.filename.slice(0, 160),
      storagePath: finalStoragePath.slice(0, 300),
      publicUrl: finalPublicUrl.slice(0, 2000),
      mimeType: finalMimeType,
      sizeBytes: finalSizeBytes,
      width: finalWidth,
      height: finalHeight,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `mediaAssets/${assetId}`);
  }

  let replacedOldAsset = false;
  if (
    previousStoragePath &&
    previousStoragePath.trim() !== finalStoragePath &&
    (isOwnedFirebaseMediaPath(previousStoragePath, cleanOwner) ||
      isOwnedFirestoreMediaPath(previousStoragePath, cleanOwner))
  ) {
    replacedOldAsset = await deleteMediaFromFirebaseStorage({
      storagePath: previousStoragePath,
      ownerUid: cleanOwner,
    }).catch(() => false);
  }

  onProgress?.(100, 'Saved');

  return {
    ...record,
    mimeType: finalMimeType,
    sizeBytes: finalSizeBytes,
    width: finalWidth,
    height: finalHeight,
    bucketPath: finalStoragePath,
    publicUrl: finalPublicUrl,
    replacedOldAsset,
    storageBackend,
  };
}

/* ============================================================================
 * 5. PUBLIC VISITOR FORMS & DUAL TELEMETRY (GA4 + FIRESTORE)
 * ========================================================================== */

export async function submitVisitorMessageToFirestore(
  msg: Omit<StoredMessage, 'id' | 'timestamp'>
): Promise<string> {
  const messageId = sanitizeFirestoreId(
    `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    'msg'
  );
  const payload = {
    name: msg.name.trim().slice(0, 120),
    email: msg.email.trim().slice(0, 200),
    message: msg.message.trim().slice(0, 3000),
    source: msg.source,
    read: false,
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'messages', messageId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `messages/${messageId}`);
  }

  trackGa4Event('contact_submit', { source: msg.source }).catch(() => {});
  return messageId;
}

export async function submitSubscriberToFirestore(
  name: string,
  email: string
): Promise<string> {
  const subscriberId = sanitizeFirestoreId(
    `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    'sub'
  );
  try {
    await setDoc(doc(db, 'subscribers', subscriberId), {
      name: (name || 'Subscriber').trim().slice(0, 120),
      email: email.trim().slice(0, 200),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `subscribers/${subscriberId}`);
  }

  trackGa4Event('newsletter_subscribe', { channel: 'modal' }).catch(() => {});
  return subscriberId;
}

export async function trackPublicLinkClick(params: {
  link: LinkCardItem;
  cloudLinkExists: boolean;
  source?: 'bento' | 'hub' | 'pass';
}): Promise<void> {
  const { link, cloudLinkExists, source = 'bento' } = params;

  // 1. Firebase Analytics (GA4)
  trackGa4Event('select_content', {
    content_type: link.category,
    item_id: link.id,
    item_name: link.title,
  }).catch(() => {});

  // 2. Structured Firestore Telemetry Stream (only write relational click when doc exists in Firestore)
  if (!cloudLinkExists) return;

  const eventId = sanitizeFirestoreId(
    `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    'evt'
  );

  try {
    await setDoc(doc(db, 'analyticsEvents', eventId), {
      linkId: sanitizeFirestoreId(link.id, 'link'),
      linkTitle: (link.title || 'Link').trim().slice(0, 120) || 'Link',
      category: (normalizeCategoryId(link.category) || 'project').slice(0, 64),
      eventType: 'link_click',
      source,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal: outbound navigation must never be blocked by analytics write errors
  }
}

export async function trackPublicProfileView(params: {
  source?: 'hub' | 'pass';
}): Promise<void> {
  const source = params.source === 'pass' ? 'pass' : 'hub';

  trackGa4Event('page_view', {
    page_location: typeof window !== 'undefined' ? window.location.href : '',
    source,
  }).catch(() => {});

  const eventId = sanitizeFirestoreId(
    `view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    'view'
  );

  try {
    await setDoc(doc(db, 'analyticsEvents', eventId), {
      linkId: 'profile',
      linkTitle: source === 'pass' ? 'Pass Card View' : 'Hub Profile View',
      category: 'hub',
      eventType: 'profile_view',
      source,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal: telemetry failures must never block page render
  }
}

/* ============================================================================
 * 6. ADMIN-ONLY REAL-TIME STREAMS (MESSAGES, SUBSCRIBERS, ANALYTICS EVENTS)
 * ========================================================================== */

export function subscribeAdminInboxAndTelemetry(callbacks: {
  onMessages: (items: StoredMessage[]) => void;
  onSubscribers: (items: AdminSubscriberRecord[]) => void;
  onAnalyticsEvents: (items: FirestoreAnalyticsRecord[]) => void;
}): Unsubscribe {
  const messagesQ = query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(200));
  const unsubMessages = onSnapshot(
    messagesQ,
    (snap) => {
      const list: StoredMessage[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          name: String(d.name || ''),
          email: String(d.email || ''),
          message: String(d.message || ''),
          source: d.source === 'work' || d.source === 'custom' ? d.source : 'hub',
          timestamp: formatFirestoreTimestamp(d.createdAt),
          read: Boolean(d.read),
        });
      });
      callbacks.onMessages(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'messages');
    }
  );

  const subscribersQ = query(
    collection(db, 'subscribers'),
    orderBy('createdAt', 'desc'),
    limit(200)
  );
  const unsubSubscribers = onSnapshot(
    subscribersQ,
    (snap) => {
      const list: AdminSubscriberRecord[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          name: String(d.name || 'Subscriber'),
          email: String(d.email || ''),
          createdAt: formatFirestoreTimestamp(d.createdAt),
        });
      });
      callbacks.onSubscribers(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'subscribers');
    }
  );

  const eventsQ = query(
    collection(db, 'analyticsEvents'),
    orderBy('createdAt', 'desc'),
    limit(300)
  );
  const unsubEvents = onSnapshot(
    eventsQ,
    (snap) => {
      const list: FirestoreAnalyticsRecord[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          linkId: String(d.linkId || ''),
          linkTitle: String(d.linkTitle || ''),
          category: String(d.category || 'project'),
          eventType: d.eventType === 'profile_view' ? 'profile_view' : 'link_click',
          source: d.source === 'pass' || d.source === 'hub' ? d.source : 'bento',
          createdAtMs: getTimestampMs(d.createdAt),
        });
      });
      callbacks.onAnalyticsEvents(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'analyticsEvents');
    }
  );

  return () => {
    unsubMessages();
    unsubSubscribers();
    unsubEvents();
  };
}

export async function deleteAdminMessageFromFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'messages', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `messages/${id}`);
  }
}

export async function toggleAdminMessageRead(id: string, nextRead: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'messages', id), { read: nextRead });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `messages/${id}`);
  }
}

/* ============================================================================
 * 7. OWNER BIOMETRIC PASSKEY REGISTRY (/adminPasskeys/{credentialId})
 * ========================================================================== */

export function subscribeAdminPasskeys(
  ownerUid: string,
  onPasskeys: (items: AdminPasskeyRecord[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'adminPasskeys'),
    where('ownerUid', '==', ownerUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: AdminPasskeyRecord[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          credentialId: String(d.credentialId || docSnap.id),
          ownerUid: String(d.ownerUid || ownerUid),
          ownerEmail: String(d.ownerEmail || OWNER_ADMIN_EMAIL),
          deviceLabel: String(d.deviceLabel || 'Trusted Device'),
          platform:
            d.platform === 'android' ||
            d.platform === 'ios' ||
            d.platform === 'windows' ||
            d.platform === 'macos'
              ? d.platform
              : 'other',
          publicKeySpki: String(d.publicKeySpki || ''),
          algorithm: Number(d.algorithm) === -257 ? -257 : -7,
          transports: Array.isArray(d.transports)
            ? d.transports.map(String).slice(0, 6)
            : ['internal'],
          signCount: Math.max(0, Number(d.signCount) || 0),
          createdAt: formatFirestoreTimestamp(d.createdAt),
          lastUsedAt: formatFirestoreTimestamp(d.lastUsedAt),
        });
      });
      onPasskeys(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'adminPasskeys');
    }
  );
}

export async function saveAdminPasskeyToFirestore(
  passkey: AdminPasskeyRecord
): Promise<void> {
  const safeCredentialId = passkey.credentialId.trim().slice(0, 256);
  const safeLabel = passkey.deviceLabel.trim().slice(0, 120) || 'Trusted Device';
  const safeTransports = (passkey.transports || ['internal'])
    .map((t) => String(t).slice(0, 32))
    .slice(0, 6);

  try {
    await setDoc(doc(db, 'adminPasskeys', safeCredentialId), {
      credentialId: safeCredentialId,
      ownerUid: sanitizeFirestoreId(passkey.ownerUid, 'owner'),
      ownerEmail: OWNER_ADMIN_EMAIL,
      deviceLabel: safeLabel,
      platform: passkey.platform,
      publicKeySpki: passkey.publicKeySpki.slice(0, 2000),
      algorithm: passkey.algorithm === -257 ? -257 : -7,
      transports: safeTransports.length > 0 ? safeTransports : ['internal'],
      signCount: Math.max(0, Math.round(Number(passkey.signCount) || 0)),
      createdAt: serverTimestamp(),
      lastUsedAt: serverTimestamp(),
    });
    savePairedDevicePasskey({
      ...passkey,
      credentialId: safeCredentialId,
      deviceLabel: safeLabel,
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `adminPasskeys/${safeCredentialId}`
    );
  }
}

export async function touchAdminPasskeyUsage(params: {
  credentialId: string;
  nextSignCount: number;
  deviceLabel: string;
}): Promise<void> {
  const safeCredentialId = params.credentialId.trim().slice(0, 256);
  try {
    await updateDoc(doc(db, 'adminPasskeys', safeCredentialId), {
      signCount: Math.max(0, Math.round(Number(params.nextSignCount) || 0)),
      deviceLabel: params.deviceLabel.trim().slice(0, 120) || 'Trusted Device',
      lastUsedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.UPDATE,
      `adminPasskeys/${safeCredentialId}`
    );
  }
}

export async function renameAdminPasskeyInFirestore(params: {
  credentialId: string;
  deviceLabel: string;
  signCount: number;
}): Promise<void> {
  const safeCredentialId = params.credentialId.trim().slice(0, 256);
  const safeLabel = params.deviceLabel.trim().slice(0, 120);
  if (!safeLabel) return;
  try {
    await updateDoc(doc(db, 'adminPasskeys', safeCredentialId), {
      deviceLabel: safeLabel,
      signCount: Math.max(0, Math.round(Number(params.signCount) || 0)),
      lastUsedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.UPDATE,
      `adminPasskeys/${safeCredentialId}`
    );
  }
}

export async function deleteAdminPasskeyFromFirestore(
  credentialId: string
): Promise<void> {
  const safeCredentialId = credentialId.trim().slice(0, 256);
  try {
    await deleteDoc(doc(db, 'adminPasskeys', safeCredentialId));
    removePairedDevicePasskey(safeCredentialId);
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.DELETE,
      `adminPasskeys/${safeCredentialId}`
    );
  }
}


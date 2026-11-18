import firebaseConfigFile from '../../firebase-applet-config.json';
import {
  DEFAULT_SITE_CONFIG,
  LEGACY_DEMO_LINK_IDS,
  isUntouchedLegacyDemoHub,
  normalizeSiteConfig,
  type SiteConfigState,
} from '../data/profileData';
import {
  decodeFirestoreRestDocument,
  parseFirestoreRestLink,
} from '../utils/seoAndGeo';

const clientEnv: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' &&
  import.meta &&
  typeof (import.meta as { env?: Record<string, string | undefined> }).env === 'object'
    ? (import.meta as { env: Record<string, string | undefined> }).env
    : {};

export const PUBLIC_OWNER_ADMIN_EMAIL =
  (clientEnv.VITE_OWNER_ADMIN_EMAIL || '').trim() || 'rajdeep.bhattacharyya25@gmail.com';

export const PUBLIC_MEASUREMENT_ID =
  (clientEnv.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigFile.measurementId || '').trim();

const PROJECT_ID = (clientEnv.VITE_FIREBASE_PROJECT_ID || firebaseConfigFile.projectId || '').trim();
const DATABASE_ID = (
  clientEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
  firebaseConfigFile.firestoreDatabaseId ||
  '(default)'
).trim();
const API_KEY = (clientEnv.VITE_FIREBASE_API_KEY || firebaseConfigFile.apiKey || '').trim();

function getBaseFirestoreRestUrl(): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    PROJECT_ID
  )}/databases/${encodeURIComponent(DATABASE_ID)}/documents`;
}

export interface PublicHubRestResult {
  config: SiteConfigState;
  cloudSeeded: boolean;
  legacyDemoDetected: boolean;
  cloudLinkIds: string[];
}

/**
 * Lightweight zero-SDK Firestore REST fetch for public landing visits.
 * Closes immediately after response (no permanent Listen/channel stream or IndexedDB),
 * avoiding 467 KB of client Firestore SDK on the public critical path.
 */
export async function fetchPublicHubAndLinksRest(
  signal?: AbortSignal
): Promise<PublicHubRestResult> {
  if (!PROJECT_ID || !API_KEY) {
    return {
      config: DEFAULT_SITE_CONFIG,
      cloudSeeded: false,
      legacyDemoDetected: false,
      cloudLinkIds: [],
    };
  }

  const baseUrl = getBaseFirestoreRestUrl();
  const [hubRes, linksRes] = await Promise.all([
    fetch(`${baseUrl}/hub/public?key=${encodeURIComponent(API_KEY)}`, { signal }),
    fetch(`${baseUrl}:runQuery?key=${encodeURIComponent(API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'links' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'isPublic' },
              op: 'EQUAL',
              value: { booleanValue: true },
            },
          },
          limit: 100,
        },
      }),
      signal,
    }),
  ]);

  let rawHub: Partial<SiteConfigState> | null = null;
  if (hubRes.ok) {
    const hubJson = (await hubRes.json()) as { fields?: Record<string, unknown> };
    const decoded = decodeFirestoreRestDocument(hubJson);
    if (decoded) {
      rawHub = decoded as Partial<SiteConfigState>;
    }
  }

  const legacyDemoDetected = isUntouchedLegacyDemoHub(rawHub);
  const baseConfig =
    rawHub && !legacyDemoDetected ? normalizeSiteConfig(rawHub) : DEFAULT_SITE_CONFIG;

  let finalLinks = baseConfig.links;
  let cloudLinkIds: string[] = [];

  if (linksRes.ok) {
    const queryRows = (await linksRes.json()) as Array<{ document?: unknown }>;
    const docs = Array.isArray(queryRows)
      ? queryRows.map((row) => row?.document).filter(Boolean)
      : [];
    const parsed = docs
      .map(parseFirestoreRestLink)
      .filter((item): item is NonNullable<typeof item> => Boolean(item && item.isPublic))
      .filter((item) => !legacyDemoDetected || !LEGACY_DEMO_LINK_IDS.has(item.id))
      .sort((a, b) => a.orderIndex - b.orderIndex);

    cloudLinkIds = parsed.map((item) => item.id);
    if (parsed.length > 0) {
      finalLinks = parsed.map(({ orderIndex: _oi, isPublic: _ip, ...rest }) => rest);
    }
  }

  const hasLiveHub = Boolean(rawHub && !legacyDemoDetected);
  const combined: SiteConfigState = {
    ...baseConfig,
    links: finalLinks,
  };

  return {
    config: combined,
    cloudSeeded: hasLiveHub || finalLinks.length > 0,
    legacyDemoDetected,
    cloudLinkIds,
  };
}

const publicMediaRestCache = new Map<string, string>();

/**
 * Lightweight zero-SDK fallback resolver for `/api/media/{mediaId}` URLs via Firestore REST.
 */
export async function ensurePublicMediaHydratedRest(rawUrl: string): Promise<string> {
  const trimmed = (rawUrl || '').trim();
  const match = trimmed.match(/^\/api\/media\/([a-zA-Z0-9_-]{4,120})(?:\?.*)?$/);
  if (!match || !PROJECT_ID || !API_KEY) {
    return trimmed;
  }

  const mediaId = match[1];
  const cached = publicMediaRestCache.get(mediaId);
  if (cached) return cached;

  try {
    const baseUrl = getBaseFirestoreRestUrl();
    const res = await fetch(
      `${baseUrl}/publicMedia/${encodeURIComponent(mediaId)}?key=${encodeURIComponent(API_KEY)}`
    );
    if (!res.ok) return trimmed;
    const docJson = (await res.json()) as { fields?: Record<string, unknown> };
    const decoded = decodeFirestoreRestDocument(docJson);
    const base64 = typeof decoded?.base64 === 'string' ? decoded.base64.trim() : '';
    const mimeType =
      typeof decoded?.mimeType === 'string' && decoded.mimeType.startsWith('image/')
        ? decoded.mimeType
        : 'image/webp';
    if (!base64) return trimmed;
    const dataUri = `data:${mimeType};base64,${base64}`;
    publicMediaRestCache.set(mediaId, dataUri);
    return dataUri;
  } catch {
    return trimmed;
  }
}

export type LinkPreviewType = 'auto' | 'chat' | 'linkhub' | 'flib' | 'chess' | 'image';

export interface LinkPreviewMetadata {
  ok: boolean;
  found: boolean;
  imageUrl: string | null;
  title?: string;
  description?: string;
  siteName?: string;
  sourceUrl: string;
  cached?: boolean;
  error?: string;
}

export interface PreviewDisplayResolution {
  mode: 'image' | 'vector';
  imageUrl?: string;
  artwork?: 'chat' | 'linkhub' | 'flib' | 'chess';
  sourceLabel:
    | 'Manual Upload'
    | 'Auto-Fetched Preview'
    | 'Built-in Fallback'
    | 'Built-in Profile Card'
    | 'Built-in Showcase'
    | 'Built-in Editorial Card'
    | 'Built-in Board Grid';
}

const VALID_PREVIEW_TYPES: ReadonlySet<string> = new Set([
  'auto',
  'chat',
  'linkhub',
  'flib',
  'chess',
  'image',
]);

export function normalizeLinkPreviewType(
  raw: unknown,
  fallback: LinkPreviewType = 'chat'
): LinkPreviewType {
  const val = String(raw || '').trim().toLowerCase();
  return VALID_PREVIEW_TYPES.has(val) ? (val as LinkPreviewType) : fallback;
}

/**
 * Deterministic preview renderer matrix matching the Art dropdown contract:
 * - auto: manual thumbnailUrl overrides autoThumbnailUrl -> built-in Profile Card fallback
 * - chat: ALWAYS Built-in Profile Card
 * - linkhub: ALWAYS Built-in Showcase
 * - flib: ALWAYS Built-in Editorial Card
 * - chess: ALWAYS Built-in Board Grid
 * - image: manual thumbnailUrl -> Built-in Profile Card fallback if missing/broken
 */
export function resolveCardPreviewDisplay(input: {
  previewType: LinkPreviewType;
  thumbnailUrl?: string;
  autoThumbnailUrl?: string;
  imageFailed?: boolean;
}): PreviewDisplayResolution {
  const type = normalizeLinkPreviewType(input.previewType, 'chat');
  const manualUrl = (input.thumbnailUrl || '').trim();
  const autoUrl = (input.autoThumbnailUrl || '').trim();
  const failed = Boolean(input.imageFailed);

  switch (type) {
    case 'chat':
      return { mode: 'vector', artwork: 'chat', sourceLabel: 'Built-in Profile Card' };
    case 'linkhub':
      return { mode: 'vector', artwork: 'linkhub', sourceLabel: 'Built-in Showcase' };
    case 'flib':
      return { mode: 'vector', artwork: 'flib', sourceLabel: 'Built-in Editorial Card' };
    case 'chess':
      return { mode: 'vector', artwork: 'chess', sourceLabel: 'Built-in Board Grid' };
    case 'image':
      if (manualUrl && !failed) {
        return { mode: 'image', imageUrl: manualUrl, sourceLabel: 'Manual Upload' };
      }
      return { mode: 'vector', artwork: 'chat', sourceLabel: 'Built-in Fallback' };
    case 'auto': {
      if (manualUrl && !failed) {
        return { mode: 'image', imageUrl: manualUrl, sourceLabel: 'Manual Upload' };
      }
      if (autoUrl && !failed) {
        return { mode: 'image', imageUrl: autoUrl, sourceLabel: 'Auto-Fetched Preview' };
      }
      return { mode: 'vector', artwork: 'chat', sourceLabel: 'Built-in Fallback' };
    }
  }
}

function isPrivateOrBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }

  // IPv4 literal check
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b, c, d] = ipv4Match.slice(1).map(Number);
    if ([a, b, c, d].some((oct) => Number.isNaN(oct) || oct < 0 || oct > 255)) {
      return true;
    }
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  // Link-local / ULA IPv6
  if (
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('::ffff:127.') ||
    host.startsWith('::ffff:10.') ||
    host.startsWith('::ffff:192.168.')
  ) {
    return true;
  }

  // Require at least a dot for public domain names (unless valid public IP checked above)
  if (!ipv4Match && !host.includes('.')) {
    return true;
  }

  return false;
}

export function validatePreviewTargetUrl(
  rawUrl: string,
  options?: { allowLocalhost?: boolean }
): { valid: boolean; normalizedUrl?: string; reason?: string } {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { valid: false, reason: 'URL is empty.' };
  }

  // Reject explicit non-http(s) schemes like javascript:, data:, file:, ftp:
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return { valid: false, reason: 'Only http:// and https:// URLs are supported.' };
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Only HTTP/HTTPS URLs are allowed.' };
    }
    if (!options?.allowLocalhost && isPrivateOrBlockedHostname(parsed.hostname)) {
      return { valid: false, reason: 'Private or local network URLs are blocked.' };
    }
    // Strip hash fragment for canonical cache key and fetch target
    parsed.hash = '';
    return { valid: true, normalizedUrl: parsed.toString() };
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function parseAttributesFromTag(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tag)) !== null) {
    const key = match[1].toLowerCase();
    const value = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '');
    attrs[key] = value;
  }
  return attrs;
}

function resolveHttpAssetUrl(rawCandidate: string, baseUrl: string): string | null {
  const cleaned = decodeHtmlEntities(rawCandidate || '');
  if (!cleaned || /^data:/i.test(cleaned)) return null;
  try {
    const resolved = new URL(cleaned, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    const str = resolved.toString();
    return str.length <= 2000 ? str : null;
  } catch {
    return null;
  }
}

export function extractLinkPreviewMetadata(
  html: string,
  baseUrl: string
): Omit<LinkPreviewMetadata, 'ok' | 'cached'> {
  const headSlice = html.slice(0, 262_144);
  const metaMap = new Map<string, string>();

  const metaTags = headSlice.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const attrs = parseAttributesFromTag(tag);
    const key = (attrs.property || attrs.name || attrs.itemprop || '').trim().toLowerCase();
    const content = (attrs.content || attrs.value || '').trim();
    if (key && content && !metaMap.has(key)) {
      metaMap.set(key, content);
    }
  }

  let imageSrcLink = '';
  const linkTags = headSlice.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    const attrs = parseAttributesFromTag(tag);
    const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
    if (rel.includes('image_src') && attrs.href && !imageSrcLink) {
      imageSrcLink = attrs.href;
    }
  }

  const imageCandidates = [
    metaMap.get('og:image:secure_url'),
    metaMap.get('og:image:url'),
    metaMap.get('og:image'),
    metaMap.get('twitter:image:src'),
    metaMap.get('twitter:image'),
    imageSrcLink,
  ];

  let resolvedImageUrl: string | null = null;
  for (const candidate of imageCandidates) {
    if (!candidate) continue;
    const resolved = resolveHttpAssetUrl(candidate, baseUrl);
    if (resolved) {
      resolvedImageUrl = resolved;
      break;
    }
  }

  const titleMatch = headSlice.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle =
    metaMap.get('og:title') ||
    metaMap.get('twitter:title') ||
    (titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ')) : '');

  const rawDesc =
    metaMap.get('og:description') ||
    metaMap.get('twitter:description') ||
    metaMap.get('description') ||
    '';

  const siteName = metaMap.get('og:site_name') || '';

  return {
    found: Boolean(resolvedImageUrl),
    imageUrl: resolvedImageUrl,
    title: rawTitle ? rawTitle.slice(0, 120) : undefined,
    description: rawDesc ? rawDesc.slice(0, 500) : undefined,
    siteName: siteName ? siteName.slice(0, 80) : undefined,
    sourceUrl: baseUrl,
  };
}

export class LinkPreviewMemoryCache {
  private readonly store = new Map<
    string,
    { expiresAtMs: number; value: Omit<LinkPreviewMetadata, 'cached'> }
  >();
  private readonly maxEntries: number;
  private readonly hitTtlMs: number;
  private readonly missTtlMs: number;

  constructor(options?: { maxEntries?: number; hitTtlMs?: number; missTtlMs?: number }) {
    this.maxEntries = options?.maxEntries ?? 300;
    this.hitTtlMs = options?.hitTtlMs ?? 6 * 60 * 60 * 1000; // 6 hours
    this.missTtlMs = options?.missTtlMs ?? 15 * 60 * 1000; // 15 minutes
  }

  get(
    normalizedUrl: string,
    nowMs: number = Date.now()
  ): LinkPreviewMetadata | null {
    const entry = this.store.get(normalizedUrl);
    if (!entry) return null;
    if (entry.expiresAtMs <= nowMs) {
      this.store.delete(normalizedUrl);
      return null;
    }
    // Refresh insertion order for simple LRU behavior
    this.store.delete(normalizedUrl);
    this.store.set(normalizedUrl, entry);
    return {
      ...entry.value,
      cached: true,
    };
  }

  set(
    normalizedUrl: string,
    value: Omit<LinkPreviewMetadata, 'cached'>,
    nowMs: number = Date.now()
  ): void {
    if (this.store.has(normalizedUrl)) {
      this.store.delete(normalizedUrl);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
      }
    }
    const ttl = value.found ? this.hitTtlMs : this.missTtlMs;
    this.store.set(normalizedUrl, {
      expiresAtMs: nowMs + ttl,
      value,
    });
  }

  get size(): number {
    return this.store.size;
  }
}

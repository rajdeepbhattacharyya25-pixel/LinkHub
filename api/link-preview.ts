interface ServerlessReq {
  url?: string;
  query?: Record<string, string | string[] | undefined>;
}

interface ServerlessRes {
  status: (code: number) => ServerlessRes;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
}

interface LinkPreviewMetadata {
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

const GITHUB_RESERVED_PATHS = new Set([
  'features', 'orgs', 'topics', 'trending', 'collections', 'settings',
  'marketplace', 'explore', 'sponsors', 'notifications', 'pulls', 'issues',
  'login', 'signup', 'pricing', 'about',
]);

const previewCache = new Map<
  string,
  { expiresAtMs: number; value: Omit<LinkPreviewMetadata, 'cached'> }
>();
const MAX_CACHE_ENTRIES = 200;
const HIT_TTL_MS = 6 * 60 * 60 * 1000;
const MISS_TTL_MS = 15 * 60 * 1000;

function getCachedPreview(key: string): LinkPreviewMetadata | null {
  const entry = previewCache.get(key);
  if (!entry) return null;
  if (entry.expiresAtMs <= Date.now()) {
    previewCache.delete(key);
    return null;
  }
  previewCache.delete(key);
  previewCache.set(key, entry);
  return { ...entry.value, cached: true };
}

function setCachedPreview(key: string, value: Omit<LinkPreviewMetadata, 'cached'>): void {
  if (previewCache.has(key)) {
    previewCache.delete(key);
  } else if (previewCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = previewCache.keys().next().value;
    if (oldest) previewCache.delete(oldest);
  }
  previewCache.set(key, {
    expiresAtMs: Date.now() + (value.found ? HIT_TTL_MS : MISS_TTL_MS),
    value,
  });
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

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b, c, d] = ipv4Match.slice(1).map(Number);
    if ([a, b, c, d].some((oct) => Number.isNaN(oct) || oct < 0 || oct > 255)) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

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

  if (!ipv4Match && !host.includes('.')) return true;
  return false;
}

function validatePreviewTargetUrl(
  rawUrl: string
): { valid: boolean; normalizedUrl?: string; reason?: string } {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return { valid: false, reason: 'URL is empty.' };
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return { valid: false, reason: 'Only http:// and https:// URLs are supported.' };
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Only HTTP/HTTPS URLs are allowed.' };
    }
    if (isPrivateOrBlockedHostname(parsed.hostname)) {
      return { valid: false, reason: 'Private or local network URLs are blocked.' };
    }
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
    attrs[key] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function resolveHttpAssetUrl(rawCandidate: string, baseUrl: string): string | null {
  const cleaned = decodeHtmlEntities(rawCandidate || '');
  if (!cleaned || /^data:/i.test(cleaned)) return null;
  try {
    const resolved = new URL(cleaned, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    const str = resolved.toString();
    return str.length <= 2000 ? str : null;
  } catch {
    return null;
  }
}

function resolvePlatformPreviewImage(normalizedUrl: string): string | null {
  try {
    const parsed = new URL(normalizedUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const segments = parsed.pathname.split('/').map((s) => s.trim()).filter(Boolean);

    if (host === 'github.com') {
      if (segments.length >= 2 && !GITHUB_RESERVED_PATHS.has(segments[0].toLowerCase())) {
        const owner = segments[0].replace(/[^a-zA-Z0-9._-]/g, '');
        const repo = segments[1].replace(/\.git$/i, '').replace(/[^a-zA-Z0-9._-]/g, '');
        if (owner && repo) return `https://opengraph.githubassets.com/1/${owner}/${repo}`;
      }
      if (segments.length === 1 && !GITHUB_RESERVED_PATHS.has(segments[0].toLowerCase())) {
        const user = segments[0].replace(/[^a-zA-Z0-9._-]/g, '');
        if (user) return `https://github.com/${user}.png?size=600`;
      }
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = parsed.searchParams.get('v') || '';
      if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return `https://i.ytimg.com/vi/${v}/hqdefault.jpg`;
      if (segments[0] === 'shorts' && segments[1] && /^[a-zA-Z0-9_-]{11}$/.test(segments[1])) {
        return `https://i.ytimg.com/vi/${segments[1]}/hqdefault.jpg`;
      }
    }

    if (host === 'youtu.be' && segments[0] && /^[a-zA-Z0-9_-]{11}$/.test(segments[0])) {
      return `https://i.ytimg.com/vi/${segments[0]}/hqdefault.jpg`;
    }

    return null;
  } catch {
    return null;
  }
}

function buildWebsiteScreenshotFallbackUrl(normalizedUrl: string): string {
  return `https://image.thum.io/get/width/800/crop/450/noanimate/${normalizedUrl}`;
}

function extractLinkPreviewMetadata(
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
    if (key && content && !metaMap.has(key)) metaMap.set(key, content);
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

  if (!resolvedImageUrl) {
    resolvedImageUrl = resolvePlatformPreviewImage(baseUrl);
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

async function readBoundedText(response: globalThis.Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    return text.slice(0, maxBytes);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let totalBytes = 0;
  let result = '';

  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      totalBytes += value.byteLength;
      result += decoder.decode(value, { stream: true });
      if (result.includes('</head>')) break;
    }
    result += decoder.decode();
  } finally {
    reader.cancel().catch(() => {});
  }
  return result;
}

async function fetchMicrolinkMetadata(
  normalizedUrl: string
): Promise<Omit<LinkPreviewMetadata, 'cached'> | null> {
  try {
    const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(normalizedUrl)}&meta=true`;
    const res = await fetch(endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) return null;

    const payload = (await res.json()) as {
      data?: {
        title?: string;
        description?: string;
        publisher?: string;
        url?: string;
        image?: { url?: string };
        logo?: { url?: string };
      };
    };
    const d = payload?.data;
    if (!d) return null;

    const rawCandidate =
      d.image?.url || resolvePlatformPreviewImage(normalizedUrl) || d.logo?.url || null;
    const resolvedImg = rawCandidate ? resolveHttpAssetUrl(rawCandidate, normalizedUrl) : null;

    return {
      ok: true,
      found: Boolean(resolvedImg),
      imageUrl: resolvedImg,
      title: typeof d.title === 'string' && d.title.trim() ? d.title.trim().slice(0, 120) : undefined,
      description:
        typeof d.description === 'string' && d.description.trim()
          ? d.description.trim().slice(0, 500)
          : undefined,
      siteName:
        typeof d.publisher === 'string' && d.publisher.trim()
          ? d.publisher.trim().slice(0, 80)
          : undefined,
      sourceUrl: typeof d.url === 'string' && d.url.trim() ? d.url.trim() : normalizedUrl,
    };
  } catch {
    return null;
  }
}

function extractQueryParam(req: ServerlessReq, key: string): string {
  const fromQuery = req.query?.[key];
  if (Array.isArray(fromQuery)) return fromQuery[0] || '';
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
  if (req.url) {
    try {
      const parsed = new URL(req.url, 'https://localhost');
      return parsed.searchParams.get(key) || '';
    } catch {
      return '';
    }
  }
  return '';
}

export default async function handler(req: ServerlessReq, res: ServerlessRes) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const rawUrl = extractQueryParam(req, 'url');
  const check = validatePreviewTargetUrl(rawUrl);
  if (!check.valid || !check.normalizedUrl) {
    res.status(400).json({
      ok: false,
      found: false,
      imageUrl: null,
      sourceUrl: rawUrl,
      cached: false,
      error: check.reason || 'Invalid URL.',
    });
    return;
  }

  const normalizedUrl = check.normalizedUrl;
  const cached = getCachedPreview(normalizedUrl);
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(cached);
    return;
  }

  let partialTitle: string | undefined;
  let partialDesc: string | undefined;
  let partialSiteName: string | undefined;

  // Tier 1: Direct SSRF-guarded HTML/Image fetch (bounded to 3.5s for Vercel 10s limit)
  try {
    const upstream = await fetch(normalizedUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(3500),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const finalUrl = upstream.url || normalizedUrl;
    const finalCheck = validatePreviewTargetUrl(finalUrl);
    if (!finalCheck.valid) {
      res.status(403).json({
        ok: true,
        found: false,
        imageUrl: null,
        sourceUrl: normalizedUrl,
        cached: false,
        error: 'Redirect target blocked.',
      });
      return;
    }

    if (upstream.ok) {
      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      if (contentType.startsWith('image/')) {
        const directImage: Omit<LinkPreviewMetadata, 'cached'> = {
          ok: true,
          found: true,
          imageUrl: finalUrl,
          sourceUrl: finalUrl,
        };
        setCachedPreview(normalizedUrl, directImage);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.json({ ...directImage, cached: false });
        return;
      }

      if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
        const html = await readBoundedText(upstream, 262_144);
        const extracted = extractLinkPreviewMetadata(html, finalUrl);
        partialTitle = extracted.title;
        partialDesc = extracted.description;
        partialSiteName = extracted.siteName;
        if (extracted.found && extracted.imageUrl) {
          const payload: Omit<LinkPreviewMetadata, 'cached'> = {
            ok: true,
            ...extracted,
          };
          setCachedPreview(normalizedUrl, payload);
          res.setHeader('Cache-Control', 'public, max-age=300');
          res.json({ ...payload, cached: false });
          return;
        }
      }
    }
  } catch {
    // Fall through to Microlink & platform/screenshot resolvers
  }

  // Tier 2: Fast Microlink metadata extraction (3.0s timeout, no slow headless screenshot)
  const microlink = await fetchMicrolinkMetadata(normalizedUrl);
  if (microlink) {
    partialTitle = microlink.title || partialTitle;
    partialDesc = microlink.description || partialDesc;
    partialSiteName = microlink.siteName || partialSiteName;
    if (microlink.found && microlink.imageUrl) {
      const resolved: Omit<LinkPreviewMetadata, 'cached'> = {
        ...microlink,
        title: partialTitle,
        description: partialDesc,
        siteName: partialSiteName,
      };
      setCachedPreview(normalizedUrl, resolved);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ ...resolved, cached: false });
      return;
    }
  }

  // Tier 3: Deterministic platform OG or live screenshot fallback
  const fallbackImg =
    resolvePlatformPreviewImage(normalizedUrl) ||
    buildWebsiteScreenshotFallbackUrl(normalizedUrl);

  const finalPayload: Omit<LinkPreviewMetadata, 'cached'> = {
    ok: true,
    found: Boolean(fallbackImg),
    imageUrl: fallbackImg,
    title: partialTitle,
    description: partialDesc,
    siteName: partialSiteName,
    sourceUrl: normalizedUrl,
  };
  setCachedPreview(normalizedUrl, finalPayload);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ ...finalPayload, cached: false });
}

import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWebsiteScreenshotFallbackUrl,
  extractLinkPreviewMetadata,
  fetchLinkPreviewFromMicrolink,
  LinkPreviewMemoryCache,
  resolvePlatformPreviewImage,
  validatePreviewTargetUrl,
  type LinkPreviewMetadata,
} from './src/utils/linkPreview.ts';
import {
  DEFAULT_SITE_CONFIG,
  LEGACY_DEMO_LINK_IDS,
  isHubConfigured,
  isUntouchedLegacyDemoHub,
  normalizeSiteConfig,
  type SiteConfigState,
} from './src/data/profileData.ts';
import {
  buildAiProfileDiscoveryJson,
  buildLandingSeoMetadata,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  decodeFirestoreRestDocument,
  escapeXml,
  injectSeoIntoHtml,
  parseDeveloperSkillsList,
  parseFirestoreRestLink,
  resolveEffectiveOrigin,
} from './src/utils/seoAndGeo.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

interface FirebaseClientConfigFile {
  projectId?: string;
  apiKey?: string;
  firestoreDatabaseId?: string;
}

function readFirebaseConfigFile(): FirebaseClientConfigFile {
  try {
    const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as FirebaseClientConfigFile;
    }
  } catch {
    // ignore missing or invalid config
  }
  return {};
}

const FIREBASE_CFG = readFirebaseConfigFile();
const SEO_CACHE_TTL_MS = 45_000;
let cachedPublicHub: {
  config: SiteConfigState;
  updatedAtIso?: string;
  expiresAtMs: number;
} | null = null;

async function loadLivePublicHubForSeo(): Promise<{
  config: SiteConfigState;
  updatedAtIso?: string;
}> {
  const now = Date.now();
  if (cachedPublicHub && cachedPublicHub.expiresAtMs > now) {
    return {
      config: cachedPublicHub.config,
      updatedAtIso: cachedPublicHub.updatedAtIso,
    };
  }

  const projectId = (FIREBASE_CFG.projectId || '').trim();
  const databaseId = (FIREBASE_CFG.firestoreDatabaseId || '(default)').trim();
  const apiKey = (FIREBASE_CFG.apiKey || '').trim();

  if (!projectId || !apiKey) {
    return { config: DEFAULT_SITE_CONFIG };
  }

  const baseFirestoreUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(databaseId)}/documents`;

  try {
    const [hubRes, linksRes] = await Promise.all([
      fetch(`${baseFirestoreUrl}/hub/public?key=${encodeURIComponent(apiKey)}`, {
        signal: AbortSignal.timeout(1800),
      }),
      fetch(
        `${baseFirestoreUrl}:runQuery?key=${encodeURIComponent(apiKey)}`,
        {
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
          signal: AbortSignal.timeout(1800),
        }
      ),
    ]);

    let rawHub: Partial<SiteConfigState> | null = null;
    let updatedAtIso: string | undefined;

    if (hubRes.ok) {
      const hubJson = (await hubRes.json()) as {
        updateTime?: string;
        fields?: Record<string, unknown>;
      };
      updatedAtIso = hubJson.updateTime;
      const decoded = decodeFirestoreRestDocument(hubJson);
      if (decoded) {
        rawHub = decoded as Partial<SiteConfigState>;
      }
    }

    const legacyDemoDetected = isUntouchedLegacyDemoHub(rawHub);
    const baseConfig =
      rawHub && !legacyDemoDetected
        ? normalizeSiteConfig(rawHub)
        : DEFAULT_SITE_CONFIG;

    let finalLinks = baseConfig.links;
    if (linksRes.ok) {
      const queryRows = (await linksRes.json()) as Array<{ document?: unknown }>;
      const docs = Array.isArray(queryRows)
        ? queryRows.map((row) => row?.document).filter(Boolean)
        : [];
      const parsed = docs
        .map(parseFirestoreRestLink)
        .filter((item): item is NonNullable<typeof item> => Boolean(item && item.isPublic))
        .filter((item) => !legacyDemoDetected || !LEGACY_DEMO_LINK_IDS.has(item.id))
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(({ orderIndex: _oi, isPublic: _ip, ...rest }) => rest);
      if (parsed.length > 0) {
        finalLinks = parsed;
      }
    }

    const combined: SiteConfigState = {
      ...baseConfig,
      links: finalLinks,
    };

    cachedPublicHub = {
      config: combined,
      updatedAtIso,
      expiresAtMs: now + SEO_CACHE_TTL_MS,
    };

    return { config: combined, updatedAtIso };
  } catch {
    return { config: DEFAULT_SITE_CONFIG };
  }
}

function getRequestOrigin(req: Request): string {
  const xfProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  const xfHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')[0]
    .trim();
  const proto = xfProto || req.protocol || 'http';
  const host = xfHost || req.get('host') || `localhost:${PORT}`;
  return resolveEffectiveOrigin(`${proto}://${host}`, process.env.APP_URL);
}

function renderDynamicOgCardSvg(config: SiteConfigState): string {
  const configured = isHubConfigured(config);
  const p = config.profile;
  const ds = config.designSystem;
  const titleText =
    configured && (p.fullName || p.name).trim()
      ? (p.fullName || p.name).trim()
      : 'RajdeepBhattacharyya-LinkHub';
  const subtitleText =
    configured && p.role.trim()
      ? p.role.trim()
      : 'Personal Developer Portfolio & Link Studio';
  const skills = parseDeveloperSkillsList(config).slice(0, 4).join('  ·  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${escapeXml(ds.secondarySurface || '#3A2418')}"/>
      <stop offset="100%" stop-color="${escapeXml(ds.canvasBg || '#4A3324')}"/>
    </linearGradient>
    <linearGradient id="copperGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#DFC3A4" />
      <stop offset="45%" stop-color="#B88E65" />
      <stop offset="100%" stop-color="#7A5333" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="64" y="64" width="1072" height="502" rx="36" fill="${escapeXml(
    ds.cardBg || '#F4EDE2'
  )}" stroke="${escapeXml(ds.borderColor || '#D5C4AE')}" stroke-width="2"/>
  <rect x="112" y="112" width="320" height="36" rx="18" fill="${escapeXml(
    ds.secondarySurface || '#3A2418'
  )}"/>
  <text x="272" y="135" text-anchor="middle" fill="#FAF6F0" font-family="monospace" font-size="13" font-weight="700" letter-spacing="1.2">RAJDEEPBHATTACHARYYA-LINKHUB</text>
  <text x="112" y="255" fill="${escapeXml(
    ds.primaryText || '#1A120E'
  )}" font-family="sans-serif" font-size="56" font-weight="800">${escapeXml(
    titleText.slice(0, 32)
  )}</text>
  <text x="112" y="318" fill="${escapeXml(
    ds.accentPrimary || '#6B4A2E'
  )}" font-family="sans-serif" font-size="30" font-weight="600">${escapeXml(
    subtitleText.slice(0, 56)
  )}</text>
  <text x="112" y="470" fill="${escapeXml(
    ds.secondarySurface || '#3A2418'
  )}" font-family="monospace" font-size="20" font-weight="600">${escapeXml(
    skills || 'Featured Projects  ·  GitHub Activity  ·  Digital Pass'
  )}</text>
  <g transform="translate(880, 175) scale(0.85)">
    <rect x="8" y="8" width="240" height="240" rx="56" fill="#281810" stroke="#A88462" stroke-width="6" />
    <g fill="none" stroke="url(#copperGold)" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
      <path d="M82 68 V188" />
      <path d="M82 68 H120 C140 68 152 80 152 97 C152 114 140 126 120 126 H82" />
      <path d="M114 126 L150 188" />
      <path d="M138 68 H162 C180 68 192 79 192 95 C192 109 182 119 168 123 C185 127 196 139 196 157 C196 175 182 188 160 188 H134" />
    </g>
    <path d="M52 128 C52 106 68 92 90 92 H116 C132 92 142 104 148 128 C154 152 164 164 180 164 H186 C202 164 212 150 212 128 C212 106 200 94 182 94" fill="none" stroke="#FAF6F0" stroke-width="11" stroke-linecap="round" />
  </g>
</svg>
`;
}

const previewCache = new LinkPreviewMemoryCache({
  maxEntries: 300,
  hitTtlMs: 6 * 60 * 60 * 1000,
  missTtlMs: 15 * 60 * 1000,
});

const inFlightRequests = new Map<string, Promise<LinkPreviewMetadata>>();

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
      if (result.includes('</head>')) {
        break;
      }
    }
    result += decoder.decode();
  } finally {
    reader.cancel().catch(() => {});
  }
  return result;
}

async function fetchWebsitePreviewMetadata(normalizedUrl: string): Promise<LinkPreviewMetadata> {
  const cached = previewCache.get(normalizedUrl);
  if (cached) return cached;

  const existingPromise = inFlightRequests.get(normalizedUrl);
  if (existingPromise) return existingPromise;

  const task = (async (): Promise<LinkPreviewMetadata> => {
    let partialTitle: string | undefined;
    let partialDesc: string | undefined;
    let partialSiteName: string | undefined;

    try {
      const res = await fetch(normalizedUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(5500),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      const finalUrl = res.url || normalizedUrl;
      const finalCheck = validatePreviewTargetUrl(finalUrl);
      if (!finalCheck.valid) {
        const blocked: Omit<LinkPreviewMetadata, 'cached'> = {
          ok: true,
          found: false,
          imageUrl: null,
          sourceUrl: normalizedUrl,
          error: 'Redirect target blocked.',
        };
        previewCache.set(normalizedUrl, blocked);
        return { ...blocked, cached: false };
      }

      if (res.ok) {
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.startsWith('image/')) {
          const directImage: Omit<LinkPreviewMetadata, 'cached'> = {
            ok: true,
            found: true,
            imageUrl: finalUrl,
            sourceUrl: finalUrl,
          };
          previewCache.set(normalizedUrl, directImage);
          return { ...directImage, cached: false };
        }

        if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
          const html = await readBoundedText(res, 262_144);
          const extracted = extractLinkPreviewMetadata(html, finalUrl);
          partialTitle = extracted.title;
          partialDesc = extracted.description;
          partialSiteName = extracted.siteName;
          if (extracted.found && extracted.imageUrl) {
            const payload: Omit<LinkPreviewMetadata, 'cached'> = {
              ok: true,
              ...extracted,
            };
            previewCache.set(normalizedUrl, payload);
            return { ...payload, cached: false };
          }
        }
      }
    } catch {
      // Fall through to Microlink & platform/screenshot resolvers
    }

    try {
      const microlink = await fetchLinkPreviewFromMicrolink(normalizedUrl);
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
          previewCache.set(normalizedUrl, resolved);
          return { ...resolved, cached: false };
        }
      }

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
      previewCache.set(normalizedUrl, finalPayload);
      return { ...finalPayload, cached: false };
    } finally {
      inFlightRequests.delete(normalizedUrl);
    }
  })();

  inFlightRequests.set(normalizedUrl, task);
  return task;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, cacheSize: previewCache.size });
  });

  app.get('/api/public-config', (_req: Request, res: Response) => {
    const mapsApiKey = (
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      ''
    ).trim();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ mapsApiKey });
  });

  app.get('/api/link-preview', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
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

    const result = await fetchWebsitePreviewMetadata(check.normalizedUrl);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(result);
  });

  app.get('/api/image-proxy', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const check = validatePreviewTargetUrl(rawUrl);
    if (!check.valid || !check.normalizedUrl) {
      res.status(400).json({ error: check.reason || 'Invalid image URL.' });
      return;
    }

    try {
      const upstream = await fetch(check.normalizedUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(7000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LinkHubImageCropProxy/1.0)',
          Accept: 'image/*,*/*;q=0.5',
        },
      });

      const finalCheck = validatePreviewTargetUrl(upstream.url || check.normalizedUrl);
      if (!finalCheck.valid) {
        res.status(403).json({ error: 'Blocked redirect target.' });
        return;
      }

      if (!upstream.ok) {
        res.status(502).json({ error: `Image server returned ${upstream.status}` });
        return;
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      if (!contentType.startsWith('image/')) {
        res.status(415).json({ error: 'Target URL did not return an image.' });
        return;
      }

      const maxBytes = 5 * 1024 * 1024;
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > maxBytes) {
        res.status(413).json({ error: 'Image exceeds 5 MB crop proxy limit.' });
        return;
      }

      res.setHeader('Content-Type', contentType.split(';')[0]);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(buf);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to fetch remote image.',
      });
    }
  });

  const mediaMemoryCache = new Map<
    string,
    { buffer: Buffer; mimeType: string; etag: string }
  >();
  const ALLOWED_MEDIA_MIME_TYPES = new Set([
    'image/webp',
    'image/jpeg',
    'image/png',
  ]);

  app.get('/api/media/:mediaId', async (req: Request, res: Response) => {
    const rawId = typeof req.params.mediaId === 'string' ? req.params.mediaId.trim() : '';
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(rawId)) {
      res.status(400).json({ error: 'Invalid media ID.' });
      return;
    }

    const cached = mediaMemoryCache.get(rawId);
    if (cached) {
      if (req.headers['if-none-match'] === cached.etag) {
        res.status(304).end();
        return;
      }
      res.setHeader('Content-Type', cached.mimeType);
      res.setHeader('Content-Length', String(cached.buffer.byteLength));
      res.setHeader('ETag', cached.etag);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.send(cached.buffer);
      return;
    }

    const projectId = (FIREBASE_CFG.projectId || '').trim();
    const databaseId = (FIREBASE_CFG.firestoreDatabaseId || '(default)').trim();
    const apiKey = (FIREBASE_CFG.apiKey || '').trim();
    if (!projectId || !apiKey) {
      res.status(503).json({ error: 'Cloud media store not configured.' });
      return;
    }

    const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/${encodeURIComponent(databaseId)}/documents/publicMedia/${encodeURIComponent(
      rawId
    )}?key=${encodeURIComponent(apiKey)}`;

    try {
      const upstream = await fetch(docUrl, {
        signal: AbortSignal.timeout(5000),
      });
      if (upstream.status === 404) {
        res.status(404).json({ error: 'Media not found.' });
        return;
      }
      if (!upstream.ok) {
        res.status(502).json({ error: `Media store returned ${upstream.status}` });
        return;
      }

      const rawDoc = (await upstream.json()) as { fields?: Record<string, unknown> };
      const decoded = decodeFirestoreRestDocument(rawDoc);
      const mimeType =
        decoded && typeof decoded.mimeType === 'string'
          ? decoded.mimeType.trim().toLowerCase()
          : '';
      const dataBase64 =
        decoded && typeof decoded.dataBase64 === 'string'
          ? decoded.dataBase64.trim()
          : '';

      if (!ALLOWED_MEDIA_MIME_TYPES.has(mimeType) || !dataBase64) {
        res.status(404).json({ error: 'Invalid media record.' });
        return;
      }

      const buffer = Buffer.from(dataBase64, 'base64');
      if (buffer.byteLength === 0 || buffer.byteLength > 700_000) {
        res.status(404).json({ error: 'Corrupt or oversized media payload.' });
        return;
      }

      const etag = `"pm-${rawId}-${buffer.byteLength}"`;
      if (mediaMemoryCache.size >= 80) {
        const firstKey = mediaMemoryCache.keys().next().value;
        if (firstKey) mediaMemoryCache.delete(firstKey);
      }
      mediaMemoryCache.set(rawId, { buffer, mimeType, etag });

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', String(buffer.byteLength));
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.send(buffer);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to read cloud media.',
      });
    }
  });

  app.get('/robots.txt', async (req: Request, res: Response) => {
    const origin = getRequestOrigin(req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(buildRobotsTxt(origin));
  });

  app.get('/sitemap.xml', async (req: Request, res: Response) => {
    const origin = getRequestOrigin(req);
    const { config, updatedAtIso } = await loadLivePublicHubForSeo();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(buildSitemapXml(config, origin, updatedAtIso));
  });

  app.get('/llms.txt', async (req: Request, res: Response) => {
    const origin = getRequestOrigin(req);
    const { config } = await loadLivePublicHubForSeo();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.send(buildLlmsTxt(config, origin, false));
  });

  app.get('/llms-full.txt', async (req: Request, res: Response) => {
    const origin = getRequestOrigin(req);
    const { config } = await loadLivePublicHubForSeo();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.send(buildLlmsTxt(config, origin, true));
  });

  app.get('/.well-known/ai-profile.json', async (req: Request, res: Response) => {
    const origin = getRequestOrigin(req);
    const { config } = await loadLivePublicHubForSeo();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.json(buildAiProfileDiscoveryJson(config, origin));
  });

  app.get('/og-card.svg', async (_req: Request, res: Response) => {
    const { config } = await loadLivePublicHubForSeo();
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(renderDynamicOgCardSvg(config));
  });

  app.get('/favicon.svg', (_req: Request, res: Response) => {
    const svgPath = path.resolve(__dirname, 'public/favicon.svg');
    if (fs.existsSync(svgPath)) {
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.sendFile(svgPath);
      return;
    }
    res.status(404).end();
  });

  app.get('/og-logo.jpg', (_req: Request, res: Response) => {
    const jpgPath = path.resolve(__dirname, 'public/og-logo.jpg');
    if (fs.existsSync(jpgPath)) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.sendFile(jpgPath);
      return;
    }
    res.status(404).end();
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.get(
      ['/', '/index.html', '/RajdeepBhattacharyya-LinkHub', '/rajdeepbhattacharyya-linkhub'],
      async (req: Request, res: Response, next) => {
        try {
          const indexPath = path.resolve(__dirname, 'index.html');
          const template = fs.readFileSync(indexPath, 'utf-8');
          const origin = getRequestOrigin(req);
          const { config } = await loadLivePublicHubForSeo();
          const enriched = injectSeoIntoHtml(template, config, origin, 'hub');
          const html = await vite.transformIndexHtml(req.originalUrl, enriched);
          const seoMeta = buildLandingSeoMetadata(config, origin, 'hub');
          res.status(200);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('X-Robots-Tag', seoMeta.robots);
          res.setHeader('Link', '</llms.txt>; rel="alternate"; type="text/plain"');
          res.end(html);
        } catch (err) {
          vite.ssrFixStacktrace(err as Error);
          next(err);
        }
      }
    );

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir, { index: false }));
    app.use(async (req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        const template = fs.readFileSync(indexFile, 'utf-8');
        const origin = getRequestOrigin(req);
        const { config } = await loadLivePublicHubForSeo();
        const html = injectSeoIntoHtml(template, config, origin, 'hub');
        const seoMeta = buildLandingSeoMetadata(config, origin, 'hub');
        res.status(200);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Robots-Tag', seoMeta.robots);
        res.setHeader('Link', '</llms.txt>; rel="alternate"; type="text/plain"');
        res.send(html);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

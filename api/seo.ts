import fs from 'node:fs';
import path from 'node:path';

interface ServerlessReq {
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}

interface ServerlessRes {
  status: (code: number) => ServerlessRes;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
  send: (body: string) => void;
}

interface FirebaseCfg {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
}

interface PublicLinkSummary {
  id: string;
  title: string;
  url: string;
  description: string;
  category: string;
  pinned: boolean;
  orderIndex: number;
}

interface PublicHubData {
  name: string;
  fullName: string;
  handle: string;
  role: string;
  location: string;
  bio: string;
  email: string;
  githubUsername: string;
  seoKeywords: string[];
  socials: Array<{ platform: string; label: string; url: string }>;
  posts: Array<{ slug: string; title: string; excerpt: string; date: string; content: string[] }>;
  links: PublicLinkSummary[];
  designSystem: {
    canvasBg: string;
    cardBg: string;
    primaryText: string;
    accentPrimary: string;
    borderColor: string;
    pantoneCode: string;
  };
  updatedAtIso?: string;
}

const DEFAULT_PUBLIC_PATH = '/RajdeepBhattacharyya-LinkHub';

let cachedFirebaseCfg: FirebaseCfg | null = null;
let cachedHub: { data: PublicHubData; expiresAtMs: number } | null = null;

function resolveFirebaseCfg(): FirebaseCfg {
  if (cachedFirebaseCfg) return cachedFirebaseCfg;
  let fileCfg: Partial<FirebaseCfg> = {};
  try {
    const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      fileCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as Partial<FirebaseCfg>;
    }
  } catch {
    // fallback to env vars
  }
  cachedFirebaseCfg = {
    projectId: (process.env.VITE_FIREBASE_PROJECT_ID || fileCfg.projectId || '').trim(),
    apiKey: (process.env.VITE_FIREBASE_API_KEY || fileCfg.apiKey || '').trim(),
    firestoreDatabaseId: (
      process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      fileCfg.firestoreDatabaseId ||
      '(default)'
    ).trim(),
  };
  return cachedFirebaseCfg;
}

function decodeFirestoreValue(val: unknown): unknown {
  if (!val || typeof val !== 'object') return undefined;
  const v = val as Record<string, unknown>;
  if ('stringValue' in v) return String(v.stringValue ?? '');
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return String(v.timestampValue ?? '');
  if ('arrayValue' in v && v.arrayValue && typeof v.arrayValue === 'object') {
    const arr = (v.arrayValue as { values?: unknown[] }).values;
    return Array.isArray(arr) ? arr.map(decodeFirestoreValue) : [];
  }
  if ('mapValue' in v && v.mapValue && typeof v.mapValue === 'object') {
    const fields = (v.mapValue as { fields?: Record<string, unknown> }).fields || {};
    const out: Record<string, unknown> = {};
    for (const [k, fv] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(fv);
    }
    return out;
  }
  return undefined;
}

function decodeFirestoreDoc(doc: { fields?: Record<string, unknown> } | null | undefined): Record<string, unknown> | null {
  if (!doc || !doc.fields || typeof doc.fields !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, fv] of Object.entries(doc.fields)) {
    out[k] = decodeFirestoreValue(fv);
  }
  return out;
}

function escapeXml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getRequestOrigin(req: ServerlessReq): string {
  const xfProto = String(req.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  const xfHost = String(req.headers?.['x-forwarded-host'] || '')
    .split(',')[0]
    .trim();
  const host = xfHost || String(req.headers?.host || '').trim() || 'rajdeepbhattacharyya-linkhub.vercel.app';
  const proto = xfProto || (host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function extractTypeParam(req: ServerlessReq): string {
  const raw = req.query?.type;
  const fromQuery = (Array.isArray(raw) ? raw[0] || '' : raw || '').trim().toLowerCase();
  if (fromQuery) return fromQuery;
  if (req.url) {
    try {
      const parsed = new URL(req.url, 'https://localhost');
      const qp = (parsed.searchParams.get('type') || '').trim().toLowerCase();
      if (qp) return qp;
      const p = parsed.pathname.toLowerCase();
      if (p.endsWith('robots.txt')) return 'robots';
      if (p.endsWith('sitemap.xml')) return 'sitemap';
      if (p.endsWith('llms-full.txt')) return 'llms-full';
      if (p.endsWith('llms.txt')) return 'llms';
      if (p.endsWith('ai-profile.json')) return 'ai-profile';
      if (p.endsWith('og-card.svg')) return 'og-card';
    } catch {
      return '';
    }
  }
  return '';
}

function defaultHubData(): PublicHubData {
  return {
    name: 'Rajdeep Bhattacharyya',
    fullName: 'Rajdeep Bhattacharyya',
    handle: '@rajdeepbhattacharyya',
    role: 'Software, AI & Hardware Builder',
    location: '',
    bio: 'Personal developer portfolio, interactive 3D builder pass, live GitHub telemetry, and link studio.',
    email: '',
    githubUsername: '',
    seoKeywords: ['Software Engineering', 'AI', 'Hardware', 'Portfolio'],
    socials: [],
    posts: [],
    links: [],
    designSystem: {
      canvasBg: '#4A3324',
      cardBg: '#F4EDE2',
      primaryText: '#1A120E',
      accentPrimary: '#6B4A2E',
      borderColor: '#D5C4AE',
      pantoneCode: 'PANTONE 19-1118 TCX',
    },
  };
}

async function loadLiveHubData(): Promise<PublicHubData> {
  const now = Date.now();
  if (cachedHub && cachedHub.expiresAtMs > now) {
    return cachedHub.data;
  }

  const fallback = defaultHubData();
  const { projectId, firestoreDatabaseId, apiKey } = resolveFirebaseCfg();
  if (!projectId || !apiKey) return fallback;

  const baseFirestoreUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(firestoreDatabaseId || '(default)')}/documents`;

  try {
    const [hubRes, linksRes] = await Promise.all([
      fetch(`${baseFirestoreUrl}/hub/public?key=${encodeURIComponent(apiKey)}`, {
        signal: AbortSignal.timeout(2500),
      }),
      fetch(`${baseFirestoreUrl}:runQuery?key=${encodeURIComponent(apiKey)}`, {
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
        signal: AbortSignal.timeout(2500),
      }),
    ]);

    let updatedAtIso: string | undefined;
    let decodedHub: Record<string, unknown> | null = null;
    if (hubRes.ok) {
      const hubJson = (await hubRes.json()) as {
        updateTime?: string;
        fields?: Record<string, unknown>;
      };
      updatedAtIso = hubJson.updateTime;
      decodedHub = decodeFirestoreDoc(hubJson);
    }

    const profile = (decodedHub?.profile as Record<string, unknown> | undefined) || {};
    const ds = (decodedHub?.designSystem as Record<string, unknown> | undefined) || {};
    const bioParts = [
      String(profile.bioPrefix || '').trim(),
      String(profile.bioCode || '').trim(),
      String(profile.bioMiddle || '').trim(),
      String(profile.bioLinkText || '').trim(),
      String(profile.bioSuffix || '').trim(),
    ].filter(Boolean);

    const keywordsRaw = String(profile.seoKeywords || '')
      .split(/[,;\n|]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const socials = Array.isArray(decodedHub?.socials)
      ? (decodedHub.socials as Array<Record<string, unknown>>)
          .filter((s) => s && typeof s.url === 'string' && s.url.trim())
          .map((s) => ({
            platform: String(s.platform || 'link'),
            label: String(s.label || s.platform || 'Link'),
            url: String(s.url || '').trim(),
          }))
      : [];

    const posts = Array.isArray(decodedHub?.posts)
      ? (decodedHub.posts as Array<Record<string, unknown>>)
          .filter((p) => p && typeof p.title === 'string' && p.title.trim())
          .map((p) => ({
            slug: String(p.slug || ''),
            title: String(p.title || '').trim(),
            excerpt: String(p.excerpt || '').trim(),
            date: String(p.date || '').trim(),
            content: Array.isArray(p.content) ? p.content.map(String) : [],
          }))
      : [];

    let links: PublicLinkSummary[] = [];
    if (linksRes.ok) {
      const rows = (await linksRes.json()) as Array<{
        document?: { name?: string; fields?: Record<string, unknown> };
      }>;
      if (Array.isArray(rows)) {
        links = rows
          .map((row) => {
            const doc = row?.document;
            const decoded = decodeFirestoreDoc(doc);
            if (!decoded || decoded.isPublic === false) return null;
            const docId = String(doc?.name || '').split('/').pop() || String(decoded.id || '');
            return {
              id: docId,
              title: String(decoded.title || '').trim(),
              url: String(decoded.url || '').trim(),
              description: String(decoded.description || '').trim(),
              category: String(decoded.category || 'project').trim(),
              pinned: Boolean(decoded.pinned),
              orderIndex: Number(decoded.orderIndex ?? 999),
            };
          })
          .filter((item): item is PublicLinkSummary => Boolean(item && item.title && item.url))
          .sort((a, b) => a.orderIndex - b.orderIndex);
      }
    }

    if (links.length === 0 && Array.isArray(decodedHub?.links)) {
      links = (decodedHub.links as Array<Record<string, unknown>>)
        .map((l, idx) => ({
          id: String(l.id || `link-${idx}`),
          title: String(l.title || '').trim(),
          url: String(l.url || '').trim(),
          description: String(l.description || '').trim(),
          category: String(l.category || 'project').trim(),
          pinned: Boolean(l.pinned),
          orderIndex: Number(l.orderIndex ?? idx),
        }))
        .filter((l) => l.title && l.url);
    }

    const result: PublicHubData = {
      name: String(profile.name || '').trim() || fallback.name,
      fullName: String(profile.fullName || profile.name || '').trim() || fallback.fullName,
      handle: String(profile.handle || '').trim() || fallback.handle,
      role: String(profile.role || '').trim() || fallback.role,
      location: String(profile.location || '').trim(),
      bio: bioParts.join(' ') || fallback.bio,
      email: String(profile.email || '').trim(),
      githubUsername: String(profile.githubUsername || '').trim(),
      seoKeywords: keywordsRaw.length > 0 ? keywordsRaw : fallback.seoKeywords,
      socials,
      posts,
      links,
      designSystem: {
        canvasBg: String(ds.canvasBg || fallback.designSystem.canvasBg),
        cardBg: String(ds.cardBg || fallback.designSystem.cardBg),
        primaryText: String(ds.primaryText || fallback.designSystem.primaryText),
        accentPrimary: String(ds.accentPrimary || fallback.designSystem.accentPrimary),
        borderColor: String(ds.borderColor || fallback.designSystem.borderColor),
        pantoneCode: String(ds.pantoneCode || fallback.designSystem.pantoneCode),
      },
      updatedAtIso,
    };

    cachedHub = { data: result, expiresAtMs: now + 45_000 };
    return result;
  } catch {
    return fallback;
  }
}

function buildRobotsTxt(origin: string): string {
  const crawlers = [
    'Googlebot',
    'Bingbot',
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Claude-Web',
    'PerplexityBot',
    'Google-Extended',
    'Applebot-Extended',
  ];
  const lines = [
    `# LLMs & AI Search Discovery: ${origin}/llms.txt`,
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
  ];
  for (const bot of crawlers) {
    lines.push(`User-agent: ${bot}`, 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', '');
  }
  lines.push(`Sitemap: ${origin}/sitemap.xml`, '');
  return lines.join('\n');
}

function buildSitemapXml(origin: string, updatedAtIso?: string): string {
  const lastmod = updatedAtIso ? updatedAtIso.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${origin}${DEFAULT_PUBLIC_PATH}`, changefreq: 'daily', priority: '1.0' },
    { loc: `${origin}/pass`, changefreq: 'weekly', priority: '0.8' },
    { loc: `${origin}/posts`, changefreq: 'weekly', priority: '0.8' },
    { loc: `${origin}/work`, changefreq: 'monthly', priority: '0.7' },
    { loc: `${origin}/llms.txt`, changefreq: 'weekly', priority: '0.8' },
    { loc: `${origin}/llms-full.txt`, changefreq: 'weekly', priority: '0.7' },
    { loc: `${origin}/.well-known/ai-profile.json`, changefreq: 'weekly', priority: '0.7' },
  ];
  const entries = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function buildLlmsTxt(data: PublicHubData, origin: string, full: boolean): string {
  const lines: string[] = [
    `# ${data.fullName} (${data.handle})`,
    '',
    `> ${data.role}${data.location ? ` · ${data.location}` : ''}`,
    '',
    data.bio,
    '',
    '## Core Pages',
    `- [Link Hub Portfolio](${origin}${DEFAULT_PUBLIC_PATH})`,
    `- [3D Builder Pass](${origin}/pass)`,
    `- [Articles & Notes](${origin}/posts)`,
    `- [Work With Me](${origin}/work)`,
    `- [Machine-Readable Profile JSON](${origin}/.well-known/ai-profile.json)`,
    `- [Sitemap](${origin}/sitemap.xml)`,
    '',
  ];

  if (data.seoKeywords.length > 0) {
    lines.push('## Skills & Focus Areas', data.seoKeywords.join(', '), '');
  }

  if (data.links.length > 0) {
    lines.push('## Featured Links & Projects');
    for (const l of data.links) {
      lines.push(`- [${l.title}](${l.url})${l.description ? `: ${l.description}` : ''}`);
    }
    lines.push('');
  }

  if (data.socials.length > 0) {
    lines.push('## Social Profiles');
    for (const s of data.socials) {
      lines.push(`- ${s.label}: ${s.url}`);
    }
    lines.push('');
  }

  if (full && data.posts.length > 0) {
    lines.push('## Published Articles');
    for (const p of data.posts) {
      lines.push(`### ${p.title}${p.date ? ` (${p.date})` : ''}`);
      if (p.excerpt) lines.push(p.excerpt);
      if (p.content.length > 0) lines.push('', ...p.content);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function buildAiProfileJson(data: PublicHubData, origin: string) {
  return {
    schema: 'https://llmstxt.org/',
    version: '1.0',
    canonicalUrl: `${origin}${DEFAULT_PUBLIC_PATH}`,
    discovery: {
      llmsTxt: `${origin}/llms.txt`,
      llmsFullTxt: `${origin}/llms-full.txt`,
      sitemapXml: `${origin}/sitemap.xml`,
      robotsTxt: `${origin}/robots.txt`,
      ogCardSvg: `${origin}/og-card.svg`,
    },
    identity: {
      name: data.name,
      fullName: data.fullName,
      handle: data.handle,
      role: data.role,
      location: data.location,
      bio: data.bio,
      githubUsername: data.githubUsername,
      skills: data.seoKeywords,
    },
    socials: data.socials,
    links: data.links.map(({ id, title, url, description, category, pinned }) => ({
      id,
      title,
      url,
      description,
      category,
      pinned,
    })),
    posts: data.posts.map(({ slug, title, excerpt, date }) => ({ slug, title, excerpt, date })),
    updatedAt: data.updatedAtIso || null,
  };
}

function renderOgCardSvg(data: PublicHubData): string {
  const ds = data.designSystem;
  const title = escapeXml(data.fullName.slice(0, 48));
  const subtitle = escapeXml(data.role.slice(0, 72));
  const bio = escapeXml(data.bio.slice(0, 120));
  const pantone = escapeXml(ds.pantoneCode || 'PANTONE 19-1118 TCX');
  const handle = escapeXml(data.handle);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${escapeXml(ds.canvasBg)}"/>
  <rect x="64" y="64" width="1072" height="502" rx="32" fill="${escapeXml(ds.cardBg)}" stroke="${escapeXml(ds.borderColor)}" stroke-width="2"/>
  <rect x="112" y="116" width="230" height="36" rx="18" fill="${escapeXml(ds.accentPrimary)}"/>
  <text x="132" y="139" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" font-weight="700" fill="#FAF6F0">${pantone}</text>
  <text x="112" y="248" font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="800" fill="${escapeXml(ds.primaryText)}">${title}</text>
  <text x="112" y="308" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600" fill="${escapeXml(ds.accentPrimary)}">${subtitle}</text>
  <text x="112" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="22" fill="${escapeXml(ds.primaryText)}" opacity="0.82">${bio}</text>
  <line x1="112" y1="472" x2="1088" y2="472" stroke="${escapeXml(ds.borderColor)}" stroke-width="1.5"/>
  <text x="112" y="518" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20" font-weight="600" fill="${escapeXml(ds.primaryText)}">${handle}</text>
  <text x="1088" y="518" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18" fill="${escapeXml(ds.accentPrimary)}">RajdeepBhattacharyya-LinkHub</text>
</svg>`;
}

export default async function handler(req: ServerlessReq, res: ServerlessRes) {
  const origin = getRequestOrigin(req);
  const type = extractTypeParam(req);

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (type === 'robots') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).send(buildRobotsTxt(origin));
    return;
  }

  const data = await loadLiveHubData();

  switch (type) {
    case 'sitemap':
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      res.status(200).send(buildSitemapXml(origin, data.updatedAtIso));
      return;

    case 'llms':
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
      res.status(200).send(buildLlmsTxt(data, origin, false));
      return;

    case 'llms-full':
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
      res.status(200).send(buildLlmsTxt(data, origin, true));
      return;

    case 'ai-profile':
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
      res.status(200).json(buildAiProfileJson(data, origin));
      return;

    case 'og-card':
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.status(200).send(renderOgCardSvg(data));
      return;

    default:
      res.status(400).json({ error: 'Unknown SEO/GEO endpoint type.' });
  }
}

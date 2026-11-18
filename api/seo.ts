import fs from 'node:fs';
import path from 'node:path';

interface ServerlessReq {
  method?: string;
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

function sanitizeHexColor(raw: unknown, fallback: string): string {
  const val = String(raw || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(val) ? val : fallback;
}

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

const CANONICAL_PRODUCTION_ORIGIN = (
  process.env.SITE_CANONICAL_ORIGIN || 'https://rajdeepbhattacharyya-linkhub.vercel.app'
).replace(/\/+$/, '');

const ALLOWED_ORIGINS = new Set([
  CANONICAL_PRODUCTION_ORIGIN,
  'https://rajdeepbhattacharyya-linkhub.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function getRequestOrigin(req: ServerlessReq): string {
  const xfHost = String(req.headers?.['x-forwarded-host'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const host = (xfHost || String(req.headers?.host || '').trim().toLowerCase()).replace(/[^a-z0-9.:-]/g, '');
  if (host === 'localhost:3000' || host === '127.0.0.1:3000') {
    return `http://${host}`;
  }
  const candidate = `https://${host}`;
  return ALLOWED_ORIGINS.has(candidate) ? candidate : CANONICAL_PRODUCTION_ORIGIN;
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
      if (p.endsWith('ai-catalog.json') || p.endsWith('ard.json')) return 'ai-catalog';
      if (p.endsWith('og-card.svg')) return 'og-card';
    } catch {
      return '';
    }
  }
  return '';
}

function defaultHubData(): PublicHubData {
  return {
    name: 'Rajdeep',
    fullName: 'Rajdeep Bhattacharyya',
    handle: '@_rajdeep.007_',
    role: 'IT Student · SaaS & Product Builder',
    location: 'Kolkata, India',
    bio: 'IT student and builder interested in the intersection of software, AI, and hardware. I turn ideas into working projects — from SaaS tools and interactive web experiences to microcontroller-powered DIY.',
    email: '',
    githubUsername: 'rajdeepbhattacharyya25-pixel',
    seoKeywords: [
      'React', 'TypeScript', 'JavaScript', 'Python', 'Supabase', 'Git', 'GitHub',
      'Vercel', 'Three.js', 'GSAP', 'Google AI Studio', 'Gemini API', 'Ollama',
      'Hugging Face', 'n8n', 'ESP32', 'Arduino', 'WLED', 'SaaS Development',
      'Frontend Development', 'AI Prototyping', 'Embedded Systems', 'Hardware Prototyping',
    ],
    socials: [
      { platform: 'github', label: 'GitHub', url: 'https://github.com/rajdeepbhattacharyya25-pixel' },
      { platform: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com/in/rajdeep-bhattacharyya-497945371/' },
      { platform: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/_rajdeep.007_/' },
    ],
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
      location: String(profile.location || '').trim() || fallback.location,
      bio: bioParts.join(' ') || fallback.bio,
      email: String(profile.email || '').trim(),
      githubUsername: String(profile.githubUsername || '').trim() || fallback.githubUsername,
      seoKeywords: keywordsRaw.length > 0 ? keywordsRaw : fallback.seoKeywords,
      socials: socials.length > 0 ? socials : fallback.socials,
      posts,
      links,
      designSystem: {
        canvasBg: sanitizeHexColor(ds.canvasBg, fallback.designSystem.canvasBg),
        cardBg: sanitizeHexColor(ds.cardBg, fallback.designSystem.cardBg),
        primaryText: sanitizeHexColor(ds.primaryText, fallback.designSystem.primaryText),
        accentPrimary: sanitizeHexColor(ds.accentPrimary, fallback.designSystem.accentPrimary),
        borderColor: sanitizeHexColor(ds.borderColor, fallback.designSystem.borderColor),
        pantoneCode: String(ds.pantoneCode || fallback.designSystem.pantoneCode).slice(0, 48),
      },
      updatedAtIso,
    };

    cachedHub = { data: result, expiresAtMs: now + 45_000 };
    return result;
  } catch {
    return fallback;
  }
}

function articleForRole(role: string): 'an' | 'a' {
  return /^[aeiou]/i.test(role.trim()) ? 'an' : 'a';
}

function buildFaqEntries(data: PublicHubData, origin: string) {
  const topSkills = data.seoKeywords.slice(0, 12).join(', ');
  const githubUrl = data.githubUsername
    ? `https://github.com/${data.githubUsername}`
    : data.socials.find((s) => s.platform === 'github')?.url || '';
  const linkedinUrl = data.socials.find((s) => s.platform === 'linkedin')?.url || '';

  return [
    {
      question: `Who is ${data.fullName}?`,
      answer: `${data.fullName} (${data.handle}) is ${articleForRole(data.role)} ${data.role}${data.location ? ` based in ${data.location}` : ''}. ${data.bio}`,
    },
    {
      question: `What technologies, AI tools, and hardware does ${data.fullName} work with?`,
      answer: `${data.fullName} works across software, AI, and hardware including ${topSkills || 'React, TypeScript, Python, Gemini API, ESP32, and Arduino'}.`,
    },
    {
      question: `Where can I view ${data.fullName}'s projects, GitHub contributions, and digital pass?`,
      answer: `Visit the official Link Hub at ${origin}${DEFAULT_PUBLIC_PATH}, the 3D Builder Pass at ${origin}/pass${githubUrl ? `, or GitHub at ${githubUrl}` : ''}.`,
    },
    {
      question: `How can I contact or collaborate with ${data.fullName}?`,
      answer: `Use the collaboration form at ${origin}/work${linkedinUrl ? ` or connect on LinkedIn at ${linkedinUrl}` : ''}.`,
    },
  ];
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
    'anthropic-ai',
    'PerplexityBot',
    'Google-Extended',
    'Applebot-Extended',
    'cohere-ai',
    'Meta-ExternalAgent',
  ];
  const lines = [
    `# Official AI & LLM Discovery Index: ${origin}/llms.txt`,
    `# Full AI Dossier: ${origin}/llms-full.txt`,
    `# Structured Profile JSON: ${origin}/.well-known/ai-profile.json`,
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
  // Keep sitemap focused on indexable HTML pages; non-HTML AI files are linked via HTTP Link headers & robots.txt
  const urls = [
    { loc: `${origin}${DEFAULT_PUBLIC_PATH}`, changefreq: 'daily', priority: '1.0' },
    { loc: `${origin}/pass`, changefreq: 'weekly', priority: '0.8' },
    { loc: `${origin}/posts`, changefreq: 'weekly', priority: '0.8' },
    { loc: `${origin}/work`, changefreq: 'monthly', priority: '0.7' },
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
  const lastUpdated = data.updatedAtIso || new Date().toISOString();
  const faqs = buildFaqEntries(data, origin);
  const lines: string[] = [
    `# ${data.fullName} (${data.handle}) — Official Developer Portfolio & Link Hub`,
    '',
    `> **TL;DR:** ${data.fullName} is ${articleForRole(data.role)} ${data.role}${data.location ? ` based in ${data.location}` : ''}, building across SaaS web applications, AI prototyping, and microcontroller hardware (ESP32, Arduino, WLED).`,
    '',
    `- **Canonical URL:** ${origin}${DEFAULT_PUBLIC_PATH}`,
    `- **Last Updated:** ${lastUpdated}`,
    '',
    '## Entity Summary',
    `| Field | Value |`,
    `| :--- | :--- |`,
    `| **Full Name** | ${data.fullName} |`,
    `| **Handle** | ${data.handle} |`,
    `| **Role** | ${data.role} |`,
    `| **Location** | ${data.location || 'India'} |`,
    `| **GitHub** | ${data.githubUsername ? `https://github.com/${data.githubUsername}` : 'N/A'} |`,
    '',
    '## About',
    data.bio,
    '',
    '## Core Pages & Discovery Endpoints',
    `- [Official Link Hub Portfolio](${origin}${DEFAULT_PUBLIC_PATH}): Primary portfolio, projects, live GitHub activity, and contact`,
    `- [Interactive 3D Builder Pass](${origin}/pass): Scannable QR pass and vCard contact export`,
    `- [Articles & Engineering Notes](${origin}/posts): Technical posts and write-ups`,
    `- [Work With Me / Collaboration](${origin}/work): Project inquiries, hackathons, and collaborations`,
    `- [Full LLM Context Dossier](${origin}/llms-full.txt): Complete markdown dossier for AI retrieval`,
    `- [Structured AI Profile JSON](${origin}/.well-known/ai-profile.json): Machine-readable identity, skills, and links`,
    `- [XML Sitemap](${origin}/sitemap.xml): Search crawler index`,
    '',
  ];

  if (data.seoKeywords.length > 0) {
    lines.push('## Skills, Frameworks & Hardware Stack', data.seoKeywords.join(', '), '');
  }

  if (data.links.length > 0) {
    lines.push('## Featured Projects & Links');
    for (const l of data.links) {
      lines.push(
        `- [${l.title}](${l.url})${l.category ? ` (${l.category})` : ''}${l.description ? `: ${l.description}` : ''}`
      );
    }
    lines.push('');
  }

  if (data.socials.length > 0) {
    lines.push('## Verified Social Profiles (sameAs)');
    for (const s of data.socials) {
      lines.push(`- **${s.label}:** ${s.url}`);
    }
    lines.push('');
  }

  lines.push('## Frequently Asked Questions');
  for (const faq of faqs) {
    lines.push(`### ${faq.question}`, faq.answer, '');
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
  const lastUpdated = data.updatedAtIso || new Date().toISOString();
  return {
    schema: 'https://llmstxt.org/',
    version: '1.1',
    canonicalUrl: `${origin}${DEFAULT_PUBLIC_PATH}`,
    lastUpdated,
    discovery: {
      llmsTxt: `${origin}/llms.txt`,
      llmsFullTxt: `${origin}/llms-full.txt`,
      sitemapXml: `${origin}/sitemap.xml`,
      robotsTxt: `${origin}/robots.txt`,
      ogShareCard: `${origin}/og-share-card.jpg`,
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
      knowsAbout: data.seoKeywords,
      sameAs: data.socials.map((s) => s.url),
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
    faq: buildFaqEntries(data, origin),
    posts: data.posts.map(({ slug, title, excerpt, date }) => ({ slug, title, excerpt, date })),
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
  <rect width="1200" height="630" fill="${sanitizeHexColor(ds.canvasBg, '#4A3324')}"/>
  <rect x="64" y="64" width="1072" height="502" rx="32" fill="${sanitizeHexColor(ds.cardBg, '#F4EDE2')}" stroke="${sanitizeHexColor(ds.borderColor, '#D5C4AE')}" stroke-width="2"/>
  <rect x="112" y="116" width="230" height="36" rx="18" fill="${sanitizeHexColor(ds.accentPrimary, '#6B4A2E')}"/>
  <text x="132" y="139" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" font-weight="700" fill="#FAF6F0">${pantone}</text>
  <text x="112" y="248" font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="800" fill="${sanitizeHexColor(ds.primaryText, '#1A120E')}">${title}</text>
  <text x="112" y="308" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600" fill="${sanitizeHexColor(ds.accentPrimary, '#6B4A2E')}">${subtitle}</text>
  <text x="112" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="22" fill="${sanitizeHexColor(ds.primaryText, '#1A120E')}" opacity="0.82">${bio}</text>
  <line x1="112" y1="472" x2="1088" y2="472" stroke="${sanitizeHexColor(ds.borderColor, '#D5C4AE')}" stroke-width="1.5"/>
  <text x="112" y="518" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20" font-weight="600" fill="${sanitizeHexColor(ds.primaryText, '#1A120E')}">${handle}</text>
  <text x="1088" y="518" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18" fill="${sanitizeHexColor(ds.accentPrimary, '#6B4A2E')}">RajdeepBhattacharyya-LinkHub</text>
</svg>`;
}

export default async function handler(req: ServerlessReq, res: ServerlessRes) {
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const origin = getRequestOrigin(req);
  const type = extractTypeParam(req);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');

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
    case 'ai-catalog': {
      let hostDomain = 'rajdeepbhattacharyya-linkhub.vercel.app';
      try {
        const parsedHost = new URL(origin).hostname.replace(/[^a-zA-Z0-9.-]/g, '');
        if (parsedHost && parsedHost !== 'localhost' && parsedHost !== '127.0.0.1') {
          hostDomain = parsedHost;
        }
      } catch {
        // Keep canonical domain
      }
      const ownerName = (data.fullName || data.name || 'Rajdeep Bhattacharyya').trim();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
      res.status(200).json({
        specVersion: '1.0',
        host: {
          displayName: `${ownerName} — Link Hub`,
        },
        entries: [
          {
            identifier: `urn:air:${hostDomain}:doc:llms-context`,
            displayName: `${ownerName} LLMs Context`,
            description:
              'Concise machine-readable Markdown overview of developer identity, skills, projects, and verified social profiles.',
            type: 'text/markdown',
            url: `${origin}/llms.txt`,
            representativeQueries: [
              `Who is ${ownerName}?`,
              `What projects and technologies does ${ownerName} build with?`,
              `How can I contact or collaborate with ${ownerName}?`,
            ],
          },
          {
            identifier: `urn:air:${hostDomain}:data:ai-profile`,
            displayName: `${ownerName} Structured AI Profile`,
            description:
              'Structured JSON developer profile including Schema.org Person metadata, skills, featured projects, and verified social links.',
            type: 'application/json',
            url: `${origin}/.well-known/ai-profile.json`,
            representativeQueries: [
              `Get ${ownerName}'s structured developer profile JSON`,
              `List ${ownerName}'s verified GitHub, LinkedIn, and Devfolio profiles`,
              `Show featured SaaS, AI, and hardware links by ${ownerName}`,
            ],
          },
        ],
      });
      return;
    }

    case 'og-card':
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.status(200).send(renderOgCardSvg(data));
      return;

    default:
      res.status(400).json({ error: 'Unknown SEO/GEO endpoint type.' });
  }
}

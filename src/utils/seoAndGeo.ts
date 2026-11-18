import {
  isHubConfigured,
  type SiteConfigState,
} from '../data/profileData';
import { buildGitHubProfileUrl, type LinkCardItem } from './hubLogic';

export type SeoRouteKey = 'hub' | 'work' | 'posts' | 'pass' | 'admin';

export interface LandingSeoMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  siteName: string;
  ogType: 'website' | 'profile';
  ogImage: string;
  twitterCard: 'summary_large_image';
  robots: string;
  keywords: string[];
  authorName: string;
}

export interface SeoAuditCheckItem {
  id: string;
  label: string;
  passed: boolean;
  impact: 'high' | 'medium';
  detail: string;
}

export interface SeoAndGeoAuditResult {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  passedCount: number;
  totalChecks: number;
  checks: SeoAuditCheckItem[];
}

export const DEFAULT_PUBLIC_URL_SLUG = 'RajdeepBhattacharyya-LinkHub';
export const DEFAULT_PUBLIC_URL_PATH = `/${DEFAULT_PUBLIC_URL_SLUG}`;
export const DEFAULT_OG_LOGO_PATH = '/og-logo.jpg';
export const DEFAULT_OG_SHARE_CARD_PATH = '/og-share-card.jpg';
export const DEFAULT_FAVICON_SVG_PATH = '/favicon.svg';
export const DEFAULT_PUBLIC_TITLE =
  'RajdeepBhattacharyya-LinkHub — Personal Portfolio & Link Studio';
export const DEFAULT_PUBLIC_DESCRIPTION =
  'High-craft self-hosted personal link hub, portfolio card, interactive pass, Pantone Color Institute system design studio, and developer analytics workspace.';

export function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeXml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function serializeJsonLdSafe(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function resolveEffectiveOrigin(
  rawOrigin?: string | null,
  appUrlEnv?: string | null
): string {
  const candidates = [appUrlEnv, rawOrigin];
  for (const candidate of candidates) {
    const trimmed = String(candidate || '').trim();
    if (!trimmed) continue;
    try {
      const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
      return url.origin.replace(/\/+$/, '');
    } catch {
      // try next candidate
    }
  }
  return '';
}

export function parseDeveloperSkillsList(config: SiteConfigState): string[] {
  const rawSkills = (config.profile.seoKeywords || '')
    .split(/[,;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const skill of rawSkills) {
    const key = skill.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(skill.slice(0, 64));
    }
  }

  return deduped.slice(0, 24);
}

export function buildProfilePlainBio(config: SiteConfigState): string {
  const p = config.profile;
  const parts = [
    p.bioPrefix,
    p.bioCode,
    p.bioMiddle,
    p.bioLinkText,
    p.bioSuffix,
  ]
    .map((part) => String(part || ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return parts;
}

export function fitMetaTextLength(
  rawText: string,
  minLen: number,
  maxLen: number
): string {
  const clean = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxLen) return clean;
  const sliced = clean.slice(0, Math.max(minLen, maxLen - 1));
  const lastSpace = sliced.lastIndexOf(' ');
  const clipped =
    lastSpace >= Math.floor(maxLen * 0.55) ? sliced.slice(0, lastSpace) : sliced;
  return `${clipped.replace(/[,.;:\-–—]+$/, '').trim()}…`;
}

export function buildVerifiedSameAsUrls(config: SiteConfigState): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const pushIfHttp = (raw?: string | null) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) return;
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      urls.push(trimmed);
    }
  };

  for (const social of config.socials || []) {
    pushIfHttp(social.url);
  }

  const ghUser = (config.profile.githubUsername || '').trim();
  if (ghUser) {
    pushIfHttp(
      (config.profile.githubProfileUrl || '').trim() ||
        buildGitHubProfileUrl(ghUser)
    );
  }

  pushIfHttp(config.profile.bioLinkUrl);

  return urls;
}

export function resolvePublicMediaUrl(
  rawUrl: string | undefined | null,
  origin: string
): string | null {
  const clean = (rawUrl || '').trim();
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('/api/media/')) {
    return origin ? `${origin}${clean}` : clean;
  }
  return null;
}

export function resolveOgImageUrl(
  _config: SiteConfigState,
  origin: string
): string {
  const cleanOrigin = resolveEffectiveOrigin(origin);
  return cleanOrigin
    ? `${cleanOrigin}${DEFAULT_OG_SHARE_CARD_PATH}`
    : DEFAULT_OG_SHARE_CARD_PATH;
}

export function buildLandingSeoMetadata(
  config: SiteConfigState,
  origin: string,
  route: SeoRouteKey = 'hub'
): LandingSeoMetadata {
  const cleanOrigin = resolveEffectiveOrigin(origin);
  const configured = isHubConfigured(config);
  const p = config.profile;
  const displayName = (p.fullName || p.name || '').trim();
  const shortName = (p.name || p.fullName || '').trim();
  const role = (p.role || '').trim();
  const skills = parseDeveloperSkillsList(config);
  const bio = buildProfilePlainBio(config);

  let baseTitle = DEFAULT_PUBLIC_TITLE;
  if (configured && (p.seoTitle || '').trim()) {
    baseTitle = (p.seoTitle || '').trim();
  } else if (configured && shortName) {
    baseTitle = role
      ? `${shortName} — ${role} | ${DEFAULT_PUBLIC_URL_SLUG}`
      : `${shortName} — ${DEFAULT_PUBLIC_URL_SLUG}`;
  }

  let routePrefix = '';
  if (route === 'work') routePrefix = 'Work with ';
  if (route === 'posts') routePrefix = 'Posts by ';
  if (route === 'pass') routePrefix = 'Digital Pass — ';
  if (route === 'admin') routePrefix = 'Studio — ';

  const title =
    route === 'hub'
      ? fitMetaTextLength(baseTitle, 30, 65)
      : route === 'admin'
      ? `Studio — ${shortName || DEFAULT_PUBLIC_URL_SLUG}`
      : fitMetaTextLength(
          `${routePrefix}${shortName || DEFAULT_PUBLIC_URL_SLUG}${role ? ` (${role})` : ''}`,
          30,
          65
        );

  let rawDesc = DEFAULT_PUBLIC_DESCRIPTION;
  if (configured && (p.seoDescription || '').trim()) {
    rawDesc = (p.seoDescription || '').trim();
  } else if (configured && displayName) {
    const summaryParts: string[] = [];
    summaryParts.push(
      role ? `${displayName} is a ${role}` : `${displayName}'s developer portfolio`
    );
    if (p.location.trim()) {
      summaryParts[0] += ` based in ${p.location.trim()}`;
    }
    summaryParts[0] += '.';
    if (skills.length > 0) {
      summaryParts.push(`Focus: ${skills.slice(0, 5).join(', ')}.`);
    } else if (bio) {
      summaryParts.push(bio);
    }
    if (config.links.length > 0) {
      summaryParts.push(
        `Explore ${config.links.length} featured project${
          config.links.length === 1 ? '' : 's'
        }, GitHub activity, and direct contact.`
      );
    }
    rawDesc = summaryParts.join(' ');
  }

  const description = fitMetaTextLength(rawDesc, 110, 160);
  const routePath =
    route === 'hub'
      ? DEFAULT_PUBLIC_URL_PATH
      : `/${route}`;
  const canonicalUrl = cleanOrigin ? `${cleanOrigin}${routePath}` : routePath;

  return {
    title,
    description,
    canonicalUrl,
    siteName: DEFAULT_PUBLIC_URL_SLUG,
    ogType: configured && displayName ? 'profile' : 'website',
    ogImage: resolveOgImageUrl(config, cleanOrigin),
    twitterCard: 'summary_large_image',
    robots:
      route === 'admin'
        ? 'noindex, nofollow'
        : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
    keywords: skills,
    authorName: displayName || DEFAULT_PUBLIC_URL_SLUG,
  };
}

export function buildStructuredDataJsonLd(
  config: SiteConfigState,
  origin: string
): Record<string, unknown> {
  const cleanOrigin = resolveEffectiveOrigin(origin) || 'https://example.invalid';
  const configured = isHubConfigured(config);
  const meta = buildLandingSeoMetadata(config, cleanOrigin, 'hub');
  const p = config.profile;
  const displayName = (p.fullName || p.name || '').trim();
  const skills = parseDeveloperSkillsList(config);
  const sameAs = buildVerifiedSameAsUrls(config);
  const bio = buildProfilePlainBio(config);

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'WebSite',
      '@id': `${cleanOrigin}/#website`,
      url: `${cleanOrigin}/`,
      name: meta.siteName,
      description: meta.description,
      inLanguage: 'en',
    },
  ];

  if (!configured || !displayName) {
    graph.push({
      '@type': 'WebApplication',
      '@id': `${cleanOrigin}/#webapp`,
      name: 'Link Hub',
      url: `${cleanOrigin}/`,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'All',
      description: meta.description,
      featureList: [
        'Developer link bento showcase',
        'Live GitHub contribution heatmap',
        'Interactive 3D Digital Pass',
        'Direct inquiry and newsletter forms',
      ],
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    });
    return {
      '@context': 'https://schema.org',
      '@graph': graph,
    };
  }

  const personId = `${cleanOrigin}/#person`;
  const personNode: Record<string, unknown> = {
    '@type': 'Person',
    '@id': personId,
    name: displayName,
    url: `${cleanOrigin}/`,
    mainEntityOfPage: `${cleanOrigin}/#profilepage`,
  };

  if (p.handle.trim()) personNode.alternateName = p.handle.trim();
  if (p.role.trim()) personNode.jobTitle = p.role.trim();
  if (bio || (p.seoDescription || '').trim()) {
    personNode.description = (p.seoDescription || '').trim() || bio;
  }
  if (p.email.trim()) personNode.email = `mailto:${p.email.trim()}`;
  if (p.location.trim() || p.googleMapsUrl?.trim() || (typeof p.mapLat === 'number' && typeof p.mapLng === 'number')) {
    const placeNode: Record<string, unknown> = {
      '@type': 'Place',
      name: p.location.trim() || p.mapLabel.trim() || 'Base Location',
    };
    if (typeof p.mapLat === 'number' && typeof p.mapLng === 'number' && Number.isFinite(p.mapLat) && Number.isFinite(p.mapLng)) {
      placeNode.geo = {
        '@type': 'GeoCoordinates',
        latitude: p.mapLat,
        longitude: p.mapLng,
      };
    }
    if (p.googleMapsUrl?.trim() && /^https?:\/\//i.test(p.googleMapsUrl.trim())) {
      placeNode.hasMap = p.googleMapsUrl.trim();
    }
    personNode.homeLocation = placeNode;
  }
  if (skills.length > 0) {
    personNode.knowsAbout = skills;
  }
  if (sameAs.length > 0) {
    personNode.sameAs = sameAs;
  }
  const resolvedPersonImage = resolvePublicMediaUrl(p.avatarUrl, cleanOrigin);
  if (resolvedPersonImage) {
    personNode.image = resolvedPersonImage;
  }

  const profilePageNode: Record<string, unknown> = {
    '@type': 'ProfilePage',
    '@id': `${cleanOrigin}/#profilepage`,
    url: `${cleanOrigin}/`,
    name: meta.title,
    description: meta.description,
    isPartOf: { '@id': `${cleanOrigin}/#website` },
    mainEntity: { '@id': personId },
  };

  graph.push(profilePageNode, personNode);

  if (config.links.length > 0) {
    graph.push({
      '@type': 'ItemList',
      '@id': `${cleanOrigin}/#projects`,
      name: `${displayName} — Featured Projects & Links`,
      numberOfItems: config.links.length,
      itemListElement: config.links.map((link, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        item: {
          '@type': link.category === 'game' ? 'SoftwareApplication' : 'CreativeWork',
          name: link.title,
          description: link.description,
          url: link.url,
          author: { '@id': personId },
        },
      })),
    });
  }

  if (config.posts.length > 0) {
    graph.push({
      '@type': 'Blog',
      '@id': `${cleanOrigin}/#blog`,
      name: `${displayName} — Articles & Notes`,
      url: `${cleanOrigin}/#posts`,
      author: { '@id': personId },
      blogPost: config.posts.slice(0, 20).map((post) => ({
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.excerpt,
        articleSection: post.category,
        url: `${cleanOrigin}/#posts`,
        author: { '@id': personId },
      })),
    });
  }

  const faqEntries: { q: string; a: string }[] = [
    {
      q: `Who is ${displayName}${p.role.trim() ? ` (${p.role.trim()})` : ''}?`,
      a: [
        roleDescriptionSentence(displayName, p.role, p.location),
        skills.length > 0 ? `Core skills include ${skills.join(', ')}.` : '',
        (p.availabilityStatus || '').trim()
          ? `Current availability: ${(p.availabilityStatus || '').trim()}.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
  ];

  if (config.links.length > 0) {
    const projectNames = config.links
      .slice(0, 5)
      .map((l) => `${l.title} (${l.url})`)
      .join('; ');
    faqEntries.push({
      q: `What projects and software has ${displayName} built?`,
      a: `Featured work by ${displayName} includes: ${projectNames}.`,
    });
  }

  if (p.email.trim() || config.showContactSection) {
    faqEntries.push({
      q: `How can I contact or collaborate with ${displayName}?`,
      a: [
        p.email.trim() ? `Email directly at ${p.email.trim()}` : '',
        `Use the contact or Work With Me inquiry form at ${cleanOrigin}/#work.`,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  graph.push({
    '@type': 'FAQPage',
    '@id': `${cleanOrigin}/#faq`,
    mainEntity: faqEntries.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.a,
      },
    })),
  });

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

function roleDescriptionSentence(
  name: string,
  role?: string,
  location?: string
): string {
  const cleanRole = (role || '').trim();
  const cleanLoc = (location || '').trim();
  if (cleanRole && cleanLoc) {
    return `${name} is a ${cleanRole} based in ${cleanLoc}.`;
  }
  if (cleanRole) {
    return `${name} is a ${cleanRole}.`;
  }
  if (cleanLoc) {
    return `${name} is a developer based in ${cleanLoc}.`;
  }
  return `${name} publishes projects and developer notes on Link Hub.`;
}

export function buildLlmsTxt(
  config: SiteConfigState,
  origin: string,
  full = false
): string {
  const cleanOrigin = resolveEffectiveOrigin(origin) || '';
  const configured = isHubConfigured(config);
  const p = config.profile;
  const displayName = (p.fullName || p.name || '').trim();
  const skills = parseDeveloperSkillsList(config);
  const bio = buildProfilePlainBio(config);
  const sameAs = buildVerifiedSameAsUrls(config);

  if (!configured || !displayName) {
    const lines = [
      '# Link Hub',
      '',
      '> A personal developer portfolio, curated project bento hub, live GitHub activity showcase, and digital pass platform.',
      '',
      'Status: Pending initial owner configuration in Studio.',
      '',
      '## Machine-Readable Discovery',
      `- [Main Hub](${cleanOrigin || ''}/): Primary portfolio and contact page`,
      `- [Structured Profile JSON](${cleanOrigin || ''}/.well-known/ai-profile.json): Entity graph & developer metadata`,
      `- [Sitemap](${cleanOrigin || ''}/sitemap.xml): Search crawler URL index`,
    ];
    return lines.join('\n') + '\n';
  }

  const summaryHeader = [
    roleDescriptionSentence(displayName, p.role, p.location),
    skills.length > 0 ? `Specialties: ${skills.join(', ')}.` : '',
    (p.availabilityStatus || '').trim()
      ? `Availability: ${(p.availabilityStatus || '').trim()}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const lines: string[] = [
    `# ${displayName}${p.role.trim() ? ` — ${p.role.trim()}` : ''}`,
    '',
    `> ${summaryHeader}`,
    '',
    '## Developer Profile',
    `- Canonical Portfolio: ${cleanOrigin || ''}/`,
  ];

  if (p.handle.trim()) lines.push(`- Handle: ${p.handle.trim()}`);
  if (p.role.trim()) lines.push(`- Role: ${p.role.trim()}`);
  if (p.location.trim()) lines.push(`- Location: ${p.location.trim()}`);
  if ((p.availabilityStatus || '').trim()) {
    lines.push(`- Availability: ${(p.availabilityStatus || '').trim()}`);
  }
  if (skills.length > 0) lines.push(`- Skills & Tech Stack: ${skills.join(', ')}`);
  if (bio) lines.push(`- Summary: ${bio}`);
  if ((p.seoDescription || '').trim() && full) {
    lines.push(`- Detailed Overview: ${(p.seoDescription || '').trim()}`);
  }
  if (p.githubUsername.trim()) {
    const ghUrl =
      p.githubProfileUrl.trim() || buildGitHubProfileUrl(p.githubUsername.trim());
    lines.push(
      `- GitHub: @${p.githubUsername.trim()}${
        p.githubRepo?.trim() ? `/${p.githubRepo.trim()}` : ''
      } (${ghUrl})`
    );
  }
  if (p.email.trim()) lines.push(`- Contact Email: ${p.email.trim()}`);

  if (config.links.length > 0) {
    lines.push('', '## Featured Projects & Shipped Work');
    for (const link of config.links) {
      lines.push(
        `- [${link.title}](${link.url}) [${link.category}]: ${link.description}`
      );
      if (full && link.displayUrl) {
        lines.push(`  - Domain: ${link.displayUrl}${link.pinned ? ' (Featured / Pinned)' : ''}`);
      }
    }
  }

  if (sameAs.length > 0) {
    lines.push('', '## Verified Profiles & Social Links');
    for (const social of config.socials) {
      lines.push(`- ${social.label} (${social.handle || social.platform}): ${social.url}`);
    }
    if (p.githubUsername.trim()) {
      const ghUrl =
        p.githubProfileUrl.trim() || buildGitHubProfileUrl(p.githubUsername.trim());
      if (!config.socials.some((s) => s.url === ghUrl)) {
        lines.push(`- GitHub (@${p.githubUsername.trim()}): ${ghUrl}`);
      }
    }
  }

  if (config.posts.length > 0) {
    lines.push('', '## Technical Writing & Notes');
    for (const post of config.posts) {
      lines.push(`- **${post.title}** (${post.category} · ${post.date}): ${post.excerpt}`);
      if (full && Array.isArray(post.content) && post.content.length > 0) {
        lines.push(`  ${post.content.join(' ')}`);
      }
    }
  }

  lines.push(
    '',
    '## Discovery & Contact Channels',
    `- [Direct Inquiry / Work With Me](${cleanOrigin || ''}/#work): Send project inquiries directly`,
    `- [Digital Pass Card](${cleanOrigin || ''}/#pass): Interactive developer credential card`,
    `- [Full LLM Context](${cleanOrigin || ''}/llms-full.txt): Extended technical dossier`,
    `- [Machine-Readable Profile JSON](${cleanOrigin || ''}/.well-known/ai-profile.json): JSON entity graph`
  );

  return lines.join('\n') + '\n';
}

export function buildRobotsTxt(origin: string): string {
  const cleanOrigin = resolveEffectiveOrigin(origin);
  const sitemapLine = cleanOrigin
    ? `Sitemap: ${cleanOrigin}/sitemap.xml`
    : 'Sitemap: /sitemap.xml';
  const llmsLine = cleanOrigin
    ? `# LLMs & AI Search Discovery: ${cleanOrigin}/llms.txt`
    : '# LLMs & AI Search Discovery: /llms.txt';

  return [
    '# Standard Search Engines & Generative AI Crawlers Welcomed',
    llmsLine,
    '',
    'User-agent: Googlebot',
    'Allow: /',
    'Disallow: /api/',
    '',
    'User-agent: Bingbot',
    'Allow: /',
    'Disallow: /api/',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    'Disallow: /api/',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    'Disallow: /api/',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    'Disallow: /api/',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    'Disallow: /api/',
    '',
    'User-agent: anthropic-ai',
    'Allow: /',
    'Disallow: /api/',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    'Disallow: /api/',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    'Disallow: /api/',
    '',
    'User-agent: Applebot-Extended',
    'Allow: /',
    'Disallow: /api/',
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    sitemapLine,
    '',
  ].join('\n');
}

export function buildSitemapXml(
  config: SiteConfigState,
  origin: string,
  lastModIso?: string
): string {
  const baseUrl = resolveEffectiveOrigin(origin) || 'http://localhost:3000';
  const dateOnly = (lastModIso || new Date().toISOString()).slice(0, 10);
  const urls: { loc: string; changefreq: string; priority: string }[] = [
    { loc: `${baseUrl}${DEFAULT_PUBLIC_URL_PATH}`, changefreq: 'weekly', priority: '1.0' },
    { loc: `${baseUrl}/`, changefreq: 'weekly', priority: '0.9' },
    { loc: `${baseUrl}/llms.txt`, changefreq: 'weekly', priority: '0.8' },
    { loc: `${baseUrl}/llms-full.txt`, changefreq: 'weekly', priority: '0.7' },
    { loc: `${baseUrl}/.well-known/ai-profile.json`, changefreq: 'weekly', priority: '0.7' },
  ];

  if (isHubConfigured(config)) {
    urls.push(
      { loc: `${baseUrl}${DEFAULT_PUBLIC_URL_PATH}#work`, changefreq: 'monthly', priority: '0.7' },
      { loc: `${baseUrl}${DEFAULT_PUBLIC_URL_PATH}#pass`, changefreq: 'monthly', priority: '0.6' }
    );
    if (config.posts.length > 0) {
      urls.push({ loc: `${baseUrl}${DEFAULT_PUBLIC_URL_PATH}#posts`, changefreq: 'weekly', priority: '0.7' });
    }
  }

  const body = urls
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${escapeXml(dateOnly)}</lastmod>
    <changefreq>${escapeXml(entry.changefreq)}</changefreq>
    <priority>${escapeXml(entry.priority)}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function buildAiProfileDiscoveryJson(
  config: SiteConfigState,
  origin: string
): Record<string, unknown> {
  const cleanOrigin = resolveEffectiveOrigin(origin);
  const meta = buildLandingSeoMetadata(config, cleanOrigin, 'hub');
  const structuredData = buildStructuredDataJsonLd(config, cleanOrigin);
  const skills = parseDeveloperSkillsList(config);

  return {
    schema: 'https://llmstxt.org/',
    configured: isHubConfigured(config),
    generatedAt: new Date().toISOString(),
    canonicalUrl: meta.canonicalUrl,
    discoveryEndpoints: {
      llmsTxt: `${cleanOrigin}/llms.txt`,
      llmsFullTxt: `${cleanOrigin}/llms-full.txt`,
      sitemapXml: `${cleanOrigin}/sitemap.xml`,
      robotsTxt: `${cleanOrigin}/robots.txt`,
    },
    developer: {
      name: config.profile.fullName || config.profile.name || null,
      handle: config.profile.handle || null,
      role: config.profile.role || null,
      location: config.profile.location || null,
      availabilityStatus: config.profile.availabilityStatus || null,
      bio: buildProfilePlainBio(config) || null,
      skills,
      githubUsername: config.profile.githubUsername || null,
      sameAs: buildVerifiedSameAsUrls(config),
    },
    projects: config.links.map((l) => ({
      id: l.id,
      title: l.title,
      category: l.category,
      url: l.url,
      description: l.description,
      pinned: Boolean(l.pinned),
    })),
    posts: config.posts.map((post) => ({
      slug: post.slug,
      title: post.title,
      category: post.category,
      date: post.date,
      excerpt: post.excerpt,
    })),
    jsonLd: structuredData,
  };
}

export interface AiCatalogEntry {
  identifier: string;
  displayName: string;
  description: string;
  type: string;
  url: string;
  representativeQueries: string[];
}

export interface AiCatalogManifest {
  specVersion: '1.0';
  host: {
    displayName: string;
  };
  entries: AiCatalogEntry[];
}

/**
 * Generates an Agentic Resource Discovery (ARD) v1.0 compliant `ai-catalog.json` manifest
 * (`/.well-known/ai-catalog.json` & `/.well-known/ard.json`) for Chrome Lighthouse Agentic Browsing.
 */
export function buildAiCatalogJson(
  config: SiteConfigState,
  origin: string
): AiCatalogManifest {
  const cleanOrigin = resolveEffectiveOrigin(origin) || 'https://rajdeepbhattacharyya-linkhub.vercel.app';
  let hostDomain = 'rajdeepbhattacharyya-linkhub.vercel.app';
  try {
    const parsedHost = new URL(cleanOrigin).hostname.replace(/[^a-zA-Z0-9.-]/g, '');
    if (parsedHost && parsedHost !== 'localhost' && parsedHost !== '127.0.0.1') {
      hostDomain = parsedHost;
    }
  } catch {
    // Keep canonical production domain
  }

  const displayOwner =
    (config.profile.fullName || config.profile.name || 'Rajdeep Bhattacharyya').trim();

  return {
    specVersion: '1.0',
    host: {
      displayName: `${displayOwner} — Link Hub`,
    },
    entries: [
      {
        identifier: `urn:air:${hostDomain}:doc:llms-context`,
        displayName: `${displayOwner} LLMs Context`,
        description:
          'Concise machine-readable Markdown overview of developer identity, skills, projects, and verified social profiles.',
        type: 'text/markdown',
        url: `${cleanOrigin}/llms.txt`,
        representativeQueries: [
          `Who is ${displayOwner}?`,
          `What projects and technologies does ${displayOwner} build with?`,
          `How can I contact or collaborate with ${displayOwner}?`,
        ],
      },
      {
        identifier: `urn:air:${hostDomain}:data:ai-profile`,
        displayName: `${displayOwner} Structured AI Profile`,
        description:
          'Structured JSON developer profile including Schema.org Person metadata, skills, featured projects, and verified social links.',
        type: 'application/json',
        url: `${cleanOrigin}/.well-known/ai-profile.json`,
        representativeQueries: [
          `Get ${displayOwner}'s structured developer profile JSON`,
          `List ${displayOwner}'s verified GitHub, LinkedIn, and Devfolio profiles`,
          `Show featured SaaS, AI, and hardware links by ${displayOwner}`,
        ],
      },
    ],
  };
}

export function auditSeoAndAiDiscoverability(
  config: SiteConfigState
): SeoAndGeoAuditResult {
  const meta = buildLandingSeoMetadata(config, 'https://example.com', 'hub');
  const skills = parseDeveloperSkillsList(config);
  const bio = buildProfilePlainBio(config);
  const p = config.profile;

  const titleLen = meta.title.length;
  const descLen = meta.description.length;

  const checks: SeoAuditCheckItem[] = [
    {
      id: 'identity',
      label: 'Developer Name & Role Headline',
      passed: Boolean((p.name || p.fullName).trim() && p.role.trim()),
      impact: 'high',
      detail:
        (p.name || p.fullName).trim() && p.role.trim()
          ? `${p.fullName || p.name} · ${p.role}`
          : 'Add your name and engineering role in Profile so Schema.org Person & H1 identify you.',
    },
    {
      id: 'meta-lengths',
      label: 'Optimal SEO Title & Meta Description',
      passed: titleLen >= 25 && titleLen <= 65 && descLen >= 90 && descLen <= 165,
      impact: 'high',
      detail: `Title ${titleLen} chars (30–65 target) · Description ${descLen} chars (110–160 target).`,
    },
    {
      id: 'skills-keywords',
      label: 'Skills & Tech Stack (Schema.org knowsAbout)',
      passed: skills.length >= 3,
      impact: 'high',
      detail:
        skills.length >= 3
          ? `${skills.length} skills indexed (${skills.slice(0, 4).join(', ')}).`
          : 'Add at least 3 technical skills (e.g. TypeScript, React, Node.js) in Profile SEO Settings.',
    },
    {
      id: 'bio-proposition',
      label: 'Clear Bio & Value Proposition',
      passed: bio.length >= 25 || (p.seoDescription || '').trim().length >= 50,
      impact: 'medium',
      detail:
        bio.length >= 25
          ? 'Bio and summary give LLMs natural-language context about what you build.'
          : 'Write a concise bio explaining your specialty and what you build.',
    },
    {
      id: 'featured-projects',
      label: '2+ Featured Projects with Descriptions',
      passed:
        config.links.filter(
          (l) => l.title.trim().length > 0 && l.description.trim().length >= 12
        ).length >= 2,
      impact: 'high',
      detail: `${config.links.length} featured link(s) published in Schema.org ItemList & /llms.txt.`,
    },
    {
      id: 'github-proof',
      label: 'Live GitHub Activity Linked',
      passed: Boolean(p.githubUsername.trim()),
      impact: 'medium',
      detail: p.githubUsername.trim()
        ? `Linked to @${p.githubUsername.trim()} for open-source verification.`
        : 'Connect your GitHub username so AI search associates your code profile.',
    },
    {
      id: 'same-as-authority',
      label: '2+ External Authority Links (sameAs)',
      passed: buildVerifiedSameAsUrls(config).length >= 2,
      impact: 'medium',
      detail: `${buildVerifiedSameAsUrls(config).length} verified external profile URL(s) mapped in Schema.org sameAs.`,
    },
    {
      id: 'contact-channel',
      label: 'Public Hiring / Contact Channel Active',
      passed: Boolean(config.showContactSection || p.email.trim()),
      impact: 'medium',
      detail:
        config.showContactSection || p.email.trim()
          ? 'Visitors and AI assistants can surface direct inquiry & collaboration paths.'
          : 'Enable the Contact form or publish a public email address.',
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);
  const grade: SeoAndGeoAuditResult['grade'] =
    score >= 90 ? 'A+' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';

  return {
    score,
    grade,
    passedCount,
    totalChecks: checks.length,
    checks,
  };
}

export function buildSemanticCrawlerSummaryHtml(
  config: SiteConfigState,
  origin: string
): string {
  const configured = isHubConfigured(config);
  const p = config.profile;
  const displayName = (p.fullName || p.name || '').trim();
  const skills = parseDeveloperSkillsList(config);
  const bio = buildProfilePlainBio(config);

  if (!configured || !displayName) {
    return `<section aria-label="Link Hub Summary"><h1>Link Hub</h1><p>${escapeHtml(
      DEFAULT_PUBLIC_DESCRIPTION
    )}</p><p><a href="${escapeHtml(origin)}/llms.txt">LLMs Context</a></p></section>`;
  }

  const itemsHtml = config.links
    .map(
      (link) =>
        `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.title)}</a> — ${escapeHtml(
          link.description
        )}</li>`
    )
    .join('');

  return [
    '<section aria-label="Developer Profile Summary">',
    `<h1>${escapeHtml(displayName)}${p.role.trim() ? ` — ${escapeHtml(p.role.trim())}` : ''}</h1>`,
    bio ? `<p>${escapeHtml(bio)}</p>` : '',
    skills.length > 0 ? `<p>Skills: ${escapeHtml(skills.join(', '))}</p>` : '',
    itemsHtml ? `<ul>${itemsHtml}</ul>` : '',
    '</section>',
  ]
    .filter(Boolean)
    .join('');
}

export function buildSeoHeadMarkup(
  config: SiteConfigState,
  origin: string,
  route: SeoRouteKey = 'hub'
): string {
  const meta = buildLandingSeoMetadata(config, origin, route);
  const jsonLd = buildStructuredDataJsonLd(config, origin);

  const lines = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    meta.keywords.length > 0
      ? `<meta name="keywords" content="${escapeHtml(meta.keywords.join(', '))}" />`
      : '',
    `<meta name="author" content="${escapeHtml(meta.authorName)}" />`,
    `<meta name="robots" content="${escapeHtml(meta.robots)}" />`,
    `<link rel="icon" type="image/svg+xml" href="${DEFAULT_FAVICON_SVG_PATH}" />`,
    `<link rel="icon" type="image/jpeg" href="${DEFAULT_OG_LOGO_PATH}" />`,
    `<link rel="apple-touch-icon" href="${DEFAULT_OG_LOGO_PATH}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}" />`,
    `<link rel="alternate" type="text/plain" title="LLM Context" href="/llms.txt" />`,
    `<link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml" />`,
    `<meta property="og:type" content="${escapeHtml(meta.ogType)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(meta.siteName)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.canonicalUrl)}" />`,
    `<meta property="og:image" content="${escapeHtml(meta.ogImage)}" />`,
    `<meta property="og:image:secure_url" content="${escapeHtml(meta.ogImage)}" />`,
    `<meta property="og:image:type" content="image/jpeg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${escapeHtml(meta.siteName)} — Brand Logo" />`,
    `<meta name="twitter:card" content="${escapeHtml(meta.twitterCard)}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(meta.ogImage)}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(meta.siteName)} — Brand Logo" />`,
    `<script id="lh-jsonld-schema" type="application/ld+json">${serializeJsonLdSafe(
      jsonLd
    )}</script>`,
  ];

  return lines.filter(Boolean).join('\n    ');
}

export function injectSeoIntoHtml(
  htmlTemplate: string,
  config: SiteConfigState,
  origin: string,
  route: SeoRouteKey = 'hub'
): string {
  const seoHeadBlock = buildSeoHeadMarkup(config, origin, route);
  const noscriptSummary = `<noscript>${buildSemanticCrawlerSummaryHtml(
    config,
    origin
  )}</noscript>`;

  let result = htmlTemplate;
  const startMarker = '<!-- SEO:HEAD:START -->';
  const endMarker = '<!-- SEO:HEAD:END -->';
  const startIdx = result.indexOf(startMarker);
  const endIdx = result.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    result =
      result.slice(0, startIdx + startMarker.length) +
      `\n    ${seoHeadBlock}\n    ` +
      result.slice(endIdx);
  } else {
    result = result.replace('</head>', `    ${seoHeadBlock}\n  </head>`);
  }

  result = result.replace(
    /<div id="root"><\/div>/i,
    `<div id="root"></div>\n    ${noscriptSummary}`
  );

  return result;
}

export function decodeFirestoreRestValue(val: unknown): unknown {
  if (!val || typeof val !== 'object') return undefined;
  const obj = val as Record<string, unknown>;
  if ('stringValue' in obj) return String(obj.stringValue || '');
  if ('booleanValue' in obj) return Boolean(obj.booleanValue);
  if ('integerValue' in obj) return Number(obj.integerValue);
  if ('doubleValue' in obj) return Number(obj.doubleValue);
  if ('nullValue' in obj) return null;
  if ('timestampValue' in obj) return String(obj.timestampValue || '');
  if ('arrayValue' in obj && obj.arrayValue && typeof obj.arrayValue === 'object') {
    const values = (obj.arrayValue as { values?: unknown[] }).values;
    return Array.isArray(values) ? values.map(decodeFirestoreRestValue) : [];
  }
  if ('mapValue' in obj && obj.mapValue && typeof obj.mapValue === 'object') {
    const fields = (obj.mapValue as { fields?: Record<string, unknown> }).fields;
    if (!fields) return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreRestValue(v);
    }
    return out;
  }
  return undefined;
}

export function decodeFirestoreRestDocument(
  docJson: unknown
): Record<string, unknown> | null {
  if (!docJson || typeof docJson !== 'object') return null;
  const fields = (docJson as { fields?: Record<string, unknown> }).fields;
  if (!fields || typeof fields !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeFirestoreRestValue(v);
  }
  return out;
}

export function parseFirestoreRestLink(docJson: unknown): (LinkCardItem & { orderIndex: number; isPublic: boolean }) | null {
  const obj = docJson as { name?: string; fields?: Record<string, unknown> } | null;
  const decoded = decodeFirestoreRestDocument(docJson);
  if (!decoded) return null;
  const nameParts = String(obj?.name || '').split('/');
  const docId = String(decoded.id || nameParts[nameParts.length - 1] || '').trim();
  if (!docId) return null;
  return {
    id: docId,
    title: String(decoded.title || ''),
    url: String(decoded.url || ''),
    displayUrl: String(decoded.displayUrl || ''),
    description: String(decoded.description || ''),
    pinned: Boolean(decoded.pinned),
    category: String(decoded.category || 'project'),
    previewType: (decoded.previewType as LinkCardItem['previewType']) || 'chat',
    thumbnailUrl: decoded.thumbnailUrl ? String(decoded.thumbnailUrl) : '',
    autoThumbnailUrl: decoded.autoThumbnailUrl ? String(decoded.autoThumbnailUrl) : '',
    thumbnailPath: decoded.thumbnailPath ? String(decoded.thumbnailPath) : '',
    galleryUrls: Array.isArray(decoded.galleryUrls)
      ? decoded.galleryUrls.map(String)
      : [],
    clicks: Number(decoded.clicks || 0),
    orderIndex: Number(decoded.orderIndex ?? 999),
    isPublic: decoded.isPublic !== false,
  };
}

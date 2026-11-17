import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SITE_CONFIG, type SiteConfigState } from '../data/profileData';
import {
  auditSeoAndAiDiscoverability,
  buildAiProfileDiscoveryJson,
  buildLandingSeoMetadata,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  buildStructuredDataJsonLd,
  decodeFirestoreRestDocument,
  injectSeoIntoHtml,
  parseDeveloperSkillsList,
  parseFirestoreRestLink,
  resolveOgImageUrl,
  resolvePublicMediaUrl,
  serializeJsonLdSafe,
} from './seoAndGeo';

const CONFIGURED_DEV_HUB: SiteConfigState = {
  ...DEFAULT_SITE_CONFIG,
  profile: {
    ...DEFAULT_SITE_CONFIG.profile,
    name: 'Alex Rivera',
    fullName: 'Alex Rivera',
    handle: '@arivera',
    role: 'Senior Full-Stack Engineer',
    email: 'alex@example.dev',
    githubUsername: 'alexrivera',
    githubProfileUrl: 'https://github.com/alexrivera',
    location: 'Seattle, WA',
    bioPrefix: 'Building resilient ',
    bioCode: 'TypeScript',
    bioMiddle: ' web systems & developer tools at ',
    bioLinkText: 'Rivera Labs',
    bioLinkUrl: 'https://riveralabs.example',
    bioSuffix: '.',
    seoKeywords: 'TypeScript, React, Node.js, Firebase, Distributed Systems',
    availabilityStatus: 'Open to principal engineering roles & advisory',
  },
  socials: [
    {
      id: 'gh',
      label: 'GitHub',
      handle: '@alexrivera',
      url: 'https://github.com/alexrivera',
      platform: 'github',
    },
    {
      id: 'li',
      label: 'LinkedIn',
      handle: 'alexrivera',
      url: 'https://linkedin.com/in/alexrivera',
      platform: 'linkedin',
    },
  ],
  links: [
    {
      id: 'edge-cache',
      title: 'EdgeCache TS',
      url: 'https://edgecache.example.dev',
      displayUrl: 'edgecache.example.dev',
      description: 'Zero-dependency distributed caching SDK for TypeScript runtimes.',
      pinned: true,
      category: 'project',
      previewType: 'chat',
      clicks: 120,
    },
    {
      id: 'dev-bench',
      title: 'DevBench UI',
      url: 'https://devbench.example.dev',
      displayUrl: 'devbench.example.dev',
      description: 'Accessible React component primitives for telemetry dashboards.',
      pinned: false,
      category: 'product',
      previewType: 'linkhub',
      clicks: 64,
    },
  ],
  posts: [
    {
      slug: 'zero-copy-streaming',
      title: 'Zero-Copy Streaming in Node & Web Workers',
      excerpt: 'How to move structured telemetry across threads without GC pauses.',
      date: '2026-10-12',
      readTime: '6 min read',
      category: 'Systems',
      content: ['Transferable ArrayBuffers eliminate serialization bottlenecks.'],
    },
  ],
  showGithubSection: true,
  showContactSection: true,
};

test('buildLandingSeoMetadata formats optimal titles, descriptions, OG type, and noindex on admin route', () => {
  const emptyMeta = buildLandingSeoMetadata(
    DEFAULT_SITE_CONFIG,
    'https://devhub.example',
    'hub'
  );
  assert.equal(emptyMeta.ogType, 'website');
  assert.equal(emptyMeta.canonicalUrl, 'https://devhub.example/RajdeepBhattacharyya-LinkHub');
  assert.equal(emptyMeta.siteName, 'RajdeepBhattacharyya-LinkHub');
  assert.equal(emptyMeta.ogImage, 'https://devhub.example/og-logo.jpg');
  assert.ok(emptyMeta.title.length >= 30 && emptyMeta.title.length <= 65);
  assert.ok(emptyMeta.description.length >= 110 && emptyMeta.description.length <= 160);
  assert.match(emptyMeta.robots, /^index, follow/);

  const devMeta = buildLandingSeoMetadata(
    CONFIGURED_DEV_HUB,
    'https://devhub.example/',
    'hub'
  );
  assert.equal(devMeta.ogType, 'profile');
  assert.equal(devMeta.canonicalUrl, 'https://devhub.example/RajdeepBhattacharyya-LinkHub');
  assert.match(devMeta.title, /Alex Rivera/);
  assert.match(devMeta.description, /Senior Full-Stack Engineer/);
  assert.deepEqual(parseDeveloperSkillsList(CONFIGURED_DEV_HUB), [
    'TypeScript',
    'React',
    'Node.js',
    'Firebase',
    'Distributed Systems',
  ]);

  const adminMeta = buildLandingSeoMetadata(
    CONFIGURED_DEV_HUB,
    'https://devhub.example',
    'admin'
  );
  assert.equal(adminMeta.robots, 'noindex, nofollow');
});

test('buildStructuredDataJsonLd outputs rich Schema.org Person, ProfilePage, ItemList, Blog, and FAQPage graph', () => {
  const emptyLd = buildStructuredDataJsonLd(DEFAULT_SITE_CONFIG, 'https://devhub.example');
  const emptyGraph = emptyLd['@graph'] as Record<string, unknown>[];
  assert.ok(emptyGraph.some((node) => node['@type'] === 'WebApplication'));

  const devLd = buildStructuredDataJsonLd(CONFIGURED_DEV_HUB, 'https://devhub.example');
  const graph = devLd['@graph'] as Record<string, unknown>[];

  const person = graph.find((n) => n['@type'] === 'Person') as Record<string, unknown>;
  assert.ok(person);
  assert.equal(person.name, 'Alex Rivera');
  assert.equal(person.jobTitle, 'Senior Full-Stack Engineer');
  assert.ok(Array.isArray(person.knowsAbout));
  assert.ok((person.knowsAbout as string[]).includes('TypeScript'));
  assert.ok(Array.isArray(person.sameAs));
  assert.ok((person.sameAs as string[]).includes('https://github.com/alexrivera'));

  const itemList = graph.find((n) => n['@type'] === 'ItemList') as Record<string, unknown>;
  assert.equal(itemList.numberOfItems, 2);

  assert.ok(graph.some((n) => n['@type'] === 'Blog'));
  assert.ok(graph.some((n) => n['@type'] === 'FAQPage'));
});

test('GEO endpoints (/llms.txt, /robots.txt, /sitemap.xml, ai-profile.json) welcome AI search crawlers and surface structured developer signals', () => {
  const robots = buildRobotsTxt('https://devhub.example');
  for (const bot of [
    'OAI-SearchBot',
    'GPTBot',
    'ChatGPT-User',
    'ClaudeBot',
    'PerplexityBot',
    'Google-Extended',
    'Applebot-Extended',
  ]) {
    assert.ok(robots.includes(`User-agent: ${bot}`), `Expected robots.txt directive for ${bot}`);
  }
  assert.ok(robots.includes('Sitemap: https://devhub.example/sitemap.xml'));

  const llms = buildLlmsTxt(CONFIGURED_DEV_HUB, 'https://devhub.example', true);
  assert.match(llms, /# Alex Rivera — Senior Full-Stack Engineer/);
  assert.match(llms, /Skills & Tech Stack: TypeScript, React, Node\.js/);
  assert.match(llms, /EdgeCache TS/);
  assert.match(llms, /Zero-Copy Streaming in Node & Web Workers/);

  const sitemap = buildSitemapXml(CONFIGURED_DEV_HUB, 'https://devhub.example', '2026-11-17T06:00:00Z');
  assert.ok(sitemap.includes('<loc>https://devhub.example/</loc>'));
  assert.ok(sitemap.includes('<loc>https://devhub.example/llms.txt</loc>'));
  assert.ok(sitemap.includes('<lastmod>2026-11-17</lastmod>'));

  const aiProfile = buildAiProfileDiscoveryJson(CONFIGURED_DEV_HUB, 'https://devhub.example');
  assert.equal(aiProfile.configured, true);
});

test('injectSeoIntoHtml replaces SEO:HEAD markers safely and escapes script injection in JSON-LD', () => {
  const maliciousConfig: SiteConfigState = {
    ...CONFIGURED_DEV_HUB,
    profile: {
      ...CONFIGURED_DEV_HUB.profile,
      seoTitle: 'Alex </script><script>alert(1)</script> Dev',
    },
  };
  const safeJson = serializeJsonLdSafe({ name: '</script><script>evil()</script>' });
  assert.equal(safeJson.includes('</script>'), false);
  assert.ok(safeJson.includes('\\u003c/script\\u003e'));

  const sampleHtml = [
    '<!doctype html><html><head>',
    '<!-- SEO:HEAD:START --><title>Old</title><!-- SEO:HEAD:END -->',
    '</head><body><div id="root"></div></body></html>',
  ].join('\n');

  const injected = injectSeoIntoHtml(sampleHtml, maliciousConfig, 'https://devhub.example', 'hub');
  assert.equal(injected.includes('<title>Old</title>'), false);
  assert.ok(
    injected.includes('rel="canonical" href="https://devhub.example/RajdeepBhattacharyya-LinkHub"')
  );
  assert.ok(injected.includes('href="/favicon.svg"'));
  assert.ok(injected.includes('content="https://devhub.example/og-logo.jpg"'));
  assert.ok(injected.includes('<noscript><section'));
  assert.ok(injected.includes('EdgeCache TS'));
});

test('auditSeoAndAiDiscoverability scores empty vs configured developer profiles accurately', () => {
  const emptyAudit = auditSeoAndAiDiscoverability(DEFAULT_SITE_CONFIG);
  assert.ok(emptyAudit.score < 50);

  const richAudit = auditSeoAndAiDiscoverability(CONFIGURED_DEV_HUB);
  assert.equal(richAudit.score, 100);
  assert.equal(richAudit.grade, 'A+');
  assert.equal(richAudit.passedCount, richAudit.totalChecks);
});

test('Firestore REST decoders parse /hub/public and /links documents cleanly', () => {
  const decodedHub = decodeFirestoreRestDocument({
    fields: {
      showGithubSection: { booleanValue: true },
      profile: {
        mapValue: {
          fields: {
            name: { stringValue: 'Alex' },
            role: { stringValue: 'Engineer' },
          },
        },
      },
    },
  });
  assert.deepEqual(decodedHub, {
    showGithubSection: true,
    profile: { name: 'Alex', role: 'Engineer' },
  });

  const parsedLink = parseFirestoreRestLink({
    name: 'projects/p/databases/d/documents/links/my-proj',
    fields: {
      title: { stringValue: 'My Project' },
      url: { stringValue: 'https://my.example' },
      orderIndex: { integerValue: '2' },
      clicks: { integerValue: '15' },
      isPublic: { booleanValue: true },
    },
  });
  assert.equal(parsedLink?.id, 'my-proj');
  assert.equal(parsedLink?.orderIndex, 2);
  assert.equal(parsedLink?.clicks, 15);
});

test('resolvePublicMediaUrl and resolveOgImageUrl resolve relative /api/media paths and brand og-logo.jpg', () => {
  assert.equal(
    resolvePublicMediaUrl('/api/media/med-banner-123', 'https://devhub.example'),
    'https://devhub.example/api/media/med-banner-123'
  );
  assert.equal(
    resolvePublicMediaUrl('data:image/png;base64,AAA', 'https://devhub.example'),
    null
  );
  const withCloudMediaBanner: SiteConfigState = {
    ...CONFIGURED_DEV_HUB,
    profile: {
      ...CONFIGURED_DEV_HUB.profile,
      bannerMode: 'image',
      bannerImageUrl: '/api/media/med-banner-999',
      avatarUrl: '/api/media/med-avatar-111',
    },
  };
  assert.equal(
    resolveOgImageUrl(withCloudMediaBanner, 'https://devhub.example'),
    'https://devhub.example/og-logo.jpg'
  );
  const jsonLd = buildStructuredDataJsonLd(withCloudMediaBanner, 'https://devhub.example');
  const person = (jsonLd['@graph'] as Array<Record<string, unknown>>).find(
    (n) => n['@type'] === 'Person'
  );
  assert.equal(person?.image, 'https://devhub.example/api/media/med-avatar-111');
});

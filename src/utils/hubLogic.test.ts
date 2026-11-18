import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateContactSubmission,
  validateUpdateSubscription,
  GITHUB_BROWN_BRONZE_THEME,
  formatContributionDate,
  formatContributionTooltip,
  buildGitHubProfileUrl,
  summarizeGitHubActivities,
  sortAndFilterLinks,
  paginateLinksWithShowAll,
  parseGitHubRepoOrUserInput,
  buildRepoCalendarFromCommitActivity,
  buildRepoCalendarFromCommits,
  groupContributionDaysIntoWeeks,
  formatRepoCommitTooltip,
  normalizeCategoryId,
  formatCategoryFilterLabel,
  extractAvailableCategories,
  calculatePassTilt,
  type LinkCardItem,
} from './hubLogic';
import { isOwnedFirebaseMediaPath } from './mediaAndZip';

test('validateContactSubmission rejects empty required fields and invalid email', () => {
  const emptyResult = validateContactSubmission({ name: '', email: '', message: '' });
  assert.equal(emptyResult.valid, false);
  assert.ok(emptyResult.errors.name);
  assert.ok(emptyResult.errors.email);
  assert.ok(emptyResult.errors.message);

  const badEmailResult = validateContactSubmission({
    name: 'Alex Rivera',
    email: 'not-an-email',
    message: 'Hello there, let us build together!',
  });
  assert.equal(badEmailResult.valid, false);
  assert.equal(badEmailResult.errors.name, undefined);
  assert.ok(badEmailResult.errors.email);
});

test('validateContactSubmission accepts valid input', () => {
  const result = validateContactSubmission({
    name: 'Alex Rivera',
    email: 'alex@example.com',
    message: 'Would love to collaborate on a new design system.',
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test('validateUpdateSubscription validates subscriber email properly', () => {
  assert.equal(validateUpdateSubscription('').valid, false);
  assert.equal(validateUpdateSubscription('bad-email').valid, false);
  assert.equal(validateUpdateSubscription('reader@example.com').valid, true);
});

test('GitHub activity utilities format tooltips, profile URLs, and 5-level Brown/Bronze theme', () => {
  assert.equal(GITHUB_BROWN_BRONZE_THEME.light.length, 5);
  assert.equal(GITHUB_BROWN_BRONZE_THEME.dark.length, 5);
  assert.equal(formatContributionDate('2026-11-16'), 'Nov 16, 2026');
  assert.equal(
    formatContributionTooltip({ date: '2026-11-16', count: 0 }),
    'No contributions on Nov 16, 2026'
  );
  assert.equal(
    formatContributionTooltip({ date: '2026-11-16', count: 1 }),
    '1 contribution on Nov 16, 2026'
  );
  assert.equal(
    formatContributionTooltip({ date: '2026-11-16', count: 7 }),
    '7 contributions on Nov 16, 2026'
  );
  assert.equal(
    buildGitHubProfileUrl('octocat'),
    'https://github.com/octocat'
  );

  const summary = summarizeGitHubActivities([
    { date: '2026-11-14', count: 0, level: 0 },
    { date: '2026-11-15', count: 3, level: 2 },
    { date: '2026-11-16', count: 9, level: 4 },
  ]);
  assert.equal(summary.totalContributions, 12);
  assert.equal(summary.activeDays, 2);
  assert.equal(summary.maxDailyContributions, 9);
});

test('sortAndFilterLinks places pinned items first and filters by category', () => {
  const sampleLinks: LinkCardItem[] = [
    {
      id: '2',
      title: 'Secondary',
      url: 'https://product.example.com',
      displayUrl: 'product.example.com',
      description: 'Desc',
      pinned: false,
      category: 'product',
      previewType: 'linkhub',
      clicks: 10,
    },
    {
      id: '1',
      title: 'Primary Pinned',
      url: 'https://project.example.com',
      displayUrl: 'project.example.com',
      description: 'Desc',
      pinned: true,
      category: 'project',
      previewType: 'chat',
      clicks: 25,
    },
  ];

  const sortedAll = sortAndFilterLinks(sampleLinks, 'all');
  assert.equal(sortedAll[0].id, '1');

  const productOnly = sortAndFilterLinks(sampleLinks, 'product');
  assert.equal(productOnly.length, 1);
  assert.equal(productOnly[0].id, '2');
});

test('calculatePassTilt computes bounded 3D rotation and glare coordinates', () => {
  const center = calculatePassTilt(0, 0, 14);
  assert.equal(center.rotateX, 0);
  assert.equal(center.rotateY, 0);
  assert.equal(center.glareX, 50);
  assert.equal(center.glareY, 50);

  const corner = calculatePassTilt(1, -1, 14);
  assert.equal(corner.rotateY, 14);
  assert.equal(corner.rotateX, 14);
  assert.equal(corner.glareX, 100);
  assert.equal(corner.glareY, 0);
});

import {
  evaluateSubmissionSecurityGuard,
} from './hubLogic';
import {
  evaluateAdminAccessGuard,
  OWNER_ADMIN_EMAIL,
} from '../services/firebase';
import {
  sanitizeFirestoreId,
  sanitizeHttpUrl,
  sanitizeHubPublicData,
  sanitizeLinkPayload,
} from '../services/firebaseHubService';
import {
  buildPortableZipArchive,
  computeCrc32,
} from './mediaAndZip';
import {
  DEFAULT_SITE_CONFIG,
  LEGACY_DEMO_LINK_IDS,
  isHubConfigured,
  isUntouchedLegacyDemoHub,
} from '../data/profileData';

const SAMPLE_LINKS: LinkCardItem[] = [
  {
    id: 'proj-alpha',
    title: 'Project Alpha',
    url: 'https://alpha.example.com',
    displayUrl: 'alpha.example.com',
    description: 'Primary engineering showcase project.',
    pinned: true,
    category: 'project',
    previewType: 'chat',
    clicks: 42,
  },
  {
    id: 'prod-beta',
    title: 'Product Beta',
    url: 'https://beta.example.com',
    displayUrl: 'beta.example.com',
    description: 'Interactive web toolkit.',
    pinned: false,
    category: 'product',
    previewType: 'linkhub',
    clicks: 24,
  },
  {
    id: 'game-gamma',
    title: 'Game Gamma',
    url: 'https://gamma.example.com',
    displayUrl: 'gamma.example.com',
    description: 'Browser board experiment.',
    pinned: false,
    category: 'game',
    previewType: 'chess',
    clicks: 15,
  },
  {
    id: 'proj-delta',
    title: 'Project Delta',
    url: 'https://delta.example.com',
    displayUrl: 'delta.example.com',
    description: 'Developer CLI helper.',
    pinned: false,
    category: 'project',
    previewType: 'flib',
    clicks: 9,
  },
  {
    id: 'prod-epsilon',
    title: 'Product Epsilon',
    url: 'https://epsilon.example.com',
    displayUrl: 'epsilon.example.com',
    description: 'Design token palette kit.',
    pinned: false,
    category: 'product',
    previewType: 'auto',
    clicks: 4,
  },
];

test('DEFAULT_SITE_CONFIG initializes cleanly with zero dummy persona or placeholder content', () => {
  assert.equal(DEFAULT_SITE_CONFIG.profile.name, '');
  assert.equal(DEFAULT_SITE_CONFIG.profile.email, '');
  assert.equal(DEFAULT_SITE_CONFIG.links.length, 0);
  assert.equal(DEFAULT_SITE_CONFIG.socials.length, 0);
  assert.equal(DEFAULT_SITE_CONFIG.posts.length, 0);
  assert.equal(DEFAULT_SITE_CONFIG.featuredSong.platforms.length, 0);
  assert.equal(isHubConfigured(DEFAULT_SITE_CONFIG), false);

  const configuredState = {
    ...DEFAULT_SITE_CONFIG,
    profile: { ...DEFAULT_SITE_CONFIG.profile, name: 'Alex Rivera' },
  };
  assert.equal(isHubConfigured(configuredState), true);
});

test('isUntouchedLegacyDemoHub detects only unmodified legacy seed payloads without blocking real owner edits', () => {
  assert.equal(isUntouchedLegacyDemoHub(null), false);
  assert.equal(isUntouchedLegacyDemoHub(DEFAULT_SITE_CONFIG), false);

  const untouchedLegacy = {
    ...DEFAULT_SITE_CONFIG,
    profile: {
      ...DEFAULT_SITE_CONFIG.profile,
      name: 'Sanyam',
      email: 'lewarends@gmail.com',
      passSerial: 'LHB-2026-0894-SNYM',
    },
  };
  assert.equal(isUntouchedLegacyDemoHub(untouchedLegacy), true);
  assert.equal(LEGACY_DEMO_LINK_IDS.has('sanyam-sh'), true);

  // Any real owner modification turns off legacy seed filtering
  assert.equal(
    isUntouchedLegacyDemoHub({
      ...untouchedLegacy,
      profile: { ...untouchedLegacy.profile, name: 'Alex Rivera' },
    }),
    false
  );
  assert.equal(
    isUntouchedLegacyDemoHub({
      ...untouchedLegacy,
      profile: { ...untouchedLegacy.profile, email: 'owner@example.com' },
    }),
    false
  );
  assert.equal(
    isUntouchedLegacyDemoHub({
      ...untouchedLegacy,
      profile: { ...untouchedLegacy.profile, passSerial: 'OWNER-2026-0001' },
    }),
    false
  );
});

test('evaluateAdminAccessGuard enforces strict single-owner verified email allowlist and UID lock', () => {
  // 1. Unauthenticated -> rejected
  const unauth = evaluateAdminAccessGuard({ user: null });
  assert.equal(unauth.authorized, false);
  assert.equal(unauth.status, 'unauthenticated');

  // 2. Unverified email spoofing -> rejected
  const unverified = evaluateAdminAccessGuard({
    user: { uid: 'uid-1', email: OWNER_ADMIN_EMAIL, emailVerified: false },
  });
  assert.equal(unverified.authorized, false);
  assert.equal(unverified.status, 'unverified_email');

  // 3. Wrong Google account -> rejected
  const intruder = evaluateAdminAccessGuard({
    user: { uid: 'uid-2', email: 'stranger@gmail.com', emailVerified: true },
  });
  assert.equal(intruder.authorized, false);
  assert.equal(intruder.status, 'unauthorized_email');

  // 4. Verified email but mismatched UID lock -> rejected
  const uidMismatch = evaluateAdminAccessGuard({
    user: { uid: 'uid-clone', email: OWNER_ADMIN_EMAIL, emailVerified: true },
    lockedUid: 'uid-original-owner',
  });
  assert.equal(uidMismatch.authorized, false);
  assert.equal(uidMismatch.status, 'uid_lock_mismatch');

  // 5. Verified owner email + matching UID lock -> authorized
  const validOwner = evaluateAdminAccessGuard({
    user: { uid: 'uid-original-owner', email: OWNER_ADMIN_EMAIL.toUpperCase(), emailVerified: true },
    lockedUid: 'uid-original-owner',
  });
  assert.equal(validOwner.authorized, true);
  assert.equal(validOwner.status, 'authorized');
});

test('Firestore payload sanitizers enforce blueprint length limits and safe IDs', () => {
  assert.equal(sanitizeFirestoreId('  bad/id with spaces!!  '), 'bad-id-with-spaces');
  assert.equal(sanitizeHttpUrl('example.dev'), 'https://example.dev');

  const safeHub = sanitizeHubPublicData(DEFAULT_SITE_CONFIG, 'owner-uid-123');
  assert.equal(safeHub.ownerUid, 'owner-uid-123');
  assert.ok(safeHub.socials.length <= 20);
  assert.ok(safeHub.posts.length <= 100);
  assert.ok(safeHub.customCategories.length <= 30);

  const oversizedLink = {
    ...SAMPLE_LINKS[0],
    title: 'X'.repeat(300),
    description: 'D'.repeat(900),
    clicks: -12,
  };
  const safeLink = sanitizeLinkPayload(oversizedLink, 0, 'owner-uid-123');
  assert.equal(safeLink.title.length, 120);
  assert.equal(safeLink.description.length, 500);
  assert.equal(safeLink.clicks, 0);
  assert.equal(safeLink.isPublic, true);
});

test('evaluateSubmissionSecurityGuard blocks honeypot bots, rapid submissions, and rate-limit bursts', () => {
  const now = 1_700_000_000_000;

  // Honeypot filled -> blocked
  const honeypotResult = evaluateSubmissionSecurityGuard({
    honeypotValue: 'http://spam-bot.example',
    mountedAtMs: now - 5000,
    nowMs: now,
    recentSubmissionTimestampsMs: [],
  });
  assert.equal(honeypotResult.allowed, false);

  // Too fast (<900ms) -> blocked
  const fastResult = evaluateSubmissionSecurityGuard({
    honeypotValue: '',
    mountedAtMs: now - 200,
    nowMs: now,
    recentSubmissionTimestampsMs: [],
  });
  assert.equal(fastResult.allowed, false);

  // Rate limit exceeded (3 within last 60s) -> blocked
  const rateLimited = evaluateSubmissionSecurityGuard({
    honeypotValue: '',
    mountedAtMs: now - 4000,
    nowMs: now,
    recentSubmissionTimestampsMs: [now - 35_000, now - 20_000, now - 5_000],
    maxPerMinute: 3,
  });
  assert.equal(rateLimited.allowed, false);

  // Valid human submission -> allowed
  const validHuman = evaluateSubmissionSecurityGuard({
    honeypotValue: '',
    mountedAtMs: now - 4000,
    nowMs: now,
    recentSubmissionTimestampsMs: [now - 45_000],
    maxPerMinute: 3,
  });
  assert.equal(validHuman.allowed, true);
});

test('buildPortableZipArchive generates a valid PKZIP binary with local file header signature', () => {
  const content = new TextEncoder().encode('{"hello":"linkhub"}');
  const crc = computeCrc32(content);
  assert.equal(typeof crc, 'number');

  const zipBytes = buildPortableZipArchive([
    { path: 'public/link-hub-config.json', data: content },
  ]);
  // Verify PK\x03\x04 signature (0x50, 0x4b, 0x03, 0x04)
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);
  assert.equal(zipBytes[2], 0x03);
  assert.equal(zipBytes[3], 0x04);
  assert.ok(zipBytes.byteLength > content.byteLength);
});

import {
  resolvePantoneFromColorCode,
  computeLinkAnalyticsReport,
  auditDeveloperLinkHealth,
  buildUtmTrackingUrl,
  buildDonutChartSlices,
  buildEngagementTrendSeries,
  computeTrendSvgGeometry,
  aggregateUnifiedInboxStats,
  type UnifiedMessageItem,
} from './pantoneAndAnalytics';

test('resolvePantoneFromColorCode matches catalog swatches and generates calibrated Pantone systems for custom hex codes', () => {
  const classicBlue = resolvePantoneFromColorCode('#0F4C81', 'warm-paper', true);
  assert.equal(classicBlue.code, 'PANTONE 19-4052 TCX');
  assert.equal(classicBlue.name, 'Classic Blue');
  assert.equal(classicBlue.designSystem.pantoneCode, 'PANTONE 19-4052 TCX');
  assert.equal(classicBlue.designSystem.canvasBg, '#0F4C81');

  const customForest = resolvePantoneFromColorCode('#1D5E4A', 'tinted-paper', true);
  assert.match(customForest.code, /^PANTONE \d{2}-\d{4} TCX$/);
  assert.equal(customForest.hex, '#1D5E4A');
  assert.equal(customForest.designSystem.harmonyMode, 'tinted-paper');
  assert.equal(customForest.designSystem.textureEnabled, true);
});

test('computeLinkAnalyticsReport ranks links by most clicked and computes real CTR when views are recorded', () => {
  const emptyReport = computeLinkAnalyticsReport([]);
  assert.equal(emptyReport.totalClicks, 0);
  assert.equal(emptyReport.estimatedProfileViews, 0);
  assert.equal(emptyReport.overallCtrPercent, 0);

  const report = computeLinkAnalyticsReport(SAMPLE_LINKS, 200);
  assert.equal(report.totalClicks, 94);
  assert.equal(report.estimatedProfileViews, 200);
  assert.equal(report.overallCtrPercent, 47);
  assert.ok(report.mostClickedLink);
  const topClicks = report.mostClickedLink.link.clicks;
  assert.equal(report.rankedLinks[0].rank, 1);
  assert.equal(report.rankedLinks[0].isTopPerformer, true);
  assert.ok(report.rankedLinks.every((r) => r.link.clicks <= topClicks));
  assert.equal(report.categoryBreakdown.length, 3);
});

test('auditDeveloperLinkHealth and buildUtmTrackingUrl assist developer attribution and link quality', () => {
  const audit = auditDeveloperLinkHealth(SAMPLE_LINKS, {
    ...DEFAULT_SITE_CONFIG.profile,
    name: 'Alex Rivera',
    email: 'alex@example.com',
    githubUsername: 'octocat',
    bioLinkText: 'Portfolio',
    bioLinkUrl: 'https://example.dev',
  });
  assert.equal(audit.totalChecks, 5);
  assert.ok(audit.score >= 80);

  const tagged = buildUtmTrackingUrl({
    baseUrl: 'https://example.dev',
    source: 'linkhub',
    medium: 'bio',
    campaign: 'launch',
  });
  assert.equal(
    tagged,
    'https://example.dev/?utm_source=linkhub&utm_medium=bio&utm_campaign=launch'
  );
});

test('buildDonutChartSlices and 7-day trend geometry aggregate real events accurately', () => {
  const report = computeLinkAnalyticsReport(SAMPLE_LINKS, 180);
  const slices = buildDonutChartSlices(report.rankedLinks, ['#6B4A2E', '#3A2418', '#A88462']);
  assert.equal(slices.length, report.rankedLinks.filter((r) => r.link.clicks > 0).length);
  const percentSum = slices.reduce((sum, s) => sum + s.percent, 0);
  assert.ok(percentSum >= 99 && percentSum <= 101);
  assert.equal(slices[0].strokeDashoffset, 0);

  const emptyTrend = buildEngagementTrendSeries([]);
  assert.equal(emptyTrend.length, 7);
  assert.ok(emptyTrend.every((pt) => pt.clicks === 0 && pt.views === 0));

  const nowMs = Date.UTC(2026, 10, 17, 12, 0, 0);
  const dayMs = 86_400_000;
  const trend = buildEngagementTrendSeries(
    [
      { eventType: 'profile_view', createdAtMs: nowMs },
      { eventType: 'profile_view', createdAtMs: nowMs - dayMs },
      { eventType: 'link_click', createdAtMs: nowMs },
      { eventType: 'link_click', createdAtMs: nowMs - 2 * dayMs },
      { eventType: 'profile_view', createdAtMs: nowMs - 10 * dayMs }, // outside 7d window
    ],
    nowMs
  );
  assert.equal(trend.length, 7);
  assert.equal(trend[6].clicks, 1);
  assert.equal(trend[6].views, 1);
  assert.equal(trend[5].views, 1);
  assert.equal(trend[4].clicks, 1);
  assert.equal(
    trend.reduce((sum, pt) => sum + pt.clicks, 0),
    2
  );

  const geometry = computeTrendSvgGeometry(trend, 540, 180, 36, 22);
  assert.equal(geometry.points.length, 7);
  assert.ok(geometry.clicksLinePath.startsWith('M '));
  assert.ok(geometry.clicksAreaPath.endsWith(' Z'));
  assert.ok(geometry.viewsLinePath.startsWith('M '));
});

test('aggregateUnifiedInboxStats aggregates Work with me, Contact form, and custom messages in one place', () => {
  const sampleMessages: UnifiedMessageItem[] = [
    {
      id: '1',
      name: 'Elena Vance',
      email: 'elena@foundry.design',
      message: 'Let us collaborate on a design sprint',
      source: 'work',
      timestamp: 'Today',
    },
    {
      id: '2',
      name: 'Aarav Mehta',
      email: 'aarav@studio.in',
      message: 'Nice palette!',
      source: 'hub',
      timestamp: 'Today',
    },
    {
      id: '3',
      name: 'Custom Sender',
      email: 'custom@dev.io',
      message: 'Podcast invite',
      source: 'custom',
      timestamp: 'Today',
    },
  ];

  const allSummary = aggregateUnifiedInboxStats(sampleMessages, 'all', '');
  assert.equal(allSummary.counts.all, 3);
  assert.equal(allSummary.counts.work, 1);
  assert.equal(allSummary.counts.hub, 1);
  assert.equal(allSummary.counts.custom, 1);
  assert.equal(allSummary.filtered.length, 3);

  const workOnly = aggregateUnifiedInboxStats(sampleMessages, 'work', '');
  assert.equal(workOnly.filtered.length, 1);
  assert.equal(workOnly.filtered[0].id, '1');

  const searched = aggregateUnifiedInboxStats(sampleMessages, 'all', 'podcast');
  assert.equal(searched.filtered.length, 1);
  assert.equal(searched.filtered[0].id, '3');
});

test('paginateLinksWithShowAll caps visible projects to top 4 until Show all is toggled', () => {
  const collapsed = paginateLinksWithShowAll(SAMPLE_LINKS, false, 4);
  assert.equal(collapsed.visibleLinks.length, 4);
  assert.equal(collapsed.hasMore, true);
  assert.equal(collapsed.hiddenCount, SAMPLE_LINKS.length - 4);

  const expanded = paginateLinksWithShowAll(SAMPLE_LINKS, true, 4);
  assert.equal(expanded.visibleLinks.length, SAMPLE_LINKS.length);
  assert.equal(expanded.hiddenCount, 0);
});

test('parseGitHubRepoOrUserInput extracts owner, repo, and canonical GitHub URL from any format', () => {
  assert.deepEqual(parseGitHubRepoOrUserInput('@octocat'), {
    username: 'octocat',
    repo: '',
    profileUrl: 'https://github.com/octocat',
  });

  assert.deepEqual(parseGitHubRepoOrUserInput('vercel/next.js'), {
    username: 'vercel',
    repo: 'next.js',
    profileUrl: 'https://github.com/vercel/next.js',
  });

  assert.deepEqual(parseGitHubRepoOrUserInput('https://github.com/facebook/react.git'), {
    username: 'facebook',
    repo: 'react',
    profileUrl: 'https://github.com/facebook/react',
  });
});

test('buildRepoCalendarFromCommitActivity, buildRepoCalendarFromCommits, and week grouping normalize repo heatmaps', () => {
  const sampleWeekSec = Math.floor(Date.UTC(2026, 10, 8) / 1000); // Sunday Nov 8, 2026
  const fromStats = buildRepoCalendarFromCommitActivity([
    { total: 10, week: sampleWeekSec, days: [0, 2, 0, 5, 0, 3, 0] },
  ]);
  assert.equal(fromStats.length, 7);
  assert.equal(fromStats[1].count, 2);
  assert.equal(fromStats[3].count, 5);
  assert.equal(fromStats[3].level, 4);
  assert.equal(formatRepoCommitTooltip(fromStats[3]), '5 commits on Nov 11, 2026');
  assert.equal(formatRepoCommitTooltip(fromStats[0]), 'No recent commits on Nov 8, 2026');

  const nowMs = Date.UTC(2026, 10, 16); // Monday Nov 16, 2026
  const fromCommits = buildRepoCalendarFromCommits(
    [
      { commit: { author: { date: '2026-11-16T10:00:00Z' } } },
      { commit: { author: { date: '2026-11-16T14:00:00Z' } } },
      { commit: { committer: { date: '2026-11-15T09:00:00Z' } } },
    ],
    nowMs
  );
  assert.ok(fromCommits.length >= 358 && fromCommits.length <= 364);
  const nov16 = fromCommits.find((d) => d.date === '2026-11-16');
  assert.equal(nov16?.count, 2);
  assert.equal(nov16?.level, 4);

  const weeks = groupContributionDaysIntoWeeks(fromCommits);
  assert.equal(weeks.length, 52);
  assert.ok(weeks.some((w) => w.monthLabel === 'Nov'));
});

test('custom link categories normalize, extract dynamically, filter links, and appear in analytics breakdown', () => {
  assert.equal(normalizeCategoryId('  AI Tools & SaaS! '), 'ai-tools-saas');
  assert.equal(formatCategoryFilterLabel('project'), 'Projects');
  assert.equal(formatCategoryFilterLabel('ai-tools'), 'Ai Tools');

  const customLink: LinkCardItem = {
    id: 'custom-1',
    title: 'Prompt Atlas',
    url: 'https://atlas.dev',
    displayUrl: 'atlas.dev',
    description: 'Curated AI engineering prompts',
    category: 'ai-tools',
    previewType: 'chat',
    clicks: 120,
  };

  const linksWithCustom = [...SAMPLE_LINKS, customLink];
  const categories = extractAvailableCategories(linksWithCustom, ['portfolio']);
  assert.ok(categories.some((c) => c.id === 'project'));
  assert.ok(categories.some((c) => c.id === 'portfolio' && c.isCustom));
  assert.ok(categories.some((c) => c.id === 'ai-tools' && c.label === 'Ai Tools' && c.isCustom));

  const filtered = sortAndFilterLinks(linksWithCustom, 'ai-tools');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'custom-1');

  const analytics = computeLinkAnalyticsReport(linksWithCustom);
  const customSlice = analytics.categoryBreakdown.find((c) => c.category === 'ai-tools');
  assert.ok(customSlice);
  assert.equal(customSlice?.totalClicks, 120);
});

import {
  ADMIN_WORKSPACE_GROUPS,
  getWorkspaceGroupForTab,
  computeWorkspaceGroupBadges,
  addOrRestoreCategoryEntry,
  deleteCategoryFromEntriesAndLinks,
  sanitizeCategoryEntry,
  reorderListItems,
  type AdminTabId,
} from './hubLogic';

test('ADMIN_WORKSPACE_GROUPS cleanly organizes all 10 Admin tabs into 4 mobile-friendly groups', () => {
  assert.equal(ADMIN_WORKSPACE_GROUPS.length, 4);
  const allTabs: AdminTabId[] = [
    'profile',
    'github',
    'links',
    'socials',
    'posts',
    'design',
    'analytics',
    'devtools',
    'messages',
    'security',
  ];

  const mappedTabs = ADMIN_WORKSPACE_GROUPS.flatMap((g) => g.tabs);
  assert.equal(mappedTabs.length, allTabs.length);
  for (const tab of allTabs) {
    assert.ok(mappedTabs.includes(tab), `Expected tab ${tab} in workspace groups`);
    const group = getWorkspaceGroupForTab(tab);
    assert.ok(group.tabs.includes(tab));
  }

  assert.equal(getWorkspaceGroupForTab('links').id, 'content');
  assert.equal(getWorkspaceGroupForTab('design').id, 'appearance');
  assert.equal(getWorkspaceGroupForTab('messages').id, 'insights');
  assert.equal(getWorkspaceGroupForTab('security').id, 'security');

  const badges = computeWorkspaceGroupBadges({
    linksCount: 5,
    messagesCount: 8,
    unreadMessagesCount: 3,
    passkeysCount: 2,
    pantoneCode: 'PANTONE 19-1118 TCX',
  });
  assert.equal(badges.content, 5);
  assert.equal(badges.appearance, 'TCX');
  assert.equal(badges.insights, 3);
  assert.equal(badges.security, 2);
});

test('built-in and custom categories can be deleted, reassign links, keep >=1 category, and be restored', () => {
  // Deleting built-in 'game' hides it from live filter bar and reassigns any 'game' links to remaining category
  const delGame = deleteCategoryFromEntriesAndLinks({
    categoryId: 'game',
    links: SAMPLE_LINKS,
    customCategories: ['ai-tools'],
  });
  assert.equal(delGame.deleted, true);
  assert.equal(delGame.fallbackCategoryId, 'project');
  assert.ok(delGame.reassignedCount >= 1);
  assert.ok(delGame.nextCustomCategories.includes('__hidden__:game'));
  assert.equal(sanitizeCategoryEntry('__hidden__:game'), '__hidden__:game');

  const liveAfterDelete = extractAvailableCategories(
    delGame.nextLinks,
    delGame.nextCustomCategories
  );
  assert.equal(
    liveAfterDelete.some((c) => c.id === 'game'),
    false
  );
  assert.ok(liveAfterDelete.some((c) => c.id === 'project'));
  assert.ok(liveAfterDelete.some((c) => c.id === 'product'));
  assert.ok(liveAfterDelete.some((c) => c.id === 'ai-tools'));

  // Deleting all but one category succeeds, and deleting the final remaining category is blocked
  const delProduct = deleteCategoryFromEntriesAndLinks({
    categoryId: 'product',
    links: delGame.nextLinks,
    customCategories: delGame.nextCustomCategories,
  });
  const delAiTools = deleteCategoryFromEntriesAndLinks({
    categoryId: 'ai-tools',
    links: delProduct.nextLinks,
    customCategories: delProduct.nextCustomCategories,
  });
  const delLastProject = deleteCategoryFromEntriesAndLinks({
    categoryId: 'project',
    links: delAiTools.nextLinks,
    customCategories: delAiTools.nextCustomCategories,
  });
  assert.equal(delLastProject.deleted, false);

  // Typing 'Games' or 'Game' later restores the built-in category
  const restored = addOrRestoreCategoryEntry(delProduct.nextCustomCategories, 'Games');
  assert.equal(restored.categoryId, 'game');
  assert.equal(restored.nextCustomCategories.includes('__hidden__:game'), false);
  const liveAfterRestore = extractAvailableCategories(
    delProduct.nextLinks,
    restored.nextCustomCategories
  );
  assert.ok(liveAfterRestore.some((c) => c.id === 'game'));
});

test('isOwnedFirebaseMediaPath strictly matches solo owner Storage cleanup paths', () => {
  assert.equal(
    isOwnedFirebaseMediaPath(
      'hub-media/ownerUid123/avatar/me-17000000.webp',
      'ownerUid123'
    ),
    true
  );
  assert.equal(
    isOwnedFirebaseMediaPath(
      'hub-media/ownerUid123/thumbnail/shot-17000000.jpg',
      'ownerUid123'
    ),
    true
  );
  // Reject wrong UID, wrong folder, external URLs, and path traversal
  assert.equal(
    isOwnedFirebaseMediaPath(
      'hub-media/attacker999/avatar/me-17000000.webp',
      'ownerUid123'
    ),
    false
  );
  assert.equal(
    isOwnedFirebaseMediaPath('hub-media/ownerUid123/other/file.webp', 'ownerUid123'),
    false
  );
  assert.equal(
    isOwnedFirebaseMediaPath('https://example.com/avatar.png', 'ownerUid123'),
    false
  );
  assert.equal(isOwnedFirebaseMediaPath('', 'ownerUid123'), false);
});

import {
  SOCIAL_PLATFORM_LIST,
  SOCIAL_PLATFORM_META,
  isSocialPlatform,
  normalizeSocialPlatform,
  normalizeSiteConfig,
} from '../data/profileData';

test('expanded social platforms include Devfolio, Threads, Discord, Telegram, and normalize safely', () => {
  const required = [
    'devfolio',
    'instagram',
    'threads',
    'discord',
    'telegram',
    'youtube',
    'kaggle',
    'unstop',
    'website',
  ] as const;

  for (const platform of required) {
    assert.ok(SOCIAL_PLATFORM_LIST.includes(platform), `missing platform ${platform}`);
    assert.equal(isSocialPlatform(platform), true);
    assert.ok(SOCIAL_PLATFORM_META[platform].label.length > 0);
    assert.ok(SOCIAL_PLATFORM_META[platform].urlPlaceholder.startsWith('https://'));
  }

  assert.equal(isSocialPlatform('unknown-network'), false);
  assert.equal(normalizeSocialPlatform('devfolio'), 'devfolio');
  assert.equal(normalizeSocialPlatform('unknown-network'), 'website');

  const normalized = normalizeSiteConfig({
    socials: [
      {
        id: 's-devfolio',
        platform: 'devfolio',
        label: 'Devfolio',
        handle: '@rajdeep',
        url: 'https://devfolio.co/@rajdeep',
      },
      {
        id: 's-legacy',
        platform: 'legacy-unknown' as never,
        label: 'Custom',
        handle: 'site',
        url: 'https://example.com',
      },
    ],
  });

  assert.equal(normalized.socials[0].platform, 'devfolio');
  assert.equal(normalized.socials[1].platform, 'website');
});

test('reorderListItems moves items immutably and guards out-of-bounds indices', () => {
  const original = ['devfolio', 'github', 'threads', 'discord'];
  const movedDown = reorderListItems(original, 0, 2);
  assert.deepEqual(movedDown, ['github', 'threads', 'devfolio', 'discord']);
  assert.deepEqual(original, ['devfolio', 'github', 'threads', 'discord']);

  const movedUp = reorderListItems(movedDown, 3, 1);
  assert.deepEqual(movedUp, ['github', 'discord', 'threads', 'devfolio']);

  assert.deepEqual(reorderListItems(original, 1, 1), original);
  assert.deepEqual(reorderListItems(original, -1, 2), original);
  assert.deepEqual(reorderListItems(original, 0, 99), original);
});

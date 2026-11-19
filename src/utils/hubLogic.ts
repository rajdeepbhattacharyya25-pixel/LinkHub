export interface ContactInput {
  name: string;
  email: string;
  message: string;
  topic?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: {
    name?: string;
    email?: string;
    message?: string;
  };
}

export interface ContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

import type { LinkPreviewType } from './linkPreview';

export interface LinkCardItem {
  id: string;
  title: string;
  url: string;
  displayUrl: string;
  description: string;
  pinned?: boolean;
  category: string;
  previewType: LinkPreviewType;
  thumbnailUrl?: string;
  autoThumbnailUrl?: string;
  thumbnailPath?: string;
  galleryUrls?: string[];
  clicks: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactSubmission(input: ContactInput): ValidationResult {
  const errors: ValidationResult['errors'] = {};
  const trimmedName = input.name.trim();
  const trimmedEmail = input.email.trim();
  const trimmedMessage = input.message.trim();

  if (!trimmedName) {
    errors.name = 'Please enter your full name.';
  } else if (trimmedName.length < 2) {
    errors.name = 'Name must be at least 2 characters.';
  }

  if (!trimmedEmail) {
    errors.email = 'Please enter your email address.';
  } else if (!EMAIL_REGEX.test(trimmedEmail)) {
    errors.email = 'Please enter a valid email address (e.g. name@example.com).';
  }

  if (!trimmedMessage) {
    errors.message = 'Please enter a message before sending.';
  } else if (trimmedMessage.length < 5) {
    errors.message = 'Message must be at least 5 characters.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateUpdateSubscription(email: string): { valid: boolean; error?: string } {
  const trimmed = email.trim();
  if (!trimmed) {
    return { valid: false, error: 'Email address is required.' };
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  return { valid: true };
}

export interface GitHubActivityItem {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface GitHubActivitySummary {
  totalContributions: number;
  activeDays: number;
  maxDailyContributions: number;
}

/**
 * Custom five-level color theme matching the Brown / Bronze / Copper / Champagne design system:
 * Level 0: Soft Warm Ivory (#F5EFE6) - light empty day cell (0 contributions)
 * Level 1: Champagne (#D5C4AE) - light activity
 * Level 2: Warm Copper (#A88462) - moderate activity
 * Level 3: Bronze (#6B4A2E) - high activity
 * Level 4: Deep Brown (#3A2418) - peak activity
 */
export const GITHUB_BROWN_BRONZE_THEME = {
  light: ['#F5EFE6', '#D5C4AE', '#A88462', '#6B4A2E', '#3A2418'],
  dark: ['#F5EFE6', '#D5C4AE', '#A88462', '#6B4A2E', '#3A2418'],
};

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Formats an ISO YYYY-MM-DD date string into a readable label like "Nov 16, 2026"
 * without timezone drift.
 */
export function formatContributionDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) {
    return isoDate;
  }
  const year = Number(parts[0]);
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (
    Number.isNaN(year) ||
    Number.isNaN(monthIdx) ||
    Number.isNaN(day) ||
    monthIdx < 0 ||
    monthIdx > 11
  ) {
    return isoDate;
  }
  return `${SHORT_MONTHS[monthIdx]} ${day}, ${year}`;
}

/**
 * Builds the interactive tooltip text for a single contribution square.
 */
export function formatContributionTooltip(activity: { date: string; count: number }): string {
  const formattedDate = formatContributionDate(activity.date);
  if (activity.count <= 0) {
    return `No contributions on ${formattedDate}`;
  }
  if (activity.count === 1) {
    return `1 contribution on ${formattedDate}`;
  }
  return `${activity.count} contributions on ${formattedDate}`;
}

/**
 * Builds a clean GitHub profile URL from a centralized username string.
 */
export function buildGitHubProfileUrl(username: string): string {
  const clean = username.trim().replace(/^@/, '');
  return `https://github.com/${clean}`;
}

/**
 * Computes summary statistics strictly from actual API contribution entries.
 */
export function summarizeGitHubActivities(
  activities: ReadonlyArray<{ date: string; count: number; level: number }>
): GitHubActivitySummary {
  let totalContributions = 0;
  let activeDays = 0;
  let maxDailyContributions = 0;

  for (const item of activities) {
    const c = typeof item.count === 'number' && item.count > 0 ? item.count : 0;
    totalContributions += c;
    if (c > 0) {
      activeDays += 1;
    }
    if (c > maxDailyContributions) {
      maxDailyContributions = c;
    }
  }

  return {
    totalContributions,
    activeDays,
    maxDailyContributions,
  };
}

export const BUILT_IN_CATEGORIES: ReadonlyArray<{
  id: string;
  label: string;
  singularLabel: string;
}> = [
  { id: 'project', label: 'Projects', singularLabel: 'Project' },
  { id: 'product', label: 'Products', singularLabel: 'Product' },
  { id: 'game', label: 'Games', singularLabel: 'Game' },
];

export const HIDDEN_CATEGORY_PREFIX = '__hidden__:';

export interface CategoryOption {
  id: string;
  label: string;
  singularLabel: string;
  isCustom: boolean;
}

export function normalizeCategoryId(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function sanitizeCategoryEntry(raw: string): string {
  if (typeof raw !== 'string') return '';
  if (raw.startsWith(HIDDEN_CATEGORY_PREFIX)) {
    const hiddenId = normalizeCategoryId(raw.slice(HIDDEN_CATEGORY_PREFIX.length));
    return hiddenId ? `${HIDDEN_CATEGORY_PREFIX}${hiddenId}` : '';
  }
  return normalizeCategoryId(raw);
}

export function encodeHiddenCategory(categoryId: string): string {
  const norm = normalizeCategoryId(categoryId);
  return norm ? `${HIDDEN_CATEGORY_PREFIX}${norm}` : '';
}

export function parseCustomCategoryEntries(
  rawEntries: ReadonlyArray<string> = []
): { activeCustomIds: string[]; hiddenBuiltInIds: Set<string> } {
  const activeSet = new Set<string>();
  const hiddenBuiltInIds = new Set<string>();

  for (const raw of rawEntries) {
    if (typeof raw !== 'string') continue;
    if (raw.startsWith(HIDDEN_CATEGORY_PREFIX)) {
      const hiddenId = normalizeCategoryId(raw.slice(HIDDEN_CATEGORY_PREFIX.length));
      if (hiddenId) hiddenBuiltInIds.add(hiddenId);
      continue;
    }
    const id = normalizeCategoryId(raw);
    if (id && !activeSet.has(id)) {
      activeSet.add(id);
    }
  }

  return {
    activeCustomIds: Array.from(activeSet),
    hiddenBuiltInIds,
  };
}

function resolveCanonicalCategoryId(rawName: string): string {
  const slug = normalizeCategoryId(rawName);
  if (!slug) return '';
  const builtInMatch = BUILT_IN_CATEGORIES.find(
    (b) => b.id === slug || b.label.toLowerCase() === slug
  );
  return builtInMatch ? builtInMatch.id : slug;
}

function toTitleCaseWords(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatCategoryFilterLabel(categoryId: string): string {
  const norm = normalizeCategoryId(categoryId);
  const builtIn = BUILT_IN_CATEGORIES.find((c) => c.id === norm);
  if (builtIn) return builtIn.label;
  if (norm === 'writing') return 'Writing';
  return toTitleCaseWords(norm || 'Custom');
}

export function formatCategorySingularLabel(categoryId: string): string {
  const norm = normalizeCategoryId(categoryId);
  const builtIn = BUILT_IN_CATEGORIES.find((c) => c.id === norm);
  if (builtIn) return builtIn.singularLabel;
  if (norm === 'writing') return 'Writing';
  return toTitleCaseWords(norm || 'Custom');
}

export function extractAvailableCategories(
  links: ReadonlyArray<LinkCardItem>,
  savedCustomCategories: ReadonlyArray<string> = []
): CategoryOption[] {
  const { activeCustomIds, hiddenBuiltInIds } = parseCustomCategoryEntries(
    savedCustomCategories
  );
  const seen = new Set<string>();
  const result: CategoryOption[] = [];

  for (const b of BUILT_IN_CATEGORIES) {
    if (hiddenBuiltInIds.has(b.id)) continue;
    seen.add(b.id);
    result.push({ ...b, isCustom: false });
  }

  for (const id of activeCustomIds) {
    if (!id || seen.has(id) || hiddenBuiltInIds.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      label: formatCategoryFilterLabel(id),
      singularLabel: formatCategorySingularLabel(id),
      isCustom: true,
    });
  }

  for (const item of links) {
    const id = normalizeCategoryId(item.category);
    if (!id || seen.has(id) || hiddenBuiltInIds.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      label: formatCategoryFilterLabel(id),
      singularLabel: formatCategorySingularLabel(id),
      isCustom: true,
    });
  }

  return result;
}

export function addOrRestoreCategoryEntry(
  existingEntries: ReadonlyArray<string>,
  rawName: string
): { categoryId: string | null; nextCustomCategories: string[] } {
  const id = resolveCanonicalCategoryId(rawName);
  if (!id) {
    return {
      categoryId: null,
      nextCustomCategories: [...existingEntries],
    };
  }

  const isBuiltIn = BUILT_IN_CATEGORIES.some((b) => b.id === id);
  const hiddenToken = encodeHiddenCategory(id);
  const cleaned = existingEntries
    .map((entry) => sanitizeCategoryEntry(entry))
    .filter((entry) => entry && entry !== hiddenToken);

  if (!isBuiltIn && !cleaned.includes(id)) {
    cleaned.push(id);
  }

  return {
    categoryId: id,
    nextCustomCategories: cleaned,
  };
}

export function deleteCategoryFromEntriesAndLinks(params: {
  categoryId: string;
  links: ReadonlyArray<LinkCardItem>;
  customCategories?: ReadonlyArray<string>;
}): {
  deleted: boolean;
  reassignedCount: number;
  fallbackCategoryId: string | null;
  nextCustomCategories: string[];
  nextLinks: LinkCardItem[];
} {
  const targetId = normalizeCategoryId(params.categoryId);
  const currentEntries = (params.customCategories || [])
    .map((c) => sanitizeCategoryEntry(c))
    .filter(Boolean);
  const available = extractAvailableCategories(params.links, currentEntries);
  const remaining = available.filter((c) => c.id !== targetId);

  if (!targetId || remaining.length === 0) {
    return {
      deleted: false,
      reassignedCount: 0,
      fallbackCategoryId: null,
      nextCustomCategories: currentEntries,
      nextLinks: [...params.links],
    };
  }

  const fallbackCategoryId = remaining[0].id;
  const isBuiltIn = BUILT_IN_CATEGORIES.some((b) => b.id === targetId);
  const hiddenToken = encodeHiddenCategory(targetId);

  let nextCustomCategories = currentEntries.filter(
    (entry) => entry !== targetId && entry !== hiddenToken
  );
  if (isBuiltIn && hiddenToken && !nextCustomCategories.includes(hiddenToken)) {
    nextCustomCategories = [...nextCustomCategories, hiddenToken];
  }

  let reassignedCount = 0;
  const nextLinks = params.links.map((lnk) => {
    if (normalizeCategoryId(lnk.category) === targetId) {
      reassignedCount += 1;
      return { ...lnk, category: fallbackCategoryId };
    }
    return lnk;
  });

  return {
    deleted: true,
    reassignedCount,
    fallbackCategoryId,
    nextCustomCategories,
    nextLinks,
  };
}

export function sortAndFilterLinks(links: LinkCardItem[], categoryFilter: string = 'all'): LinkCardItem[] {
  const normalizedFilter = normalizeCategoryId(categoryFilter);
  const filtered =
    !normalizedFilter || normalizedFilter === 'all'
      ? [...links]
      : links.filter((item) => normalizeCategoryId(item.category) === normalizedFilter);

  return filtered.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });
}

export interface PaginatedLinksResult {
  visibleLinks: LinkCardItem[];
  hasMore: boolean;
  totalCount: number;
  hiddenCount: number;
}

/**
 * Limits visible links to the top `limit` items (default 4) until `showAll` is toggled on,
 * keeping the Link Hub bento grid clean and uncluttered.
 */
export function paginateLinksWithShowAll(
  links: ReadonlyArray<LinkCardItem>,
  showAll: boolean,
  limit: number = 4
): PaginatedLinksResult {
  const totalCount = links.length;
  const safeLimit = Math.max(1, limit);
  const hasMore = totalCount > safeLimit;
  const visibleLinks = showAll || !hasMore ? [...links] : links.slice(0, safeLimit);
  const hiddenCount = Math.max(0, totalCount - visibleLinks.length);

  return {
    visibleLinks,
    hasMore,
    totalCount,
    hiddenCount,
  };
}

export interface ParsedGitHubSource {
  username: string;
  repo: string;
  profileUrl: string;
}

/**
 * Parses a GitHub username ("@user"), "owner/repo", or full GitHub URL
 * ("https://github.com/owner/repo") into clean owner + optional repository fields.
 */
export function parseGitHubRepoOrUserInput(rawInput: string): ParsedGitHubSource {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return { username: '', repo: '', profileUrl: 'https://github.com/' };
  }

  let pathPart = trimmed
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^(www\.)?github\.com\//i, '')
    .replace(/^@/, '')
    .split(/[?#]/)[0]
    .replace(/^\/+|\/+$/g, '');

  const segments = pathPart.split('/').filter(Boolean);
  const username = (segments[0] || '').replace(/^@/, '').trim();
  const repo = (segments[1] || '').replace(/\.git$/i, '').trim();

  if (!username) {
    return { username: '', repo: '', profileUrl: 'https://github.com/' };
  }

  const profileUrl = repo
    ? `https://github.com/${username}/${repo}`
    : `https://github.com/${username}`;

  return { username, repo, profileUrl };
}

export interface GitHubCommitActivityWeek {
  total: number;
  week: number; // unix timestamp in seconds (Sunday UTC)
  days: number[];
}

function toIsoYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function assignHeatmapLevels(items: { date: string; count: number }[]): ContributionDay[] {
  const maxCount = Math.max(1, ...items.map((i) => i.count));
  return items.map((item) => {
    if (item.count <= 0) return { ...item, level: 0 as const };
    const ratio = item.count / maxCount;
    const level: 1 | 2 | 3 | 4 =
      ratio >= 0.75 ? 4 : ratio >= 0.45 ? 3 : ratio >= 0.2 ? 2 : 1;
    return { ...item, level };
  });
}

/**
 * Converts GitHub's `/repos/{owner}/{repo}/stats/commit_activity` 52-week payload
 * into normalized 364 daily `ContributionDay` records for the heatmap.
 */
export function buildRepoCalendarFromCommitActivity(
  weeks: ReadonlyArray<GitHubCommitActivityWeek>
): ContributionDay[] {
  const raw: { date: string; count: number }[] = [];
  for (const w of weeks) {
    if (!w || typeof w.week !== 'number' || !Array.isArray(w.days)) continue;
    const weekStartMs = w.week * 1000;
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const d = new Date(weekStartMs + dayOffset * 86_400_000);
      const count = Math.max(0, Number(w.days[dayOffset]) || 0);
      raw.push({ date: toIsoYmd(d), count });
    }
  }
  return assignHeatmapLevels(raw);
}

/**
 * Builds a 52-week ContributionDay heatmap from `/repos/{owner}/{repo}/commits`
 * timestamps when GitHub's cached weekly stats endpoint returns 202 Accepted.
 * Aligns column starts to Sunday UTC so rows 0..6 correspond cleanly to Sun..Sat.
 */
export function buildRepoCalendarFromCommits(
  commits: ReadonlyArray<{ commit?: { author?: { date?: string }; committer?: { date?: string } } }>,
  nowMs: number = Date.now()
): ContributionDay[] {
  const countsByDate = new Map<string, number>();
  for (const c of commits) {
    const isoRaw = c?.commit?.author?.date || c?.commit?.committer?.date || '';
    const ymd = isoRaw.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      countsByDate.set(ymd, (countsByDate.get(ymd) || 0) + 1);
    }
  }

  const endDate = new Date(nowMs);
  endDate.setUTCHours(0, 0, 0, 0);
  const endDayOfWeek = endDate.getUTCDay(); // 0 = Sun .. 6 = Sat
  // Start on the Sunday 51 full weeks before the current week's Sunday (358..364 days total)
  const totalDays = 51 * 7 + (endDayOfWeek + 1);
  const raw: { date: string; count: number }[] = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(endDate.getTime() - i * 86_400_000);
    const ymd = toIsoYmd(d);
    raw.push({ date: ymd, count: countsByDate.get(ymd) || 0 });
  }
  return assignHeatmapLevels(raw);
}

export interface HeatmapWeekColumn {
  days: Array<ContributionDay | null>;
  monthLabel?: string;
}

/**
 * Groups flat chronological ContributionDay items into 7-row (Sun..Sat) week columns
 * with non-overlapping 3-letter month headers.
 */
export function groupContributionDaysIntoWeeks(
  days: ReadonlyArray<ContributionDay>
): HeatmapWeekColumn[] {
  if (!days.length) return [];

  const columns: HeatmapWeekColumn[] = [];
  let currentWeek: Array<ContributionDay | null> = Array(7).fill(null);

  for (const day of days) {
    const parts = day.date.split('-');
    const utcDate =
      parts.length === 3
        ? new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
        : new Date(day.date);
    const dow = Number.isNaN(utcDate.getTime()) ? 0 : utcDate.getUTCDay();

    if (dow === 0 && currentWeek.some((cell) => cell !== null)) {
      columns.push({ days: currentWeek });
      currentWeek = Array(7).fill(null);
    }
    currentWeek[dow] = day;
  }

  if (currentWeek.some((cell) => cell !== null)) {
    columns.push({ days: currentWeek });
  }

  let lastLabeledMonth = -1;
  let lastLabelCol = -4;
  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const firstValid = columns[colIdx].days.find((d) => d !== null);
    if (!firstValid) continue;
    const monthNum = Number(firstValid.date.split('-')[1]) - 1;
    if (
      !Number.isNaN(monthNum) &&
      monthNum >= 0 &&
      monthNum <= 11 &&
      monthNum !== lastLabeledMonth &&
      colIdx - lastLabelCol >= 3
    ) {
      columns[colIdx].monthLabel = SHORT_MONTHS[monthNum];
      lastLabeledMonth = monthNum;
      lastLabelCol = colIdx;
    }
  }

  return columns;
}

/**
 * Builds the interactive tooltip text for a single repository commit square.
 */
export function formatRepoCommitTooltip(activity: { date: string; count: number }): string {
  const formattedDate = formatContributionDate(activity.date);
  if (activity.count <= 0) {
    return `No recent commits on ${formattedDate}`;
  }
  if (activity.count === 1) {
    return `1 commit on ${formattedDate}`;
  }
  return `${activity.count} commits on ${formattedDate}`;
}

export function calculatePassTilt(
  normX: number,
  normY: number,
  maxDeg: number = 14
): { rotateX: number; rotateY: number; glareX: number; glareY: number } {
  const clampedX = Math.max(-1, Math.min(1, normX));
  const clampedY = Math.max(-1, Math.min(1, normY));

  const rotateY = Number((clampedX * maxDeg).toFixed(2));
  const rotateX = Number((-clampedY * maxDeg).toFixed(2));
  const glareX = Math.round(((clampedX + 1) / 2) * 100);
  const glareY = Math.round(((clampedY + 1) / 2) * 100);

  return { rotateX, rotateY, glareX, glareY };
}

export interface SpamGuardCheckInput {
  honeypotValue?: string;
  mountedAtMs: number;
  nowMs: number;
  recentSubmissionTimestampsMs: number[];
  maxPerMinute?: number;
  minDwellMs?: number;
}

export interface SpamGuardCheckResult {
  allowed: boolean;
  reason?: string;
}

export function evaluateSubmissionSecurityGuard(
  input: SpamGuardCheckInput
): SpamGuardCheckResult {
  const minDwell = input.minDwellMs ?? 900;
  const maxPerMinute = input.maxPerMinute ?? 5;

  if (input.honeypotValue && input.honeypotValue.trim().length > 0) {
    return {
      allowed: false,
      reason: 'Automated spam submission rejected (honeypot triggered).',
    };
  }

  if (input.nowMs - input.mountedAtMs < minDwell) {
    return {
      allowed: false,
      reason: 'Submission was too fast. Please wait a moment and try again.',
    };
  }

  const oneMinuteAgo = input.nowMs - 60_000;
  const recentCount = input.recentSubmissionTimestampsMs.filter(
    (t) => t >= oneMinuteAgo
  ).length;

  if (recentCount >= maxPerMinute) {
    return {
      allowed: false,
      reason: `Rate limit exceeded (maximum ${maxPerMinute} submissions per minute). Please wait before sending again.`,
    };
  }

  return { allowed: true };
}

export type AdminTabId =
  | 'profile'
  | 'github'
  | 'links'
  | 'socials'
  | 'posts'
  | 'design'
  | 'analytics'
  | 'devtools'
  | 'messages'
  | 'security';

export type AdminWorkspaceGroupId = 'content' | 'appearance' | 'insights' | 'security';

export interface AdminWorkspaceGroupSpec {
  id: AdminWorkspaceGroupId;
  label: string;
  shortLabel: string;
  description: string;
  defaultTab: AdminTabId;
  tabs: AdminTabId[];
}

export const ADMIN_WORKSPACE_GROUPS: ReadonlyArray<AdminWorkspaceGroupSpec> = [
  {
    id: 'content',
    label: 'Content & Profile',
    shortLabel: 'Content',
    description: 'Bio, links, socials, blog posts, and GitHub heatmap',
    defaultTab: 'profile',
    tabs: ['profile', 'links', 'socials', 'posts', 'github'],
  },
  {
    id: 'appearance',
    label: 'Design & Pantone',
    shortLabel: 'Design',
    description: 'System palette swatches, Pantone seeds, and textures',
    defaultTab: 'design',
    tabs: ['design'],
  },
  {
    id: 'insights',
    label: 'Analytics & Inbox',
    shortLabel: 'Insights',
    description: 'Traffic charts, messages, subscribers, and dev health',
    defaultTab: 'analytics',
    tabs: ['analytics', 'messages', 'devtools'],
  },
  {
    id: 'security',
    label: 'Security & Biometrics',
    shortLabel: 'Security',
    description: 'Passkeys, lock screen, JSON export, and reset',
    defaultTab: 'security',
    tabs: ['security'],
  },
];

export function getWorkspaceGroupForTab(tab: AdminTabId): AdminWorkspaceGroupSpec {
  return (
    ADMIN_WORKSPACE_GROUPS.find((group) => group.tabs.includes(tab)) ||
    ADMIN_WORKSPACE_GROUPS[0]
  );
}

export function reorderListItems<T>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number
): T[] {
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function computeWorkspaceGroupBadges(input: {
  linksCount: number;
  messagesCount: number;
  unreadMessagesCount?: number;
  passkeysCount: number;
  pantoneCode?: string;
}): Record<AdminWorkspaceGroupId, string | number | undefined> {
  return {
    content: input.linksCount,
    appearance: input.pantoneCode ? 'TCX' : undefined,
    insights:
      input.unreadMessagesCount && input.unreadMessagesCount > 0
        ? input.unreadMessagesCount
        : input.messagesCount > 0
        ? input.messagesCount
        : undefined,
    security: input.passkeysCount > 0 ? input.passkeysCount : undefined,
  };
}

export interface ParsedSpotifyInfo {
  type: 'track' | 'album' | 'playlist' | 'artist' | 'episode';
  id: string;
  embedUrl: string;
}

export function parseSpotifyUrl(rawUrl: string): ParsedSpotifyInfo | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const embedMatch = trimmed.match(
    /^https?:\/\/open\.spotify\.com\/embed\/(track|album|playlist|artist|episode)\/([a-zA-Z0-9]+)/i
  );
  if (embedMatch) {
    const type = embedMatch[1].toLowerCase() as ParsedSpotifyInfo['type'];
    const id = embedMatch[2];
    return {
      type,
      id,
      embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`,
    };
  }

  const httpMatch = trimmed.match(
    /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z0-9-]+\/)?(track|album|playlist|artist|episode)\/([a-zA-Z0-9]+)/i
  );
  if (httpMatch) {
    const type = httpMatch[1].toLowerCase() as ParsedSpotifyInfo['type'];
    const id = httpMatch[2];
    return {
      type,
      id,
      embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`,
    };
  }

  const uriMatch = trimmed.match(
    /^spotify:(track|album|playlist|artist|episode):([a-zA-Z0-9]+)/i
  );
  if (uriMatch) {
    const type = uriMatch[1].toLowerCase() as ParsedSpotifyInfo['type'];
    const id = uriMatch[2];
    return {
      type,
      id,
      embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`,
    };
  }

  return null;
}

export async function fetchSpotifyMetadata(
  rawUrl: string,
  signal?: AbortSignal
): Promise<{ title?: string; thumbnailUrl?: string } | null> {
  const parsed = parseSpotifyUrl(rawUrl);
  if (!parsed) return null;
  try {
    const canonicalUrl = `https://open.spotify.com/${parsed.type}/${parsed.id}`;
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(canonicalUrl)}`, {
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: unknown; thumbnail_url?: unknown };
    return {
      title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : undefined,
      thumbnailUrl:
        typeof data.thumbnail_url === 'string' && data.thumbnail_url.trim()
          ? data.thumbnail_url.trim()
          : undefined,
    };
  } catch {
    return null;
  }
}



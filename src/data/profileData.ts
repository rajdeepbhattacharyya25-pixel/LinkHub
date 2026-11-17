import type { LinkCardItem } from '../utils/hubLogic';
import { normalizeLinkPreviewType } from '../utils/linkPreview';
import type { PantoneHarmonyMode } from '../utils/pantoneAndAnalytics';

export type SocialPlatform =
  | 'x'
  | 'github'
  | 'medium'
  | 'linkedin'
  | 'stackoverflow'
  | 'instagram'
  | 'spotify'
  | 'soundcloud';

export interface SocialLink {
  id: string;
  label: string;
  handle: string;
  url: string;
  platform: SocialPlatform;
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  category: string;
  content: string[];
}

export interface SongPlatformLink {
  id: string;
  name: 'Spotify' | 'Apple Music' | 'Deezer';
  url: string;
  duration: string;
}

export interface FeaturedSongConfig {
  type: string;
  title: string;
  artist: string;
  bpm: number;
  keySignature: string;
  platforms: SongPlatformLink[];
}

export interface ProfileConfig {
  name: string;
  fullName: string;
  handle: string;
  role: string;
  email: string;
  bannerMode?: 'svg' | 'image';
  bannerText: string;
  bannerImageUrl?: string;
  bannerImagePath?: string;
  avatarUrl: string;
  avatarPath?: string;
  githubUsername: string;
  githubRepo?: string;
  githubProfileUrl: string;
  githubSectionTitle: string;
  githubSectionSubtitle: string;
  location: string;
  mapLabel: string;
  coordinates: string;
  googleMapsUrl?: string;
  mapLat?: number | null;
  mapLng?: number | null;
  mapPlaceId?: string;
  mapZoom?: number;
  passSerial: string;
  bioPrefix: string;
  bioCode: string;
  bioMiddle: string;
  bioLinkText: string;
  bioLinkUrl: string;
  bioSuffix: string;
  buyMeACoffeeUrl?: string;
  buyMeACoffeeLabel?: string;
  staticContactActionUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  availabilityStatus?: string;
}

/**
 * Private administrative settings (stored in `public.link_hub_admin_settings` in Supabase Mode,
 * strictly separated from public profile data and unreadable by `anon`).
 */
export interface PrivateAdminSettings {
  notificationEmail: string;
  captchaEnabled: boolean;
  captchaProvider: 'turnstile' | 'hcaptcha';
  captchaSiteKey: string;
  rateLimitMessagesPerMin: number;
  rateLimitAnalyticsPerMin: number;
  privacyConsentRequired: boolean;
}

export const DEFAULT_PRIVATE_ADMIN_SETTINGS: PrivateAdminSettings = {
  notificationEmail: '',
  captchaEnabled: false,
  captchaProvider: 'turnstile',
  captchaSiteKey: '',
  rateLimitMessagesPerMin: 5,
  rateLimitAnalyticsPerMin: 60,
  privacyConsentRequired: false,
};

export interface DesignSystemConfig {
  name: string;
  version: string;
  pantoneCode?: string;
  pantoneName?: string;
  customSeedHex?: string;
  harmonyMode?: PantoneHarmonyMode;
  canvasBg: string;
  cardBg: string;
  innerCardBg: string;
  primaryText: string;
  secondarySurface: string;
  accentPrimary: string;
  accentSecondary: string;
  borderColor: string;
  neutralDetail: string;
  textureEnabled: boolean;
  fontSans: string;
  fontMono: string;
}

export interface ColorSwatchSpec {
  name: string;
  hex: string;
  role: string;
  pantoneCode?: string;
}

/**
 * SAVED DEFAULT SYSTEM DESIGN (PANTONE 19-1118 TCX · Espresso Truffle & Champagne Paper)
 */
export const SAVED_DESIGN_SYSTEM: DesignSystemConfig = {
  name: 'PANTONE 19-1118 TCX · Espresso Truffle & Champagne (Default)',
  version: '3.0-PANTONE',
  pantoneCode: 'PANTONE 19-1118 TCX',
  pantoneName: 'Espresso Truffle & Champagne (Default)',
  customSeedHex: '#4A3324',
  harmonyMode: 'warm-paper',
  canvasBg: '#4A3324',
  cardBg: '#F4EDE2',
  innerCardBg: '#FAF6F0',
  primaryText: '#1A120E',
  secondarySurface: '#3A2418',
  accentPrimary: '#6B4A2E',
  accentSecondary: '#A88462',
  borderColor: '#D5C4AE',
  neutralDetail: '#4A4A46',
  textureEnabled: true,
  fontSans: 'Manrope',
  fontMono: 'IBM Plex Mono',
};

export const CURATED_THEME_PRESETS: DesignSystemConfig[] = [
  SAVED_DESIGN_SYSTEM,
  {
    name: 'PANTONE 17-1230 TCX · Mocha Mousse Studio',
    version: '3.0-PANTONE',
    pantoneCode: 'PANTONE 17-1230 TCX',
    pantoneName: 'Mocha Mousse',
    customSeedHex: '#6E4B3A',
    harmonyMode: 'warm-paper',
    canvasBg: '#6E4B3A',
    cardBg: '#F5EDE6',
    innerCardBg: '#FAF7F4',
    primaryText: '#1C130E',
    secondarySurface: '#452E23',
    accentPrimary: '#7D5440',
    accentSecondary: '#A47864',
    borderColor: '#D9C6B8',
    neutralDetail: '#4E4743',
    textureEnabled: true,
    fontSans: 'Manrope',
    fontMono: 'IBM Plex Mono',
  },
  {
    name: 'PANTONE 19-4052 TCX · Classic Blue Monograph',
    version: '3.0-PANTONE',
    pantoneCode: 'PANTONE 19-4052 TCX',
    pantoneName: 'Classic Blue',
    customSeedHex: '#0F4C81',
    harmonyMode: 'warm-paper',
    canvasBg: '#0F4C81',
    cardBg: '#F0F4F8',
    innerCardBg: '#F8FAFC',
    primaryText: '#0D1B2A',
    secondarySurface: '#133252',
    accentPrimary: '#1D5B96',
    accentSecondary: '#4982B8',
    borderColor: '#C5D5E6',
    neutralDetail: '#3E4C59',
    textureEnabled: true,
    fontSans: 'Manrope',
    fontMono: 'IBM Plex Mono',
  },
];

export const SAVED_SYSTEM_SWATCHES: ColorSwatchSpec[] = [
  {
    name: 'Textured Bronze Canvas',
    hex: '#4A3324',
    role: 'Textured studio backdrop',
    pantoneCode: 'PANTONE 19-1118 TCX',
  },
  {
    name: 'Champagne Cotton Paper',
    hex: '#F4EDE2',
    role: 'Primary hub card surface',
    pantoneCode: 'PANTONE 11-0107 TCX',
  },
  {
    name: 'Alabaster Ivory',
    hex: '#FAF6F0',
    role: 'Inner bento cards & inputs',
    pantoneCode: 'PANTONE 11-0602 TCX',
  },
  {
    name: 'Champagne Hairline',
    hex: '#D5C4AE',
    role: 'Card borders & dividers',
    pantoneCode: 'PANTONE 14-1108 TCX',
  },
  {
    name: 'Warm Copper',
    hex: '#A88462',
    role: 'Interactive accents & midtones',
    pantoneCode: 'PANTONE 16-1328 TCX',
  },
  {
    name: 'Rich Bronze',
    hex: '#6B4A2E',
    role: 'Secondary labels & highlights',
    pantoneCode: 'PANTONE 18-1137 TCX',
  },
  {
    name: 'Deep Brown',
    hex: '#3A2418',
    role: 'Badges, pass surface & active pills',
    pantoneCode: 'PANTONE 19-1220 TCX',
  },
  {
    name: 'Dark Espresso',
    hex: '#1A120E',
    role: 'Primary headings, ink & CTAs',
    pantoneCode: 'PANTONE 19-0812 TCX',
  },
];

export const DEFAULT_AVATAR_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#A88462"/>
      <stop offset="55%" stop-color="#6B4A2E"/>
      <stop offset="100%" stop-color="#3A2418"/>
    </linearGradient>
  </defs>
  <rect width="160" height="160" fill="url(#bg)"/>
  <circle cx="80" cy="80" r="62" fill="none" stroke="#FAF6F0" stroke-opacity="0.18" stroke-width="1.5"/>
  <circle cx="80" cy="62" r="21" fill="#FAF6F0" fill-opacity="0.88"/>
  <path d="M36 142 C40 108, 60 96, 80 96 C100 96, 120 108, 124 142 Z" fill="#FAF6F0" fill-opacity="0.88"/>
</svg>
`)}`;

export const INITIAL_PROFILE: ProfileConfig = {
  name: '',
  fullName: '',
  handle: '',
  role: '',
  email: '',
  bannerMode: 'svg',
  bannerText: '',
  bannerImageUrl: '',
  bannerImagePath: '',
  avatarUrl: DEFAULT_AVATAR_DATA_URI,
  avatarPath: '',
  githubUsername: '',
  githubRepo: '',
  githubProfileUrl: '',
  githubSectionTitle: 'DEVELOPMENT ACTIVITY',
  githubSectionSubtitle: 'Live GitHub contributions and repository activity.',
  location: '',
  mapLabel: '',
  coordinates: '',
  googleMapsUrl: '',
  mapLat: null,
  mapLng: null,
  mapPlaceId: '',
  mapZoom: 13,
  passSerial: '',
  bioPrefix: '',
  bioCode: '',
  bioMiddle: '',
  bioLinkText: '',
  bioLinkUrl: '',
  bioSuffix: '',
  buyMeACoffeeUrl: '',
  buyMeACoffeeLabel: 'Buy me a coffee',
  staticContactActionUrl: '',
  seoTitle: '',
  seoDescription: '',
  seoKeywords: '',
  availabilityStatus: '',
};

export const SOCIAL_LINKS: SocialLink[] = [];

export const INITIAL_LINKS: LinkCardItem[] = [];

export const FEATURED_SONG: FeaturedSongConfig = {
  type: 'Song',
  title: '',
  artist: '',
  bpm: 0,
  keySignature: '',
  platforms: [],
};

export const BLOG_POSTS: BlogPost[] = [];

export interface SiteConfigState {
  profile: ProfileConfig;
  socials: SocialLink[];
  links: LinkCardItem[];
  customCategories?: string[];
  featuredSong: FeaturedSongConfig;
  posts: BlogPost[];
  designSystem: DesignSystemConfig;
  showGithubSection: boolean;
  showSongCard: boolean;
  showMapCard: boolean;
  showContactSection: boolean;
}

export const DEFAULT_SITE_CONFIG: SiteConfigState = {
  profile: INITIAL_PROFILE,
  socials: SOCIAL_LINKS,
  links: INITIAL_LINKS,
  customCategories: [],
  featuredSong: FEATURED_SONG,
  posts: BLOG_POSTS,
  designSystem: SAVED_DESIGN_SYSTEM,
  showGithubSection: false,
  showSongCard: false,
  showMapCard: false,
  showContactSection: true,
};

export const SITE_CONFIG_STORAGE_KEY = 'link_hub_saved_site_config_v4';

export function isHubConfigured(config: SiteConfigState): boolean {
  const p = config.profile;
  return Boolean(
    p.name.trim() ||
      p.fullName.trim() ||
      p.role.trim() ||
      p.bioPrefix.trim() ||
      p.bioCode.trim() ||
      p.bioMiddle.trim() ||
      p.bioLinkText.trim() ||
      p.bioSuffix.trim() ||
      config.links.length > 0 ||
      config.socials.length > 0 ||
      config.posts.length > 0
  );
}

export function normalizeSiteConfig(parsed: Partial<SiteConfigState>): SiteConfigState {
  const mergedProfile = { ...DEFAULT_SITE_CONFIG.profile, ...(parsed.profile || {}) };
  if (!mergedProfile.avatarUrl) {
    mergedProfile.avatarUrl = DEFAULT_AVATAR_DATA_URI;
  }

  const rawLinks = Array.isArray(parsed.links) ? parsed.links : DEFAULT_SITE_CONFIG.links;
  const cleanLinks: LinkCardItem[] = rawLinks.map((lnk) => {
    const previewType = normalizeLinkPreviewType(lnk.previewType, 'chat');
    return {
      ...lnk,
      previewType,
      autoThumbnailUrl: lnk.autoThumbnailUrl ? String(lnk.autoThumbnailUrl) : '',
      title: String(lnk.title || ''),
      url: String(lnk.url || ''),
      displayUrl: String(lnk.displayUrl || ''),
    };
  });

  const parsedSong = parsed.featuredSong;
  const mergedSong: FeaturedSongConfig = {
    ...DEFAULT_SITE_CONFIG.featuredSong,
    ...(parsedSong || {}),
    platforms: Array.isArray(parsedSong?.platforms) ? parsedSong.platforms : [],
  };

  return {
    ...DEFAULT_SITE_CONFIG,
    ...parsed,
    profile: mergedProfile,
    designSystem: { ...DEFAULT_SITE_CONFIG.designSystem, ...(parsed.designSystem || {}) },
    featuredSong: mergedSong,
    socials: Array.isArray(parsed.socials) ? parsed.socials : DEFAULT_SITE_CONFIG.socials,
    links: cleanLinks,
    customCategories: Array.isArray(parsed.customCategories)
      ? parsed.customCategories
      : DEFAULT_SITE_CONFIG.customCategories,
    posts: Array.isArray(parsed.posts) ? parsed.posts : DEFAULT_SITE_CONFIG.posts,
  };
}

export const LEGACY_DEMO_LINK_IDS = new Set([
  'sanyam-sh',
  'link-hub-studio',
  'flib-store',
  'sixtyfour-chess',
  'clyp-snippets',
  'paperline-pantone-ui',
]);

export function isUntouchedLegacyDemoHub(
  docData: Partial<SiteConfigState> | null | undefined
): boolean {
  if (!docData || !docData.profile) return false;
  const p = docData.profile;
  return (
    String(p.name || '').trim() === 'Sanyam' &&
    String(p.email || '').trim().toLowerCase() === 'lewarends@gmail.com' &&
    String(p.passSerial || '').trim() === 'LHB-2026-0894-SNYM'
  );
}

export function loadSavedSiteConfig(): SiteConfigState {
  if (typeof window === 'undefined') {
    return DEFAULT_SITE_CONFIG;
  }
  try {
    const raw = window.localStorage.getItem(SITE_CONFIG_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(DEFAULT_SITE_CONFIG));
      return DEFAULT_SITE_CONFIG;
    }
    const parsed = JSON.parse(raw) as Partial<SiteConfigState>;
    if (isUntouchedLegacyDemoHub(parsed)) {
      window.localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(DEFAULT_SITE_CONFIG));
      return DEFAULT_SITE_CONFIG;
    }
    return normalizeSiteConfig(parsed);
  } catch {
    return DEFAULT_SITE_CONFIG;
  }
}

export function saveSiteConfigToStorage(config: SiteConfigState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage quota errors
  }
}

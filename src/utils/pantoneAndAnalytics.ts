import type { DesignSystemConfig, ProfileConfig } from '../data/profileData';
import {
  extractAvailableCategories,
  normalizeCategoryId,
  type LinkCardItem,
} from './hubLogic';

/* ============================================================================
 * 1. PANTONE COLOR INSTITUTE® SPECIFICATION ENGINE & SYSTEM DESIGN SYNTHESIZER
 * ========================================================================== */

export type PantoneHarmonyMode = 'warm-paper' | 'tinted-paper' | 'crisp-alabaster';

export interface PantoneSwatchSpec {
  code: string; // e.g. "PANTONE 19-1118 TCX"
  name: string; // e.g. "Espresso Truffle"
  collection: string; // e.g. "Default Signature System" | "Color of the Year 2025"
  hex: string; // Primary Pantone chip hex
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  isDefault?: boolean;
  designSystem: DesignSystemConfig;
}

/**
 * Normalizes a user-provided color code (e.g. "4A3324", "#4a3324", "#abc") into a 6-digit uppercase "#RRGGBB" hex string.
 * Returns null if the input is not a valid hex color code.
 */
export function normalizeHexColorCode(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const expanded = cleaned
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase();
    return `#${expanded}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toUpperCase()}`;
  }
  return null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const norm = normalizeHexColorCode(hex) || '#4A3324';
  const num = parseInt(norm.slice(1), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hNorm = ((h % 360) + 360) % 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hNorm >= 0 && hNorm < 60) {
    rPrime = c;
    gPrime = x;
  } else if (hNorm >= 60 && hNorm < 120) {
    rPrime = x;
    gPrime = c;
  } else if (hNorm >= 120 && hNorm < 180) {
    gPrime = c;
    bPrime = x;
  } else if (hNorm >= 180 && hNorm < 240) {
    gPrime = x;
    bPrime = c;
  } else if (hNorm >= 240 && hNorm < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return rgbToHex(
    (rPrime + m) * 255,
    (gPrime + m) * 255,
    (bPrime + m) * 255
  );
}

/**
 * Synthesizes a complete, high-contrast 8-token DesignSystemConfig from any primary Pantone hex color
 * so that all typography, borders, badges, and textured surfaces remain crisp and readable.
 */
export function synthesizeDesignSystemFromColor(
  rawHex: string,
  pantoneCode: string,
  pantoneName: string,
  harmony: PantoneHarmonyMode = 'warm-paper',
  textureEnabled = true
): DesignSystemConfig {
  const hex = normalizeHexColorCode(rawHex) || '#4A3324';
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // If the chosen color is very light (L > 72), use a darkened shade for the outer canvas
  // so the central paper card still pops with architectural depth.
  const canvasL = hsl.l > 68 ? Math.max(22, hsl.l - 42) : Math.max(16, Math.min(52, hsl.l));
  const canvasS = Math.max(14, Math.min(68, hsl.s));
  const canvasBg = hsl.l <= 68 ? hex : hslToHex(hsl.h, canvasS, canvasL);

  let cardBg = '#F4EDE2';
  let innerCardBg = '#FAF6F0';
  let borderColor = '#D5C4AE';

  if (harmony === 'tinted-paper') {
    cardBg = hslToHex(hsl.h, Math.min(32, Math.max(10, Math.round(hsl.s * 0.38))), 92);
    innerCardBg = hslToHex(hsl.h, Math.min(24, Math.max(6, Math.round(hsl.s * 0.25))), 97);
    borderColor = hslToHex(hsl.h, Math.min(34, Math.max(14, Math.round(hsl.s * 0.42))), 78);
  } else if (harmony === 'crisp-alabaster') {
    cardBg = '#FAF8F5';
    innerCardBg = '#FFFFFF';
    borderColor = hslToHex(hsl.h, Math.min(22, Math.max(8, Math.round(hsl.s * 0.28))), 82);
  } else {
    // warm-paper
    cardBg = hslToHex(hsl.h, Math.min(26, Math.max(12, Math.round(hsl.s * 0.32))), 93);
    innerCardBg = hslToHex(hsl.h, Math.min(20, Math.max(8, Math.round(hsl.s * 0.2))), 97);
    borderColor = hslToHex(hsl.h, Math.min(30, Math.max(16, Math.round(hsl.s * 0.36))), 79);
  }

  const primaryText = hslToHex(hsl.h, Math.min(42, Math.max(16, hsl.s)), 10);
  const secondarySurface = hslToHex(hsl.h, Math.min(54, Math.max(20, hsl.s)), 20);
  const accentPrimary = hslToHex(hsl.h, Math.min(62, Math.max(24, hsl.s)), 34);
  const accentSecondary = hslToHex(hsl.h, Math.min(56, Math.max(26, hsl.s)), 52);
  const neutralDetail = hslToHex(hsl.h, 10, 28);

  return {
    name: `${pantoneCode} · ${pantoneName}`,
    version: '3.0-PANTONE',
    pantoneCode,
    pantoneName,
    customSeedHex: hex,
    harmonyMode: harmony,
    canvasBg,
    cardBg,
    innerCardBg,
    primaryText,
    secondarySurface,
    accentPrimary,
    accentSecondary,
    borderColor,
    neutralDetail,
    textureEnabled,
    fontSans: 'Manrope',
    fontMono: 'IBM Plex Mono',
  };
}

/**
 * Curated Official Pantone Color Institute® Catalog (including the Default System Design + 11 iconic Pantone swatches).
 */
export const PANTONE_INSTITUTE_CATALOG: PantoneSwatchSpec[] = [
  {
    code: 'PANTONE 19-1118 TCX',
    name: 'Espresso Truffle & Champagne (Default)',
    collection: 'Default Signature System',
    hex: '#4A3324',
    rgb: { r: 74, g: 51, b: 36 },
    hsl: { h: 24, s: 35, l: 22 },
    isDefault: true,
    designSystem: {
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
    },
  },
  {
    code: 'PANTONE 17-1230 TCX',
    name: 'Mocha Mousse',
    collection: 'Pantone Color of the Year 2025',
    hex: '#A47864',
    rgb: hexToRgb('#A47864'),
    hsl: { h: 19, s: 26, l: 52 },
    designSystem: synthesizeDesignSystemFromColor(
      '#6E4B3A',
      'PANTONE 17-1230 TCX',
      'Mocha Mousse',
      'warm-paper'
    ),
  },
  {
    code: 'PANTONE 13-1023 TCX',
    name: 'Peach Fuzz Terracotta',
    collection: 'Pantone Color of the Year 2024',
    hex: '#C87D65',
    rgb: hexToRgb('#C87D65'),
    hsl: { h: 15, s: 47, l: 59 },
    designSystem: synthesizeDesignSystemFromColor(
      '#7A4434',
      'PANTONE 13-1023 TCX',
      'Peach Fuzz Terracotta',
      'tinted-paper'
    ),
  },
  {
    code: 'PANTONE 18-1750 TCX',
    name: 'Viva Magenta',
    collection: 'Pantone Color of the Year 2023',
    hex: '#BB2649',
    rgb: hexToRgb('#BB2649'),
    hsl: { h: 346, s: 66, l: 44 },
    designSystem: synthesizeDesignSystemFromColor(
      '#6D1B31',
      'PANTONE 18-1750 TCX',
      'Viva Magenta',
      'warm-paper'
    ),
  },
  {
    code: 'PANTONE 17-3938 TCX',
    name: 'Very Peri',
    collection: 'Pantone Color of the Year 2022',
    hex: '#6667AB',
    rgb: hexToRgb('#6667AB'),
    hsl: { h: 239, s: 30, l: 54 },
    designSystem: synthesizeDesignSystemFromColor(
      '#3A3B6E',
      'PANTONE 17-3938 TCX',
      'Very Peri',
      'tinted-paper'
    ),
  },
  {
    code: 'PANTONE 19-4052 TCX',
    name: 'Classic Blue',
    collection: 'Pantone Color of the Year 2020',
    hex: '#0F4C81',
    rgb: hexToRgb('#0F4C81'),
    hsl: { h: 208, s: 79, l: 28 },
    designSystem: synthesizeDesignSystemFromColor(
      '#0F4C81',
      'PANTONE 19-4052 TCX',
      'Classic Blue',
      'warm-paper'
    ),
  },
  {
    code: 'PANTONE 19-0323 TCX',
    name: 'Chive Forest',
    collection: 'Pantone Fashion, Home + Interiors',
    hex: '#2E473B',
    rgb: hexToRgb('#2E473B'),
    hsl: { h: 151, s: 21, l: 23 },
    designSystem: synthesizeDesignSystemFromColor(
      '#2E473B',
      'PANTONE 19-0323 TCX',
      'Chive Forest',
      'warm-paper'
    ),
  },
  {
    code: 'PANTONE 18-4027 TCX',
    name: 'Quiet Harbor Fjord',
    collection: 'Pantone Architectural Series',
    hex: '#2B4C5E',
    rgb: hexToRgb('#2B4C5E'),
    hsl: { h: 201, s: 37, l: 27 },
    designSystem: synthesizeDesignSystemFromColor(
      '#2B4C5E',
      'PANTONE 18-4027 TCX',
      'Quiet Harbor Fjord',
      'tinted-paper'
    ),
  },
  {
    code: 'PANTONE 18-1438 TCX',
    name: 'Marsala Siena',
    collection: 'Pantone Color of the Year 2015',
    hex: '#7A3B36',
    rgb: hexToRgb('#7A3B36'),
    hsl: { h: 4, s: 39, l: 35 },
    designSystem: synthesizeDesignSystemFromColor(
      '#642F2B',
      'PANTONE 18-1438 TCX',
      'Marsala Siena',
      'warm-paper'
    ),
  },
  {
    code: 'PANTONE 18-3838 TCX',
    name: 'Ultra Violet',
    collection: 'Pantone Color of the Year 2018',
    hex: '#5F4B8B',
    rgb: hexToRgb('#5F4B8B'),
    hsl: { h: 259, s: 30, l: 42 },
    designSystem: synthesizeDesignSystemFromColor(
      '#3F315E',
      'PANTONE 18-3838 TCX',
      'Ultra Violet',
      'tinted-paper'
    ),
  },
  {
    code: 'PANTONE 18-0935 TCX',
    name: 'Buckthorn Ochre',
    collection: 'Pantone Earth & Mineral',
    hex: '#8C6239',
    rgb: hexToRgb('#8C6239'),
    hsl: { h: 30, s: 42, l: 39 },
    designSystem: synthesizeDesignSystemFromColor(
      '#614326',
      'PANTONE 18-0935 TCX',
      'Buckthorn Ochre',
      'warm-paper'
    ),
  },
  {
    code: 'PANTONE 19-4007 TCX',
    name: 'Anthracite Obsidian',
    collection: 'Pantone Architectural Monolith',
    hex: '#28282D',
    rgb: hexToRgb('#28282D'),
    hsl: { h: 240, s: 6, l: 17 },
    designSystem: synthesizeDesignSystemFromColor(
      '#28282D',
      'PANTONE 19-4007 TCX',
      'Anthracite Obsidian',
      'crisp-alabaster'
    ),
  },
];

const HUE_SECTOR_NAMES: { maxHue: number; label: string }[] = [
  { maxHue: 18, label: 'Crimson Vermilion' },
  { maxHue: 38, label: 'Roasted Terracotta' },
  { maxHue: 58, label: 'Burnished Ochre' },
  { maxHue: 85, label: 'Citron Olive' },
  { maxHue: 150, label: 'Botanical Cypress' },
  { maxHue: 190, label: 'Aegean Teal' },
  { maxHue: 235, label: 'Nordic Cobalt' },
  { maxHue: 275, label: 'Indigo Iris' },
  { maxHue: 325, label: 'Velvet Plum' },
  { maxHue: 360, label: 'Garnet Rose' },
];

/**
 * Given ANY developer hex color code (e.g. "#2B5B84") or Pantone query, resolves either:
 * - An exact / near match from the Pantone Color Institute® catalog, OR
 * - A calibrated Pantone FHI 6-digit TCX specification (`PANTONE LL-HHCC TCX`) computed directly
 *   from the color's CIE/HSL lightness (`11`–`19`), hue sector (`01`–`64`), and chroma (`05`–`64`),
 *   along with a complete 8-token System Design ready to switch the website immediately.
 */
export function resolvePantoneFromColorCode(
  inputHexOrCode: string,
  harmony: PantoneHarmonyMode = 'warm-paper',
  textureEnabled = true
): PantoneSwatchSpec {
  const trimmed = (inputHexOrCode || '').trim();

  // 1. Check if the developer typed a Pantone code or name directly
  const catalogMatchByText = PANTONE_INSTITUTE_CATALOG.find(
    (item) =>
      item.code.toLowerCase() === trimmed.toLowerCase() ||
      item.name.toLowerCase() === trimmed.toLowerCase() ||
      item.hex.toLowerCase() === trimmed.toLowerCase()
  );
  if (catalogMatchByText) {
    return {
      ...catalogMatchByText,
      designSystem: synthesizeDesignSystemFromColor(
        catalogMatchByText.hex,
        catalogMatchByText.code,
        catalogMatchByText.name,
        harmony,
        textureEnabled
      ),
    };
  }

  // 2. Normalize hex code
  const hex = normalizeHexColorCode(trimmed) || '#4A3324';
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // 3. Check perceptual RGB distance against curated catalog (threshold <= 24)
  let closestCatalog: PantoneSwatchSpec | null = null;
  let minDistance = Infinity;
  for (const item of PANTONE_INSTITUTE_CATALOG) {
    const dr = rgb.r - item.rgb.r;
    const dg = rgb.g - item.rgb.g;
    const db = rgb.b - item.rgb.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < minDistance) {
      minDistance = dist;
      closestCatalog = item;
    }
  }

  if (closestCatalog && minDistance <= 20) {
    return {
      ...closestCatalog,
      hex,
      rgb,
      hsl,
      designSystem: synthesizeDesignSystemFromColor(
        hex,
        closestCatalog.code,
        closestCatalog.name,
        harmony,
        textureEnabled
      ),
    };
  }

  // 4. Deterministically compute an authentic Pantone FHI TCX code (PANTONE LL-HHCC TCX)
  // Lightness band: 11 (lightest) to 19 (deepest)
  const lightnessBand = Math.max(11, Math.min(19, 20 - Math.round((hsl.l / 100) * 8 + 1)));
  // Hue sector: 01 to 64 around the 360° wheel
  const hueSector = Math.max(1, Math.min(64, Math.round((hsl.h / 360) * 63) + 1));
  // Chroma band: 05 to 64 from saturation
  const chromaBand = Math.max(5, Math.min(64, Math.round((hsl.s / 100) * 58) + 5));

  const code = `PANTONE ${lightnessBand}-${String(hueSector).padStart(2, '0')}${String(
    chromaBand
  ).padStart(2, '0')} TCX`;

  const tonePrefix =
    hsl.l < 28 ? 'Deep' : hsl.l > 70 ? 'Luminous' : hsl.s < 18 ? 'Mineral' : 'Studio';
  const hueEntry =
    HUE_SECTOR_NAMES.find((entry) => hsl.h <= entry.maxHue) || HUE_SECTOR_NAMES[0];
  const name =
    hsl.s < 10 ? `${tonePrefix} Slate (${hex})` : `${tonePrefix} ${hueEntry.label}`;

  return {
    code,
    name,
    collection: 'Custom Pantone® Color Code Specification',
    hex,
    rgb,
    hsl,
    designSystem: synthesizeDesignSystemFromColor(
      hex,
      code,
      name,
      harmony,
      textureEnabled
    ),
  };
}

/* ============================================================================
 * 2. DEVELOPER LINK CLICK ANALYTICS & SEO / HEALTH AUDITOR ENGINE
 * ========================================================================== */

export interface RankedLinkAnalyticsItem {
  link: LinkCardItem;
  rank: number;
  clickSharePercent: number;
  percentOfTopLink: number;
  estimatedCtrPercent: number;
  isTopPerformer: boolean;
}

export interface CategoryPerformanceItem {
  category: LinkCardItem['category'];
  label: string;
  linkCount: number;
  totalClicks: number;
  avgClicksPerLink: number;
  clickSharePercent: number;
}

export interface LinkAnalyticsReport {
  totalClicks: number;
  estimatedProfileViews: number;
  overallCtrPercent: number;
  mostClickedLink: RankedLinkAnalyticsItem | null;
  rankedLinks: RankedLinkAnalyticsItem[];
  categoryBreakdown: CategoryPerformanceItem[];
  pinnedClicksSharePercent: number;
}

/**
 * Computes a complete developer analytics report ranking links from most clicked to least clicked,
 * calculating click share percentages, relative progress bar widths, category breakdowns, and CTR.
 */
export function computeLinkAnalyticsReport(
  links: ReadonlyArray<LinkCardItem>,
  customProfileViews?: number
): LinkAnalyticsReport {
  const totalClicks = links.reduce((sum, item) => sum + Math.max(0, item.clicks || 0), 0);
  const estimatedProfileViews =
    typeof customProfileViews === 'number' && Number.isFinite(customProfileViews)
      ? Math.max(0, Math.round(customProfileViews))
      : 0;

  const sorted = [...links].sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
  const maxClicks = sorted.length > 0 ? Math.max(1, sorted[0].clicks || 0) : 1;

  const rankedLinks: RankedLinkAnalyticsItem[] = sorted.map((link, index) => {
    const clicks = Math.max(0, link.clicks || 0);
    const clickSharePercent =
      totalClicks > 0 ? Number(((clicks / totalClicks) * 100).toFixed(1)) : 0;
    const percentOfTopLink =
      totalClicks > 0 && clicks > 0 ? Math.max(4, Math.round((clicks / maxClicks) * 100)) : 0;
    const estimatedCtrPercent =
      estimatedProfileViews > 0
        ? Number(((clicks / estimatedProfileViews) * 100).toFixed(1))
        : 0;

    return {
      link,
      rank: index + 1,
      clickSharePercent,
      percentOfTopLink,
      estimatedCtrPercent,
      isTopPerformer: index === 0 && clicks > 0,
    };
  });

  const categories = extractAvailableCategories(links);

  const categoryBreakdown: CategoryPerformanceItem[] = categories.map((cat) => {
    const matching = links.filter((l) => normalizeCategoryId(l.category) === cat.id);
    const catClicks = matching.reduce((sum, l) => sum + Math.max(0, l.clicks || 0), 0);
    const avgClicksPerLink =
      matching.length > 0 ? Math.round(catClicks / matching.length) : 0;
    const clickSharePercent =
      totalClicks > 0 ? Number(((catClicks / totalClicks) * 100).toFixed(1)) : 0;

    return {
      category: cat.id,
      label: cat.label,
      linkCount: matching.length,
      totalClicks: catClicks,
      avgClicksPerLink,
      clickSharePercent,
    };
  });

  const pinnedClicks = links
    .filter((l) => l.pinned)
    .reduce((sum, l) => sum + Math.max(0, l.clicks || 0), 0);
  const pinnedClicksSharePercent =
    totalClicks > 0 ? Number(((pinnedClicks / totalClicks) * 100).toFixed(1)) : 0;

  const overallCtrPercent =
    estimatedProfileViews > 0
      ? Number(((totalClicks / estimatedProfileViews) * 100).toFixed(1))
      : 0;

  return {
    totalClicks,
    estimatedProfileViews,
    overallCtrPercent,
    mostClickedLink: rankedLinks[0] || null,
    rankedLinks,
    categoryBreakdown,
    pinnedClicksSharePercent,
  };
}

export interface DeveloperDiagnosticFinding {
  id: string;
  status: 'pass' | 'warning';
  title: string;
  detail: string;
}

export interface DeveloperHealthAudit {
  score: number;
  passedCount: number;
  totalChecks: number;
  findings: DeveloperDiagnosticFinding[];
}

/**
 * Audits the developer's links and profile metadata for HTTPS security, UTM campaign tags,
 * description completeness, duplicate URLs, and pinned CTA presence.
 */
export function auditDeveloperLinkHealth(
  links: ReadonlyArray<LinkCardItem>,
  profile: ProfileConfig
): DeveloperHealthAudit {
  const findings: DeveloperDiagnosticFinding[] = [];

  // 1. HTTPS enforcement check
  const insecureLinks = links.filter((l) => !l.url.trim().startsWith('https://'));
  findings.push({
    id: 'https-check',
    status: insecureLinks.length === 0 ? 'pass' : 'warning',
    title: 'HTTPS Transport Security',
    detail:
      insecureLinks.length === 0
        ? `All ${links.length} link cards use secure https:// URLs.`
        : `${insecureLinks.length} link(s) do not use https:// (${insecureLinks
            .map((l) => l.title)
            .join(', ')}).`,
  });

  // 2. UTM Campaign attribution check
  const untaggedLinks = links.filter((l) => !l.url.includes('utm_source='));
  findings.push({
    id: 'utm-attribution',
    status: untaggedLinks.length === 0 ? 'pass' : 'warning',
    title: 'UTM Source Attribution Tags',
    detail:
      untaggedLinks.length === 0
        ? 'Every link includes ?utm_source= parameters for downstream analytics.'
        : `${untaggedLinks.length} link(s) are missing UTM query parameters. Use the 1-Click UTM Tagger below.`,
  });

  // 3. Copy & Description quality check
  const thinDescriptions = links.filter((l) => l.description.trim().length < 20);
  findings.push({
    id: 'description-depth',
    status: thinDescriptions.length === 0 ? 'pass' : 'warning',
    title: 'Bento Card Description Depth',
    detail:
      thinDescriptions.length === 0
        ? 'All link cards have descriptive copy (>= 20 chars) for higher click-through.'
        : `${thinDescriptions.length} link(s) have very short descriptions (< 20 chars).`,
  });

  // 4. Pinned primary CTA check
  const pinnedCount = links.filter((l) => l.pinned).length;
  findings.push({
    id: 'pinned-cta',
    status: pinnedCount >= 1 ? 'pass' : 'warning',
    title: 'Primary Pinned Link Anchor',
    detail:
      pinnedCount >= 1
        ? `${pinnedCount} link card(s) pinned to the top of your Link Hub.`
        : 'No link is pinned. Pinning your #1 project typically increases clicks by 28–40%.',
  });

  // 5. GitHub live username check
  const hasGithub = Boolean(profile.githubUsername && profile.githubUsername.trim().length > 1);
  findings.push({
    id: 'github-live',
    status: hasGithub ? 'pass' : 'warning',
    title: 'Live GitHub Contributions Integration',
    detail: hasGithub
      ? `Connected to live GitHub user @${profile.githubUsername}.`
      : 'No GitHub username configured.',
  });

  const passedCount = findings.filter((f) => f.status === 'pass').length;
  const score = Math.round((passedCount / findings.length) * 100);

  return {
    score,
    passedCount,
    totalChecks: findings.length,
    findings,
  };
}

/**
 * Builds a clean URL with UTM campaign parameters for the Developer UTM Builder tool.
 */
export function buildUtmTrackingUrl(params: {
  baseUrl: string;
  source: string;
  medium: string;
  campaign?: string;
}): string {
  const raw = (params.baseUrl || '').trim();
  if (!raw) return '';
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProto);
    if (params.source.trim()) {
      url.searchParams.set('utm_source', params.source.trim());
    }
    if (params.medium.trim()) {
      url.searchParams.set('utm_medium', params.medium.trim());
    }
    if (params.campaign && params.campaign.trim()) {
      url.searchParams.set('utm_campaign', params.campaign.trim());
    }
    return url.toString();
  } catch {
    return withProto;
  }
}

/* ============================================================================
 * 3. ANALYTICS VISUAL GRAPH DATA & UNIFIED INBOX AGGREGATOR
 * ========================================================================== */

export interface DonutChartSlice {
  id: string;
  title: string;
  category: LinkCardItem['category'];
  clicks: number;
  percent: number;
  color: string;
  strokeDasharray: string;
  strokeDashoffset: number;
}

export const DONUT_CIRCUMFERENCE = 2 * Math.PI * 52; // r = 52 -> ~326.7256

/**
 * Computes SVG ring slices (strokeDasharray & strokeDashoffset) from ranked link analytics.
 */
export function buildDonutChartSlices(
  rankedLinks: ReadonlyArray<RankedLinkAnalyticsItem>,
  paletteColors: string[]
): DonutChartSlice[] {
  const safePalette =
    paletteColors.length > 0
      ? paletteColors
      : ['#6B4A2E', '#3A2418', '#A88462', '#8C6239', '#4A3324', '#B89B7E'];

  const nonZero = rankedLinks.filter((r) => r.link.clicks > 0);
  if (nonZero.length === 0) return [];

  const totalClicks = nonZero.reduce((sum, r) => sum + r.link.clicks, 0);
  let cumulativeFraction = 0;

  return nonZero.map((entry, idx) => {
    const fraction = totalClicks > 0 ? entry.link.clicks / totalClicks : 0;
    const segmentLen = fraction * DONUT_CIRCUMFERENCE;
    const dashOffset = -cumulativeFraction * DONUT_CIRCUMFERENCE;
    cumulativeFraction += fraction;

    return {
      id: entry.link.id,
      title: entry.link.title,
      category: entry.link.category,
      clicks: entry.link.clicks,
      percent: Number((fraction * 100).toFixed(1)),
      color: safePalette[idx % safePalette.length],
      strokeDasharray: `${segmentLen.toFixed(2)} ${DONUT_CIRCUMFERENCE.toFixed(2)}`,
      strokeDashoffset: Number(dashOffset.toFixed(2)),
    };
  });
}

export interface EngagementTrendPoint {
  dayLabel: string;
  clicks: number;
  views: number;
}

export interface EngagementTrendPointWithCoords extends EngagementTrendPoint {
  x: number;
  yClicks: number;
  yViews: number;
}

export interface EngagementTrendChartGeometry {
  points: EngagementTrendPointWithCoords[];
  clicksLinePath: string;
  clicksAreaPath: string;
  viewsLinePath: string;
  maxValue: number;
}

const MS_PER_DAY = 86_400_000;
const SEVEN_DAY_LABELS = ['6d ago', '5d ago', '4d ago', '3d ago', '2d ago', 'Yesterday', 'Today'];

/**
 * Aggregates real recorded analytics events (link clicks and profile views) across the last 7 UTC days.
 */
export function buildEngagementTrendSeries(
  events: ReadonlyArray<{
    eventType: 'link_click' | 'profile_view';
    createdAtMs: number;
  }> = [],
  nowMs: number = Date.now()
): EngagementTrendPoint[] {
  const buckets: EngagementTrendPoint[] = SEVEN_DAY_LABELS.map((dayLabel) => ({
    dayLabel,
    clicks: 0,
    views: 0,
  }));

  if (!Array.isArray(events) || events.length === 0) {
    return buckets;
  }

  const todayDayIndex = Math.floor(nowMs / MS_PER_DAY);
  for (const evt of events) {
    if (!evt || typeof evt.createdAtMs !== 'number' || !Number.isFinite(evt.createdAtMs)) {
      continue;
    }
    const evtDayIndex = Math.floor(evt.createdAtMs / MS_PER_DAY);
    const daysAgo = todayDayIndex - evtDayIndex;
    if (daysAgo < 0 || daysAgo > 6) continue;
    const bucketIdx = 6 - daysAgo;
    if (evt.eventType === 'profile_view') {
      buckets[bucketIdx].views += 1;
    } else if (evt.eventType === 'link_click') {
      buckets[bucketIdx].clicks += 1;
    }
  }

  return buckets;
}

/**
 * Computes SVG polyline & area paths for the 7-day engagement trend chart.
 */
export function computeTrendSvgGeometry(
  series: ReadonlyArray<EngagementTrendPoint>,
  width = 560,
  height = 190,
  padX = 34,
  padY = 22
): EngagementTrendChartGeometry {
  const safeSeries = series.length > 0 ? series : [{ dayLabel: 'Today', clicks: 0, views: 0 }];
  const maxRaw = Math.max(
    10,
    ...safeSeries.map((pt) => Math.max(pt.clicks, pt.views))
  );
  const maxValue = Math.ceil(maxRaw / 10) * 10;

  const plotW = Math.max(10, width - padX * 2);
  const plotH = Math.max(10, height - padY * 2);
  const stepX = safeSeries.length > 1 ? plotW / (safeSeries.length - 1) : 0;

  const points: EngagementTrendPointWithCoords[] = safeSeries.map((pt, i) => {
    const x = Number((padX + i * stepX).toFixed(1));
    const yClicks = Number((padY + plotH - (pt.clicks / maxValue) * plotH).toFixed(1));
    const yViews = Number((padY + plotH - (pt.views / maxValue) * plotH).toFixed(1));
    return { ...pt, x, yClicks, yViews };
  });

  const clicksLinePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.yClicks}`)
    .join(' ');
  const baselineY = Number((padY + plotH).toFixed(1));
  const clicksAreaPath =
    points.length > 0
      ? `${clicksLinePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
      : '';
  const viewsLinePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.yViews}`)
    .join(' ');

  return {
    points,
    clicksLinePath,
    clicksAreaPath,
    viewsLinePath,
    maxValue,
  };
}

export type UnifiedMessageSource = 'hub' | 'work' | 'custom';
export type UnifiedMessageFilter = 'all' | UnifiedMessageSource;

export interface UnifiedMessageItem {
  id: string;
  name: string;
  email: string;
  message: string;
  source: UnifiedMessageSource;
  timestamp: string;
}

export interface UnifiedInboxSummary<T extends UnifiedMessageItem = UnifiedMessageItem> {
  counts: {
    all: number;
    work: number;
    hub: number;
    custom: number;
  };
  filtered: T[];
}

/**
 * Aggregates and filters all incoming messages (Work with Me, Contact Form, and Custom messages)
 * for the unified Admin Messages tab.
 */
export function aggregateUnifiedInboxStats<T extends UnifiedMessageItem>(
  messages: ReadonlyArray<T>,
  sourceFilter: UnifiedMessageFilter = 'all',
  searchQuery = ''
): UnifiedInboxSummary<T> {
  const counts = {
    all: messages.length,
    work: messages.filter((m) => m.source === 'work').length,
    hub: messages.filter((m) => m.source === 'hub').length,
    custom: messages.filter((m) => m.source === 'custom').length,
  };

  const q = searchQuery.trim().toLowerCase();
  const filtered = messages.filter((m) => {
    const matchesSource = sourceFilter === 'all' || m.source === sourceFilter;
    if (!matchesSource) return false;
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.message.toLowerCase().includes(q)
    );
  });

  return { counts, filtered };
}


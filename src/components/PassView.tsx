import React, { useMemo, useState } from 'react';
import {
  Download,
  Share2,
  ArrowLeft,
  RotateCw,
  Check,
  Mail,
  MapPin,
  Copy,
  ExternalLink,
  GitBranch,
  Layers,
  UserCheck,
} from 'lucide-react';
import { calculatePassTilt, type LinkCardItem } from '../utils/hubLogic';
import {
  SAVED_DESIGN_SYSTEM,
  SAVED_SYSTEM_SWATCHES,
  type DesignSystemConfig,
  type ProfileConfig,
  type SocialLink,
} from '../data/profileData';
import { BrandIcon, BuilderBadge, VerifiedBadge } from './SocialIcons';
import { buildGoogleMapsExternalUrl, formatCoordinatesLabel, resolveProfileCoordinates } from '../utils/mapLocation';

interface PassViewProps {
  profile: ProfileConfig;
  socials?: SocialLink[];
  links?: LinkCardItem[];
  designSystem?: DesignSystemConfig;
  avatarUrl: string;
  onBackToProfile: () => void;
  onOpenShare: () => void;
}

/**
 * Generates a deterministic 21x21 QR-style matrix from a seed string (URL/handle)
 * with authentic finder patterns in the three corners.
 */
function buildDeterministicQrMatrix(seed: string): boolean[][] {
  const size = 21;
  const grid: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  const placeFinder = (row0: number, col0: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row0 + r;
        const cc = col0 + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        reserved[rr][cc] = true;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[rr][cc] = onBorder || inCore;
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    reserved[6][i] = true;
    reserved[i][6] = true;
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  let hash = 2166136261;
  const input = seed || 'link-hub-pass';
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      hash ^= (r * 31 + c * 17 + 13) & 0xff;
      hash = Math.imul(hash, 16777619);
      grid[r][c] = (Math.abs(hash) % 10) < 5;
    }
  }

  return grid;
}

export const PassView: React.FC<PassViewProps> = ({
  profile,
  socials = [],
  links = [],
  designSystem = SAVED_DESIGN_SYSTEM,
  avatarUrl,
  onBackToProfile,
  onOpenShare,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 35 });
  const [downloadedToast, setDownloadedToast] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [vcardSaved, setVcardSaved] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const normY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    setTilt(calculatePassTilt(normX, normY, 12));
  };

  const handleMouseLeave = () => {
    setTilt({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 35 });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setTilt(calculatePassTilt(-0.7, 0, 12));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setTilt(calculatePassTilt(0.7, 0, 12));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTilt(calculatePassTilt(0, -0.7, 12));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTilt(calculatePassTilt(0, 0.7, 12));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsFlipped((prev) => !prev);
    }
  };

  const displayName = profile.name.trim() || 'Digital Pass';
  const displayFullName = profile.fullName.trim() || displayName;
  const cleanHandle = profile.handle.trim()
    ? profile.handle.trim().startsWith('@')
      ? profile.handle.trim()
      : `@${profile.handle.trim()}`
    : profile.githubUsername.trim()
    ? `@${profile.githubUsername.trim()}`
    : '';

  const resolvedCoords = resolveProfileCoordinates(profile);
  const displayCoords =
    profile.coordinates.trim() ||
    (resolvedCoords ? formatCoordinatesLabel(resolvedCoords.lat, resolvedCoords.lng) : '');
  const displayLocation =
    profile.location.trim() || profile.mapLabel.trim() || '';
  const googleMapsUrl = buildGoogleMapsExternalUrl(profile);

  const hasStructuredBio = Boolean(
    profile.bioPrefix.trim() ||
      profile.bioCode.trim() ||
      profile.bioMiddle.trim() ||
      profile.bioLinkText.trim() ||
      profile.bioSuffix.trim()
  );

  // Cleanly spaced plain-text bio for Canvas export
  const bioPlainSpaced = [
    profile.bioPrefix.trim(),
    profile.bioCode.trim() ? `[${profile.bioCode.trim()}]` : '',
    profile.bioMiddle.trim(),
    profile.bioLinkText.trim(),
    profile.bioSuffix.trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Deterministic serial number when custom passSerial is not set
  const passSerialLabel = useMemo(() => {
    if (profile.passSerial.trim()) return profile.passSerial.trim();
    const seed = `${displayName}-${cleanHandle || 'hub'}`;
    let sum = 0;
    for (let i = 0; i < seed.length; i++) {
      sum = (sum * 31 + seed.charCodeAt(i)) % 9000 + 1000;
    }
    return `LH-${sum || 2026} · EDITION 01`;
  }, [profile.passSerial, displayName, cleanHandle]);

  const hubShareUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://linkhub.dev';

  const qrMatrix = useMemo(
    () => buildDeterministicQrMatrix(`${hubShareUrl}/${cleanHandle || displayName}`),
    [hubShareUrl, cleanHandle, displayName]
  );

  const activeSwatches = useMemo(() => {
    const customList = [
      { name: 'Canvas', hex: designSystem.canvasBg },
      { name: 'Surface', hex: designSystem.secondarySurface },
      { name: 'Copper', hex: designSystem.accentPrimary },
      { name: 'Amber', hex: designSystem.accentSecondary },
      { name: 'Border', hex: designSystem.borderColor },
      { name: 'Card', hex: designSystem.cardBg },
    ].filter((s) => Boolean(s.hex));
    return customList.length >= 4 ? customList : SAVED_SYSTEM_SWATCHES.slice(0, 6);
  }, [designSystem]);

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile.email.trim()) return;
    navigator.clipboard?.writeText(profile.email.trim()).catch(() => {});
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleSaveVCard = () => {
    const vcardLines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${displayFullName}`,
      `N:${displayFullName};;;;`,
      profile.role.trim() ? `TITLE:${profile.role.trim()}` : '',
      profile.email.trim() ? `EMAIL;TYPE=INTERNET:${profile.email.trim()}` : '',
      displayLocation ? `ADR;TYPE=WORK:;;${displayLocation};;;;` : '',
      `URL:${hubShareUrl}`,
      bioPlainSpaced ? `NOTE:${bioPlainSpaced}` : '',
      'END:VCARD',
    ].filter(Boolean);

    const blob = new Blob([vcardLines.join('\r\n')], {
      type: 'text/vcard;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const safeSlug =
      displayName.toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'creator';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeSlug}.vcf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setVcardSaved(true);
    setTimeout(() => setVcardSaved(false), 2500);
  };

  const handleDownloadPass = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 760;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Outer espresso backdrop
      const outerGrad = ctx.createLinearGradient(0, 0, 1200, 760);
      outerGrad.addColorStop(0, '#3B261A');
      outerGrad.addColorStop(1, '#1E120C');
      ctx.fillStyle = outerGrad;
      ctx.fillRect(0, 0, 1200, 760);

      // Card body
      const cardGrad = ctx.createLinearGradient(80, 70, 1120, 690);
      cardGrad.addColorStop(0, '#2E1D13');
      cardGrad.addColorStop(0.55, '#3A2418');
      cardGrad.addColorStop(1, '#1F120B');
      ctx.fillStyle = cardGrad;
      ctx.strokeStyle = '#B8936E';
      ctx.lineWidth = 3;
      ctx.roundRect(80, 70, 1040, 620, 42);
      ctx.fill();
      ctx.stroke();

      // Inner dashed stitch frame
      ctx.save();
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = 'rgba(213, 196, 174, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.roundRect(104, 94, 992, 572, 30);
      ctx.stroke();
      ctx.restore();

      // Top credential header
      ctx.fillStyle = '#D5C4AE';
      ctx.font = '600 18px monospace';
      ctx.fillText('VERIFIED BUILDER CREDENTIAL', 145, 155);
      ctx.fillStyle = '#A88462';
      ctx.fillText(passSerialLabel, 820, 155);

      // Metallic smart chip
      ctx.fillStyle = '#C89D6C';
      ctx.roundRect(145, 200, 74, 54, 10);
      ctx.fill();
      ctx.strokeStyle = '#3A2418';
      ctx.lineWidth = 2;
      ctx.strokeRect(162, 200, 40, 54);

      // Identity
      ctx.fillStyle = '#FAF6F0';
      ctx.font = 'bold 56px sans-serif';
      ctx.fillText(displayName, 145, 355);

      if (profile.role.trim()) {
        ctx.fillStyle = '#E5C7A3';
        ctx.font = '600 26px sans-serif';
        ctx.fillText(profile.role.trim(), 145, 400);
      }

      if (bioPlainSpaced) {
        ctx.fillStyle = 'rgba(235, 222, 205, 0.86)';
        ctx.font = '400 21px sans-serif';
        const clippedBio =
          bioPlainSpaced.length > 92
            ? `${bioPlainSpaced.slice(0, 90)}...`
            : bioPlainSpaced;
        ctx.fillText(clippedBio, 145, 455);
      }

      // Bottom divider
      ctx.strokeStyle = 'rgba(168, 132, 98, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(145, 535);
      ctx.lineTo(1055, 535);
      ctx.stroke();

      // Bottom metadata columns
      const hostLabel = typeof window !== 'undefined' ? window.location.host : 'linkhub.dev';
      ctx.fillStyle = '#A88462';
      ctx.font = '600 15px monospace';
      ctx.fillText('BASE LOCATION', 145, 575);
      ctx.fillText('HANDLE / NETWORK', 480, 575);
      ctx.fillText('HUB ENDPOINT', 800, 575);

      ctx.fillStyle = '#FAF6F0';
      ctx.font = '600 21px monospace';
      ctx.fillText(displayLocation || 'Global', 145, 608);
      ctx.fillText(cleanHandle || displayName, 480, 608);
      ctx.fillText(hostLabel, 800, 608);

      const safeSlug =
        displayName.toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'digital';
      const link = document.createElement('a');
      link.download = `${safeSlug}-link-hub-pass.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
    setDownloadedToast(true);
    setTimeout(() => setDownloadedToast(false), 2500);
  };

  const topSocials = socials.slice(0, 5);
  const extraCount = Math.max(0, socials.length - topSocials.length);

  return (
    <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-3.5 sm:px-4 py-14 sm:py-16">
      {/* Top-right actions anchored to top */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2.5">
        <button
          type="button"
          onClick={handleDownloadPass}
          aria-label="Download image"
          title="Download pass image"
          className="w-11 h-11 sm:w-9 sm:h-9 rounded-full bg-[#FAF6F0] text-[#1A120E] hover:bg-[#D5C4AE] flex items-center justify-center shadow-md transition-colors cursor-pointer"
        >
          {downloadedToast ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={onOpenShare}
          aria-label="Share pass"
          title="Share pass"
          className="w-11 h-11 sm:w-9 sm:h-9 rounded-full bg-[#FAF6F0] text-[#1A120E] hover:bg-[#D5C4AE] flex items-center justify-center shadow-md transition-colors cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      <main className="w-full max-w-[540px] flex flex-col items-center gap-6">
        <h1 className="sr-only">{displayName} pass</h1>

        {/* Interactive 3D Pass Card Container */}
        <div
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full max-w-[450px] select-none"
          style={{ perspective: '1300px' }}
        >
          <div
            onKeyDown={handleKeyDown}
            style={{
              transform: `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
              transition: 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            className="relative w-full rounded-[28px] bg-gradient-to-br from-[#2E1C12] via-[#3A2418] to-[#1D110B] border border-[#C69F79]/65 shadow-[0_32px_70px_-15px_rgba(18,11,7,0.78)] p-5 sm:p-6 overflow-hidden"
          >
            {/* Subtle Inner Stitched Leather Perimeter */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-2.5 rounded-[20px] border border-dashed border-[#D5C4AE]/20"
            />

            {/* Architectural Guilloché / Topographic Foil Contour Lines */}
            <svg
              aria-hidden="true"
              viewBox="0 0 440 300"
              className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-25"
            >
              <defs>
                <linearGradient id="passCopperFoil" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#E5C19A" stopOpacity="0.65" />
                  <stop offset="50%" stopColor="#A88462" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#FAF6F0" stopOpacity="0.05" />
                </linearGradient>
              </defs>
              <circle cx="390" cy="40" r="110" fill="none" stroke="url(#passCopperFoil)" strokeWidth="0.9" />
              <circle cx="390" cy="40" r="145" fill="none" stroke="url(#passCopperFoil)" strokeWidth="0.75" strokeDasharray="3 5" />
              <circle cx="390" cy="40" r="180" fill="none" stroke="url(#passCopperFoil)" strokeWidth="0.7" />
              <path
                d="M-20 230 C110 175, 240 245, 460 155"
                fill="none"
                stroke="url(#passCopperFoil)"
                strokeWidth="1"
              />
              <path
                d="M-20 255 C125 198, 255 268, 460 182"
                fill="none"
                stroke="url(#passCopperFoil)"
                strokeWidth="0.75"
                strokeDasharray="4 4"
              />
            </svg>

            {/* Full-card flip button behind elevated interactive controls */}
            <button
              type="button"
              aria-label={`${displayName} pass (${isFlipped ? 'Back side' : 'Front side'}). Press to flip card.`}
              onClick={() => setIsFlipped((prev) => !prev)}
              className="absolute inset-0 z-10 w-full h-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#E5C19A] rounded-[28px]"
            />

            {/* Dynamic Specular Foil Light Glare */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 transition-opacity duration-200"
              style={{
                background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(250, 246, 240, 0.24) 0%, rgba(198, 159, 121, 0.12) 40%, transparent 72%)`,
              }}
            />

            {!isFlipped ? (
              /* ================= FRONT OF PASS CARD ================= */
              <div className="relative z-20 pointer-events-none flex flex-col justify-between min-h-[272px] space-y-4">
                {/* 1. Top Credential Header Bar: Smart Chip + Pass Type + Serial */}
                <div className="flex items-center justify-between gap-2 border-b border-[#A88462]/30 pb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Tactile Metallic Smart Chip Icon */}
                    <svg
                      viewBox="0 0 28 20"
                      className="w-6 h-4 shrink-0"
                      aria-hidden="true"
                    >
                      <rect
                        x="0.75"
                        y="0.75"
                        width="26.5"
                        height="18.5"
                        rx="3.5"
                        fill="#D5AF84"
                        stroke="#FAF6F0"
                        strokeOpacity="0.5"
                        strokeWidth="1"
                      />
                      <path
                        d="M9 1v18M19 1v18M1 7h8M19 7h8M1 13h8M19 13h8"
                        stroke="#4A2E1B"
                        strokeWidth="1.1"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="font-ibm-mono text-[10px] font-semibold tracking-[0.16em] uppercase text-[#E5C7A3] truncate">
                      Creator &amp; Builder Pass
                    </span>
                  </div>

                  <span className="font-ibm-mono text-[10px] font-medium tracking-wider text-[#D5C4AE]/80 shrink-0 tabular-nums">
                    {passSerialLabel}
                  </span>
                </div>

                {/* 2. Avatar + Full-Width Identity & Social Row */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-[#D5AF84] bg-[#2B1B12] shadow-md p-0.5 shrink-0">
                        <img
                          src={avatarUrl}
                          alt={displayName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full rounded-[12px] object-cover"
                        />
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xl sm:text-2xl font-bold text-[#FAF6F0] tracking-tight truncate">
                            {displayName}
                          </span>
                          {profile.name.trim() && (
                            <>
                              <VerifiedBadge className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                              <BuilderBadge className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                            </>
                          )}
                        </div>

                        {cleanHandle && (
                          <p className="font-ibm-mono text-[11px] text-[#D5C4AE]/80 truncate">
                            {cleanHandle}
                          </p>
                        )}
                      </div>
                    </div>

                    {topSocials.length > 0 && (
                      <ul
                        aria-label="Links"
                        className="pointer-events-auto flex items-center gap-1.5 shrink-0 pt-1"
                      >
                        {topSocials.map((item) => (
                          <li key={item.id}>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={item.label}
                              title={item.label}
                              className="w-8 h-8 rounded-xl bg-[#1A120E]/55 border border-[#C69F79]/55 hover:border-[#FAF6F0] hover:bg-[#6B4A2E]/70 text-[#FAF6F0] flex items-center justify-center transition-all shadow-2xs"
                            >
                              <BrandIcon platform={item.platform} className="w-3.5 h-3.5" />
                            </a>
                          </li>
                        ))}
                        {extraCount > 0 && (
                          <li>
                            <span className="w-8 h-8 rounded-xl bg-[#1A120E]/45 border border-[#C69F79]/45 text-[10px] font-ibm-mono text-[#FAF6F0]/90 flex items-center justify-center">
                              +{extraCount}
                            </span>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>

                  {profile.role.trim() && (
                    <p className="text-xs sm:text-[13.5px] font-semibold text-[#E5C7A3] leading-snug">
                      {profile.role}
                    </p>
                  )}
                </div>

                {/* 3. Properly Spaced & Formatted Bio (with unbroken inline code chip) */}
                {hasStructuredBio && (
                  <div className="rounded-2xl bg-[#1A120E]/45 border border-[#A88462]/30 px-3.5 py-2.5">
                    <p className="text-xs text-[#FAF6F0]/90 leading-relaxed line-clamp-4">
                      {profile.bioPrefix}
                      {profile.bioPrefix &&
                      profile.bioCode.trim() &&
                      !/\s$/.test(profile.bioPrefix)
                        ? ' '
                        : ''}
                      {profile.bioCode.trim() && (
                        <code className="inline-block whitespace-nowrap mx-0.5 px-1.5 py-0.5 rounded-md bg-[#3A2418] border border-[#C69F79]/45 font-ibm-mono text-[10.5px] font-semibold text-[#E5C7A3]">
                          {profile.bioCode.trim()}
                        </code>
                      )}
                      {profile.bioCode.trim() &&
                      profile.bioMiddle &&
                      !/^\s/.test(profile.bioMiddle)
                        ? ' '
                        : ''}
                      {profile.bioMiddle}
                      {profile.bioLinkText.trim() && (
                        <>
                          {profile.bioMiddle && !/\s$/.test(profile.bioMiddle) ? ' ' : ''}
                          <strong className="font-semibold text-[#E5C7A3] underline decoration-[#A88462] underline-offset-2">
                            {profile.bioLinkText.trim()}
                          </strong>
                        </>
                      )}
                      {profile.bioSuffix}
                    </p>
                  </div>
                )}

                {/* 4. Bottom Credential Telemetry Bar */}
                <div className="pt-2.5 border-t border-[#A88462]/30 flex items-center justify-between gap-3 text-[11px]">
                  <div className="flex items-center gap-3 min-w-0 text-[#D5C4AE]">
                    {displayLocation && (
                      <span className="inline-flex items-center gap-1 truncate">
                        <MapPin className="w-3.5 h-3.5 text-[#E5C7A3] shrink-0" />
                        <span className="font-medium text-[#FAF6F0] truncate">
                          {displayLocation}
                        </span>
                      </span>
                    )}

                    {profile.githubUsername.trim() && (
                      <span className="hidden sm:inline-flex items-center gap-1 font-ibm-mono text-[10.5px] text-[#D5C4AE]/85 truncate">
                        <GitBranch className="w-3 h-3 text-[#E5C7A3] shrink-0" />
                        <span>{profile.githubUsername.trim()}</span>
                      </span>
                    )}

                    {links.length > 0 && (
                      <span className="inline-flex items-center gap-1 font-ibm-mono text-[10.5px] text-[#D5C4AE]/85 shrink-0 tabular-nums">
                        <Layers className="w-3 h-3 text-[#E5C7A3] shrink-0" />
                        <span>
                          {links.length} {links.length === 1 ? 'link' : 'links'}
                        </span>
                      </span>
                    )}
                  </div>

                  <span className="inline-flex items-center gap-1 font-ibm-mono text-[10.5px] font-semibold text-[#E5C7A3] shrink-0">
                    <span>Flip</span>
                    <RotateCw className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ) : (
              /* ================= BACK OF PASS CARD ================= */
              <div className="relative z-20 pointer-events-none flex flex-col justify-between min-h-[268px] space-y-4">
                {/* 1. Top Identity + Deterministic Scannable QR Ticket Stub */}
                <div className="flex items-start justify-between gap-4 border-b border-[#A88462]/35 pb-3.5">
                  <div className="space-y-1 min-w-0">
                    <span className="font-ibm-mono text-[10px] font-semibold text-[#E5C7A3] tracking-[0.15em] uppercase block">
                      Verified Hub Credential
                    </span>
                    <p className="text-base sm:text-lg font-bold text-[#FAF6F0] truncate">
                      {displayFullName}
                    </p>
                    {profile.role.trim() && (
                      <p className="text-xs text-[#D5C4AE] truncate">{profile.role}</p>
                    )}
                    <p className="font-ibm-mono text-[10.5px] text-[#D5C4AE]/75 truncate pt-0.5">
                      {passSerialLabel}
                    </p>
                  </div>

                  {/* High-Contrast QR Matrix Ticket Stub */}
                  <div className="p-2 rounded-2xl bg-[#FAF6F0] text-[#1A120E] shadow-md shrink-0 flex flex-col items-center gap-1 border border-[#D5C4AE]">
                    <svg
                      viewBox="0 0 21 21"
                      className="w-14 h-14"
                      shapeRendering="crispEdges"
                      aria-label="Pass QR code"
                    >
                      {qrMatrix.map((row, rIdx) =>
                        row.map((cell, cIdx) =>
                          cell ? (
                            <rect
                              key={`${rIdx}-${cIdx}`}
                              x={cIdx}
                              y={rIdx}
                              width={1}
                              height={1}
                              fill="#1A120E"
                            />
                          ) : null
                        )
                      )}
                    </svg>
                    <span className="font-ibm-mono text-[8px] font-bold tracking-wider uppercase text-[#3A2418]">
                      SCAN HUB
                    </span>
                  </div>
                </div>

                {/* 2. Location, Coordinates & Direct Contact Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {(displayLocation || displayCoords) && (
                    <div className="p-2.5 rounded-xl bg-[#1A120E]/60 border border-[#A88462]/35 space-y-1">
                      <div className="flex items-center justify-between gap-1 text-[10px] font-ibm-mono text-[#E5C7A3]">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span>BASE &amp; GEO</span>
                        </span>
                        {googleMapsUrl && (
                          <a
                            href={googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="pointer-events-auto inline-flex items-center gap-0.5 text-[#FAF6F0] hover:text-[#E5C7A3] transition-colors"
                          >
                            <span>Map</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                      {displayLocation && (
                        <p className="text-[#FAF6F0] font-semibold truncate">
                          {displayLocation}
                        </p>
                      )}
                      {displayCoords && (
                        <p className="text-[#D5C4AE]/85 font-ibm-mono text-[10px] truncate tabular-nums">
                          {displayCoords}
                        </p>
                      )}
                    </div>
                  )}

                  {(profile.email.trim() || profile.githubUsername.trim()) && (
                    <div className="p-2.5 rounded-xl bg-[#1A120E]/60 border border-[#A88462]/35 space-y-1">
                      <div className="flex items-center justify-between gap-1 text-[10px] font-ibm-mono text-[#E5C7A3]">
                        <span className="inline-flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          <span>DIRECT CHANNEL</span>
                        </span>
                        {profile.email.trim() && (
                          <button
                            type="button"
                            onClick={handleCopyEmail}
                            className="pointer-events-auto inline-flex items-center gap-1 text-[#FAF6F0] hover:text-[#E5C7A3] transition-colors cursor-pointer"
                          >
                            {copiedEmail ? (
                              <>
                                <Check className="w-2.5 h-2.5" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-2.5 h-2.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      {profile.email.trim() && (
                        <p className="text-[#FAF6F0] font-ibm-mono text-[11px] truncate">
                          {profile.email}
                        </p>
                      )}
                      {profile.githubUsername.trim() && (
                        <p className="text-[#D5C4AE]/85 font-ibm-mono text-[10px] truncate">
                          github.com/{profile.githubUsername.trim()}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Pantone Palette Swatch Strip & Barcode Footer */}
                <div className="pt-2 border-t border-[#A88462]/30 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center -space-x-1">
                      {activeSwatches.map((swatch, idx) => (
                        <span
                          key={`${swatch.hex}-${idx}`}
                          title={`${swatch.name} (${swatch.hex})`}
                          className="w-4 h-4 rounded-full border border-[#FAF6F0]/50 shadow-2xs"
                          style={{ backgroundColor: swatch.hex }}
                        />
                      ))}
                    </div>
                    <span className="font-ibm-mono text-[10px] text-[#D5C4AE]/85">
                      PANTONE 19-1118 TCX
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 font-ibm-mono text-[10.5px] font-semibold text-[#E5C7A3]">
                    <RotateCw className="w-3 h-3" />
                    <span>Front</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          <p className="sr-only">
            Move the pointer over the card, or use the arrow keys, to move the light. Press to turn
            the card over, leading with the edge or corner nearest the light. Showing the{' '}
            {isFlipped ? 'back' : 'front'}.
          </p>
        </div>

        {/* Action Controls Below Pass */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs text-[#FAF6F0]">
          <button
            type="button"
            onClick={() => setIsFlipped((prev) => !prev)}
            className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FAF6F0] text-[#1A120E] hover:bg-[#D5C4AE] font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5 text-[#6B4A2E]" />
            <span>Flip pass ({isFlipped ? 'Back' : 'Front'})</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPass}
            className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#3A2418]/85 hover:bg-[#3A2418] border border-[#A88462]/45 text-xs font-semibold text-[#FAF6F0] transition-colors cursor-pointer"
          >
            {downloadedToast ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#E5C7A3]" />
                <span>Saved PNG</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-[#E5C7A3]" />
                <span>Save PNG</span>
              </>
            )}
          </button>

          {(profile.name.trim() || profile.email.trim()) && (
            <button
              type="button"
              onClick={handleSaveVCard}
              className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#3A2418]/85 hover:bg-[#3A2418] border border-[#A88462]/45 text-xs font-semibold text-[#FAF6F0] transition-colors cursor-pointer"
            >
              {vcardSaved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#E5C7A3]" />
                  <span>Contact Saved</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5 text-[#E5C7A3]" />
                  <span>Save Contact (.vcf)</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onBackToProfile}
            className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#24160E]/80 hover:bg-[#3A2418] text-xs font-medium text-[#D5C4AE] hover:text-[#FAF6F0] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>View full profile</span>
          </button>
        </div>
      </main>
    </div>
  );
};

import React, { useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  Award,
  PieChart,
  Activity,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Tag,
  Copy,
  Check,
  Download,
  Code2,
  Inbox,
  Briefcase,
  MessageSquare,
  Mail,
  Search,
  Trash2,
  Users,
  Sparkles,
  Globe,
  ExternalLink,
} from 'lucide-react';
import type { SiteConfigState } from '../data/profileData';
import type { LinkCardItem } from '../utils/hubLogic';
import type { FirestoreAnalyticsRecord } from '../services/firebaseHubService';
import { FIREBASE_RUNTIME_INFO } from '../services/firebase';
import type { StoredMessage } from './SubViewsAndModals';
import {
  computeLinkAnalyticsReport,
  auditDeveloperLinkHealth,
  buildUtmTrackingUrl,
  buildDonutChartSlices,
  buildEngagementTrendSeries,
  computeTrendSvgGeometry,
  aggregateUnifiedInboxStats,
  type UnifiedMessageFilter,
} from '../utils/pantoneAndAnalytics';
import {
  auditSeoAndAiDiscoverability,
  buildLandingSeoMetadata,
} from '../utils/seoAndGeo';

/* ============================================================================
 * 1. ANALYTICS TAB (WITH INTERACTIVE VISUAL GRAPHS)
 * ========================================================================== */
export const AdminAnalyticsTab: React.FC<{
  config: SiteConfigState;
  analyticsEvents?: FirestoreAnalyticsRecord[];
  onUpdateLink: (id: string, patch: Partial<LinkCardItem>) => void;
}> = ({ config, analyticsEvents = [], onUpdateLink }) => {
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

  const profileViewsCount = analyticsEvents.filter(
    (ev) => ev.eventType === 'profile_view'
  ).length;
  const report = computeLinkAnalyticsReport(config.links, profileViewsCount);
  const ds = config.designSystem;

  // Cohesive Pantone-derived series palette with crisp contrast on cream cards
  const chartPalette = [
    ds.accentPrimary,
    ds.secondarySurface,
    ds.accentSecondary,
    ds.primaryText,
    '#8C6239',
    '#4A3324',
  ];

  const donutSlices = buildDonutChartSlices(report.rankedLinks, chartPalette);
  const activeSlice =
    donutSlices.find((s) => s.id === hoveredLinkId) || donutSlices[0] || null;

  const trendSeries = buildEngagementTrendSeries(analyticsEvents);
  const trendGeometry = computeTrendSvgGeometry(trendSeries, 540, 180, 36, 22);
  const activeTrendPoint =
    hoveredDayIdx !== null && trendGeometry.points[hoveredDayIdx]
      ? trendGeometry.points[hoveredDayIdx]
      : trendGeometry.points[trendGeometry.points.length - 1];

  // Vertical Bar Chart dimensions
  const barLinks = report.rankedLinks.slice(0, 7);
  const maxBarClicks = Math.max(10, ...barLinks.map((b) => b.link.clicks || 0));
  const barSvgWidth = 540;
  const barSvgHeight = 205;
  const barPadLeft = 40;
  const barPadRight = 16;
  const barPadTop = 24;
  const barPadBottom = 42;
  const barPlotWidth = barSvgWidth - barPadLeft - barPadRight;
  const barPlotHeight = barSvgHeight - barPadTop - barPadBottom;
  const barSlotWidth = barLinks.length > 0 ? barPlotWidth / barLinks.length : barPlotWidth;
  const barWidth = Math.min(46, Math.max(18, barSlotWidth * 0.56));

  const inspectedBar =
    report.rankedLinks.find((r) => r.link.id === hoveredLinkId) ||
    report.mostClickedLink ||
    null;

  return (
    <section aria-label="Link Hub visual analytics dashboard" className="space-y-4">
      {/* Top KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-1">
          <span className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#3A2418]">
            Total Link Clicks
          </span>
          <p className="text-xl sm:text-2xl font-extrabold text-[#1A120E] tabular-nums">
            {report.totalClicks.toLocaleString()}
          </p>
          <p className="text-[11px] font-medium text-[#3A2418]">
            Across {config.links.length} cards
          </p>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-1">
          <span className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#3A2418]">
            #1 Most Clicked
          </span>
          <p className="text-sm font-extrabold text-[#1A120E] truncate pt-0.5">
            {report.mostClickedLink ? report.mostClickedLink.link.title : 'No links yet'}
          </p>
          <p className="font-ibm-mono text-[11px] font-bold text-[#3A2418] truncate">
            {report.mostClickedLink
              ? `${report.mostClickedLink.link.clicks} (${report.mostClickedLink.clickSharePercent}%)`
              : '—'}
          </p>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-1">
          <span className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#3A2418]">
            Hub CTR
          </span>
          <p className="text-xl sm:text-2xl font-extrabold text-[#1A120E] tabular-nums">
            {report.overallCtrPercent}%
          </p>
          <p className="text-[11px] font-medium text-[#3A2418] truncate">
            {report.estimatedProfileViews.toLocaleString()} views
          </p>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-1">
          <span className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#3A2418]">
            Pinned CTA Share
          </span>
          <p className="text-xl sm:text-2xl font-extrabold text-[#1A120E] tabular-nums">
            {report.pinnedClicksSharePercent}%
          </p>
          <p className="text-[11px] font-medium text-[#3A2418]">
            {config.links.filter((l) => l.pinned).length} pinned anchor(s)
          </p>
        </div>
      </div>

      {/* VISUAL GRAPH 1: CLICKS PER LINK VERTICAL BAR CHART + RANKED INSPECTOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4">
        <div className="lg:col-span-7 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5 sm:space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#3A2418]" />
              <h2 className="font-ibm-mono text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                Visual Clicks Comparison Chart
              </h2>
            </div>
            {inspectedBar && (
              <span className="px-2.5 py-1 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[11px] font-bold text-[#1A120E]">
                {inspectedBar.link.title}: {inspectedBar.link.clicks} clicks ({inspectedBar.clickSharePercent}%)
              </span>
            )}
          </div>

          {barLinks.length === 0 ? (
            <p className="text-xs font-medium text-[#3A2418] py-10 text-center">
              Add links in Projects &amp; Thumbnails to visualize click volume.
            </p>
          ) : (
            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${barSvgWidth} ${barSvgHeight}`}
                className="w-full h-auto min-w-[380px]"
                role="img"
                aria-label="Bar chart showing click counts per link card"
              >
                {/* Horizontal reference gridlines (0%, 25%, 50%, 75%, 100%) */}
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                  const y = barPadTop + barPlotHeight * (1 - frac);
                  const tickVal = Math.round(maxBarClicks * frac);
                  return (
                    <g key={frac}>
                      <line
                        x1={barPadLeft}
                        y1={y}
                        x2={barSvgWidth - barPadRight}
                        y2={y}
                        stroke={ds.borderColor}
                        strokeDasharray={frac === 0 ? undefined : '3 3'}
                        strokeWidth={frac === 0 ? '1.2' : '1'}
                      />
                      <text
                        x={barPadLeft - 7}
                        y={y + 3.5}
                        textAnchor="end"
                        fill="#3A2418"
                        fontSize="10"
                        fontFamily="IBM Plex Mono, monospace"
                        fontWeight="600"
                      >
                        {tickVal}
                      </text>
                    </g>
                  );
                })}

                {/* Bars per link */}
                {barLinks.map((entry, idx) => {
                  const slotCenterX = barPadLeft + barSlotWidth * idx + barSlotWidth / 2;
                  const barX = slotCenterX - barWidth / 2;
                  const h = Math.max(4, (entry.link.clicks / maxBarClicks) * barPlotHeight);
                  const barY = barPadTop + barPlotHeight - h;
                  const isHovered = hoveredLinkId === entry.link.id;
                  const fillColor = chartPalette[idx % chartPalette.length];
                  const shortTitle =
                    entry.link.title.length > 11
                      ? `${entry.link.title.slice(0, 10)}…`
                      : entry.link.title;

                  return (
                    <g
                      key={entry.link.id}
                      onMouseEnter={() => setHoveredLinkId(entry.link.id)}
                      onMouseLeave={() => setHoveredLinkId(null)}
                      onClick={() => setHoveredLinkId(entry.link.id)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={barX}
                        y={barY}
                        width={barWidth}
                        height={h}
                        rx="6"
                        fill={fillColor}
                        opacity={hoveredLinkId && !isHovered ? 0.52 : 1}
                        stroke={isHovered ? '#1A120E' : 'none'}
                        strokeWidth={isHovered ? '1.5' : '0'}
                      />
                      <text
                        x={slotCenterX}
                        y={barY - 6}
                        textAnchor="middle"
                        fill="#1A120E"
                        fontSize="10.5"
                        fontFamily="IBM Plex Mono, monospace"
                        fontWeight="700"
                      >
                        {entry.link.clicks}
                      </text>
                      <text
                        x={slotCenterX}
                        y={barSvgHeight - 20}
                        textAnchor="middle"
                        fill="#1A120E"
                        fontSize="10"
                        fontFamily="Manrope, sans-serif"
                        fontWeight={isHovered ? '800' : '600'}
                      >
                        {shortTitle}
                      </text>
                      <text
                        x={slotCenterX}
                        y={barSvgHeight - 7}
                        textAnchor="middle"
                        fill="#3A2418"
                        fontSize="9"
                        fontFamily="IBM Plex Mono, monospace"
                      >
                        #{entry.rank} · {entry.clickSharePercent}%
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        {/* VISUAL GRAPH 2: CLICK SHARE DONUT CHART */}
        <div className="lg:col-span-5 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5 sm:space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-[#3A2418]" />
              <h2 className="font-ibm-mono text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                Traffic Share Donut
              </h2>
            </div>
            <span className="font-ibm-mono text-[10px] font-semibold text-[#3A2418]">
              Hover slice to inspect
            </span>
          </div>

          {donutSlices.length === 0 ? (
            <p className="text-xs font-medium text-[#3A2418] py-10 text-center">
              Record at least 1 link click to render traffic share slices.
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-4 py-1">
              <div className="relative w-[148px] h-[148px] shrink-0">
                <svg
                  viewBox="0 0 150 150"
                  className="w-full h-full -rotate-90"
                  role="img"
                  aria-label="Donut chart showing click percentage share per link"
                >
                  <circle
                    cx="75"
                    cy="75"
                    r="52"
                    fill="transparent"
                    stroke={ds.cardBg}
                    strokeWidth="22"
                  />
                  {donutSlices.map((slice) => {
                    const isFocused = hoveredLinkId === slice.id;
                    return (
                      <circle
                        key={slice.id}
                        cx="75"
                        cy="75"
                        r="52"
                        fill="transparent"
                        stroke={slice.color}
                        strokeWidth={isFocused ? 26 : 22}
                        strokeDasharray={slice.strokeDasharray}
                        strokeDashoffset={slice.strokeDashoffset}
                        opacity={hoveredLinkId && !isFocused ? 0.5 : 1}
                        className="transition-all duration-200 cursor-pointer"
                        onMouseEnter={() => setHoveredLinkId(slice.id)}
                        onMouseLeave={() => setHoveredLinkId(null)}
                      />
                    );
                  })}
                </svg>

                {/* Donut Center Callout */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
                  <span className="font-ibm-mono text-[10px] font-bold uppercase text-[#3A2418]">
                    {hoveredLinkId && activeSlice ? 'Share' : 'Total'}
                  </span>
                  <span className="text-lg font-extrabold text-[#1A120E] leading-tight tabular-nums">
                    {hoveredLinkId && activeSlice
                      ? `${activeSlice.percent}%`
                      : report.totalClicks.toLocaleString()}
                  </span>
                  <span className="font-ibm-mono text-[9.5px] font-semibold text-[#3A2418] truncate max-w-[78px]">
                    {hoveredLinkId && activeSlice ? activeSlice.title : 'clicks'}
                  </span>
                </div>
              </div>

              {/* Donut Color Legend */}
              <div className="w-full space-y-1.5 min-w-0">
                {donutSlices.map((slice) => {
                  const isFocused = hoveredLinkId === slice.id;
                  return (
                    <button
                      key={slice.id}
                      type="button"
                      onMouseEnter={() => setHoveredLinkId(slice.id)}
                      onMouseLeave={() => setHoveredLinkId(null)}
                      onClick={() =>
                        setHoveredLinkId((prev) => (prev === slice.id ? null : slice.id))
                      }
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        isFocused
                          ? 'bg-[#EAE0D3] border-[#3A2418]'
                          : 'bg-[#F4EDE2] border-[#D5C4AE]'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-[#1A120E]/20"
                          style={{ backgroundColor: slice.color }}
                        />
                        <span className="text-[11px] font-bold text-[#1A120E] truncate">
                          {slice.title}
                        </span>
                      </span>
                      <span className="font-ibm-mono text-[10.5px] font-bold text-[#3A2418] shrink-0 tabular-nums">
                        {slice.percent}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* VISUAL GRAPH 3: 7-DAY ENGAGEMENT TREND AREA/LINE CHART & CATEGORY SHARE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4">
        <div className="lg:col-span-7 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5 sm:space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#3A2418]" />
              <h2 className="font-ibm-mono text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                7-Day Clicks &amp; Views Trajectory
              </h2>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-ibm-mono font-semibold text-[#3A2418]">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ backgroundColor: ds.accentPrimary }}
                />
                Clicks
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-0.5 inline-block border-t-2 border-dashed"
                  style={{ borderColor: ds.secondarySurface }}
                />
                Views
              </span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox="0 0 540 180"
              className="w-full h-auto min-w-[380px]"
              role="img"
              aria-label="7-day line and area chart comparing daily link clicks and profile views"
            >
              <defs>
                <linearGradient id="lhClicksAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ds.accentPrimary} stopOpacity="0.34" />
                  <stop offset="100%" stopColor={ds.accentPrimary} stopOpacity="0.03" />
                </linearGradient>
              </defs>

              {/* Y Gridlines */}
              {[0, 0.5, 1].map((frac) => {
                const y = 22 + (180 - 44) * (1 - frac);
                const val = Math.round(trendGeometry.maxValue * frac);
                return (
                  <g key={frac}>
                    <line
                      x1="36"
                      y1={y}
                      x2="504"
                      y2={y}
                      stroke={ds.borderColor}
                      strokeDasharray={frac === 0 ? undefined : '3 3'}
                    />
                    <text
                      x="30"
                      y={y + 3.5}
                      textAnchor="end"
                      fill="#3A2418"
                      fontSize="10"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Est. Views Dashed Curve */}
              <path
                d={trendGeometry.viewsLinePath}
                fill="none"
                stroke={ds.secondarySurface}
                strokeWidth="2"
                strokeDasharray="5 4"
                opacity="0.75"
              />

              {/* Clicks Gradient Area + Main Curve */}
              <path d={trendGeometry.clicksAreaPath} fill="url(#lhClicksAreaGrad)" />
              <path
                d={trendGeometry.clicksLinePath}
                fill="none"
                stroke={ds.accentPrimary}
                strokeWidth="2.75"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Data Dots & X Axis Labels */}
              {trendGeometry.points.map((pt, idx) => {
                const isSelected =
                  hoveredDayIdx === idx ||
                  (hoveredDayIdx === null && idx === trendGeometry.points.length - 1);
                return (
                  <g
                    key={pt.dayLabel}
                    onMouseEnter={() => setHoveredDayIdx(idx)}
                    onMouseLeave={() => setHoveredDayIdx(null)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.yViews}
                      r={isSelected ? 4 : 3}
                      fill="#FAF6F0"
                      stroke={ds.secondarySurface}
                      strokeWidth="1.8"
                    />
                    <circle
                      cx={pt.x}
                      cy={pt.yClicks}
                      r={isSelected ? 5.5 : 4}
                      fill={isSelected ? '#1A120E' : ds.accentPrimary}
                      stroke="#FAF6F0"
                      strokeWidth="1.5"
                    />
                    <text
                      x={pt.x}
                      y="173"
                      textAnchor="middle"
                      fill="#1A120E"
                      fontSize="9.5"
                      fontFamily="IBM Plex Mono, monospace"
                      fontWeight={isSelected ? '700' : '500'}
                    >
                      {pt.dayLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-ibm-mono text-[#3A2418]">
            <span>
              Selected Day: <strong className="text-[#1A120E]">{activeTrendPoint.dayLabel}</strong> —{' '}
              <strong className="text-[#1A120E]">{activeTrendPoint.clicks} clicks</strong> /{' '}
              {activeTrendPoint.views} views
            </span>
            <span>
              Firebase Firestore ({analyticsEvents.length} recorded events) · GA4{' '}
              {FIREBASE_RUNTIME_INFO.analyticsConfigured ? 'Active' : 'Ready'}
            </span>
          </div>
        </div>

        {/* Category Performance Visual Breakdown */}
        <div className="lg:col-span-5 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5 sm:space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#3A2418]" />
            <h2 className="font-ibm-mono text-xs font-bold uppercase tracking-wider text-[#1A120E]">
              Category Performance Share
            </h2>
          </div>
          {report.categoryBreakdown.length === 0 ? (
            <p className="text-xs font-medium text-[#3A2418] py-8 text-center">
              Add link cards to track category performance share.
            </p>
          ) : (
            <div className="space-y-2.5">
              {report.categoryBreakdown.map((cat, idx) => (
                <div
                  key={cat.category}
                  className="p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-bold text-[#1A120E] truncate">
                      {cat.label} ({cat.linkCount} cards)
                    </span>
                    <span className="font-ibm-mono text-[11px] sm:text-xs font-bold text-[#3A2418] tabular-nums shrink-0">
                      {cat.totalClicks} clicks · {cat.clickSharePercent}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-[#FAF6F0] border border-[#D5C4AE] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${
                          cat.clickSharePercent > 0
                            ? Math.max(4, Math.round(cat.clickSharePercent))
                            : 0
                        }%`,
                        backgroundColor: chartPalette[idx % chartPalette.length],
                      }}
                    />
                  </div>
                  <p className="font-ibm-mono text-[10px] text-[#3A2418]">
                    Avg {cat.avgClicksPerLink} clicks/card
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Interactive Most-Clicked Leaderboard */}
      <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5 sm:space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[#3A2418]" />
            <h2 className="font-ibm-mono text-xs font-bold uppercase tracking-wider text-[#1A120E]">
              Ranked Links Leaderboard
            </h2>
          </div>
          <span className="font-ibm-mono text-[10px] sm:text-[10.5px] font-semibold text-[#3A2418]">
            Ordered by live recorded clicks
          </span>
        </div>

        {report.rankedLinks.length === 0 ? (
          <p className="text-xs font-medium text-[#3A2418] py-6 text-center">
            No links added yet. Add cards in Projects &amp; Thumbnails to track performance.
          </p>
        ) : (
          <div className="space-y-2">
            {report.rankedLinks.map((entry) => (
              <div
                key={entry.link.id}
                onMouseEnter={() => setHoveredLinkId(entry.link.id)}
                onMouseLeave={() => setHoveredLinkId(null)}
                className="p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <span
                    className={`px-2 py-0.5 rounded-md font-ibm-mono text-[10px] font-bold shrink-0 ${
                      entry.isTopPerformer
                        ? 'bg-[#3A2418] text-[#FAF6F0]'
                        : 'bg-[#FAF6F0] text-[#1A120E] border border-[#B89B7E]'
                    }`}
                  >
                    #{entry.rank}
                    {entry.isTopPerformer ? ' TOP' : ''}
                  </span>
                  <span className="text-xs font-bold text-[#1A120E] truncate">
                    {entry.link.title}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[#EAE0D3] font-ibm-mono text-[10px] font-semibold uppercase text-[#3A2418]">
                    {entry.link.category}
                  </span>
                  {entry.link.pinned && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#3A2418] text-[#FAF6F0] font-ibm-mono text-[9px] font-bold">
                      <Sparkles className="w-2.5 h-2.5" />
                      PINNED
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                  <span className="font-ibm-mono text-[11.5px] sm:text-xs font-bold text-[#1A120E] tabular-nums">
                    {entry.link.clicks} clicks · {entry.clickSharePercent}%
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateLink(entry.link.id, { pinned: !entry.link.pinned })
                      }
                      className="min-h-[34px] sm:min-h-0 px-2.5 py-1 rounded-lg bg-[#FAF6F0] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[11px] sm:text-[10px] font-semibold text-[#3A2418] cursor-pointer"
                    >
                      {entry.link.pinned ? 'Unpin' : 'Pin'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

/* ============================================================================
 * 2. DEV TOOLS TAB (LINK HEALTH AUDIT, 1-CLICK UTM BUILDER & CONFIG UTILITIES)
 * ========================================================================== */
export const AdminDevToolsTab: React.FC<{
  config: SiteConfigState;
  onUpdateLink: (id: string, patch: Partial<LinkCardItem>) => void;
  onExportJson: () => void;
  onNotify: (message: string) => void;
}> = ({ config, onUpdateLink, onExportJson, onNotify }) => {
  const [utmLinkId, setUtmLinkId] = useState(config.links[0]?.id || '');
  const [utmSource, setUtmSource] = useState('linkhub');
  const [utmMedium, setUtmMedium] = useState('bio');
  const [utmCampaign, setUtmCampaign] = useState('featured');
  const [utmCopied, setUtmCopied] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);

  const healthAudit = auditDeveloperLinkHealth(config.links, config.profile);
  const seoGeoAudit = auditSeoAndAiDiscoverability(config);
  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const liveSeoMeta = buildLandingSeoMetadata(config, currentOrigin, 'hub');
  const selectedUtmLink =
    config.links.find((l) => l.id === utmLinkId) || config.links[0] || null;
  const generatedUtmUrl = selectedUtmLink
    ? buildUtmTrackingUrl({
        baseUrl: selectedUtmLink.url,
        source: utmSource,
        medium: utmMedium,
        campaign: utmCampaign,
      })
    : '';

  const handleCopyJsonConfig = () => {
    navigator.clipboard
      ?.writeText(JSON.stringify(config, null, 2))
      .catch(() => {});
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 1800);
    onNotify('Copied full link-hub-config.json to clipboard');
  };

  return (
    <section aria-label="Developer tools, SEO health audit, and UTM builder" className="space-y-4">
      {/* 0. Search Engine & AI / LLM Discoverability (SEO + GEO) */}
      <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#3A2418]" />
            <h2 className="font-ibm-mono text-xs font-bold uppercase tracking-wider text-[#1A120E]">
              Search Engine &amp; AI Crawler Readiness (SEO + GEO)
            </h2>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-[#3A2418] text-[#FAF6F0] font-ibm-mono text-[10.5px] sm:text-[11px] font-bold">
            GRADE {seoGeoAudit.grade} · {seoGeoAudit.score}% ({seoGeoAudit.passedCount}/{seoGeoAudit.totalChecks})
          </span>
        </div>

        {/* Live Search Snippet Preview */}
        <div className="p-3 rounded-xl bg-[#F4EDE2] border border-[#D5C4AE] space-y-1">
          <span className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#6B4A2E]">
            Live Search Result &amp; AI Citation Preview
          </span>
          <p className="font-ibm-mono text-[11px] text-[#3A2418] truncate">
            {liveSeoMeta.canonicalUrl}
          </p>
          <p className="text-sm font-bold text-[#1A120E] leading-snug">
            {liveSeoMeta.title}
          </p>
          <p className="text-xs text-[#3A2418] leading-relaxed">
            {liveSeoMeta.description}
          </p>
        </div>

        {/* AI & Crawler Machine-Readable Endpoints */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: '/RajdeepBhattacharyya-LinkHub', href: '/RajdeepBhattacharyya-LinkHub' },
            { label: '/og-logo.jpg', href: '/og-logo.jpg' },
            { label: '/favicon.svg', href: '/favicon.svg' },
            { label: '/llms.txt', href: '/llms.txt' },
            { label: '/llms-full.txt', href: '/llms-full.txt' },
            { label: '/.well-known/ai-profile.json', href: '/.well-known/ai-profile.json' },
            { label: '/sitemap.xml', href: '/sitemap.xml' },
            { label: '/robots.txt', href: '/robots.txt' },
            { label: '/og-card.svg', href: '/og-card.svg' },
          ].map((endpoint) => (
            <a
              key={endpoint.href}
              href={endpoint.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F4EDE2] hover:bg-[#D5C4AE] border border-[#B89B7E] font-ibm-mono text-[10.5px] font-semibold text-[#1A120E] transition-colors"
            >
              <span>{endpoint.label}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-75" />
            </a>
          ))}
        </div>

        {/* Actionable GEO Checklist */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {seoGeoAudit.checks.map((check) => (
            <div
              key={check.id}
              className="p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] flex items-start gap-2"
            >
              {check.passed ? (
                <CheckCircle2 className="w-4 h-4 text-[#2E5E3E] shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-[#9A5B13] shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#1A120E]">{check.label}</p>
                <p className="text-[11px] font-medium text-[#3A2418]">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 1. Link Health & SEO Audit */}
      <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5 sm:space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#3A2418]" />
            <h2 className="font-ibm-mono text-xs font-bold uppercase tracking-wider text-[#1A120E]">
              Developer Link Health &amp; SEO Audit
            </h2>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-[#3A2418] text-[#FAF6F0] font-ibm-mono text-[10.5px] sm:text-[11px] font-bold">
            SCORE {healthAudit.score}% ({healthAudit.passedCount}/{healthAudit.totalChecks} Checks)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {healthAudit.findings.map((finding) => (
            <div
              key={finding.id}
              className="p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] flex items-start gap-2"
            >
              {finding.status === 'pass' ? (
                <CheckCircle2 className="w-4 h-4 text-[#2E5E3E] shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-[#9A5B13] shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#1A120E]">{finding.title}</p>
                <p className="text-[11px] font-medium text-[#3A2418]">{finding.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. 1-Click UTM Campaign Link Builder */}
      <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5 sm:space-y-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-[#3A2418]" />
            <h2 className="font-ibm-mono text-xs font-bold uppercase tracking-wider text-[#1A120E]">
              1-Click UTM Campaign Link Builder
            </h2>
          </div>
          <p className="text-[11px] font-medium text-[#3A2418]">
            Append clean campaign attribution parameters to any showcase card URL in one click.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <select
            value={selectedUtmLink?.id || ''}
            onChange={(e) => setUtmLinkId(e.target.value)}
            disabled={config.links.length === 0}
            aria-label="Select link card for UTM tracking"
            className="min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs font-semibold text-[#1A120E] disabled:opacity-60"
          >
            {config.links.length === 0 ? (
              <option value="">No links yet</option>
            ) : (
              config.links.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))
            )}
          </select>
          <input
            type="text"
            value={utmSource}
            onChange={(e) => setUtmSource(e.target.value)}
            placeholder="utm_source (e.g. linkhub)"
            aria-label="UTM Source"
            className="min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
          />
          <input
            type="text"
            value={utmMedium}
            onChange={(e) => setUtmMedium(e.target.value)}
            placeholder="utm_medium (e.g. bio)"
            aria-label="UTM Medium"
            className="min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
          />
          <input
            type="text"
            value={utmCampaign}
            onChange={(e) => setUtmCampaign(e.target.value)}
            placeholder="utm_campaign (e.g. launch)"
            aria-label="UTM Campaign"
            className="min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
          />
        </div>

        {selectedUtmLink && (
          <div className="p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <code className="font-ibm-mono text-[11px] font-bold text-[#1A120E] break-all">
              {generatedUtmUrl}
            </code>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(generatedUtmUrl).catch(() => {});
                  setUtmCopied(true);
                  setTimeout(() => setUtmCopied(false), 1600);
                }}
                className="min-h-[34px] sm:min-h-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#FAF6F0] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#1A120E] cursor-pointer"
              >
                {utmCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{utmCopied ? 'Copied URL' : 'Copy UTM URL'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateLink(selectedUtmLink.id, { url: generatedUtmUrl });
                  onNotify(`Applied UTM tracking parameters to ${selectedUtmLink.title}`);
                }}
                className="min-h-[34px] sm:min-h-0 px-3 py-1.5 rounded-lg bg-[#3A2418] hover:bg-[#1A120E] text-[#FAF6F0] text-[11.5px] sm:text-xs font-semibold cursor-pointer"
              >
                Apply to Card URL
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Developer JSON Config & Slug Utilities */}
      <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5 sm:space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-[#3A2418]" />
            <h2 className="font-ibm-mono text-xs font-bold uppercase tracking-wider text-[#1A120E]">
              Developer Config &amp; Deployment Shortcuts
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyJsonConfig}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#1A120E] cursor-pointer"
            >
              {jsonCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{jsonCopied ? 'Copied JSON' : 'Copy Config JSON'}</span>
            </button>
            <button
              type="button"
              onClick={onExportJson}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#3A2418] hover:bg-[#1A120E] text-[#FAF6F0] text-[11.5px] sm:text-xs font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download link-hub-config.json</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E]">
            <span className="font-ibm-mono text-[10px] font-bold uppercase text-[#3A2418]">
              Public Route Host
            </span>
            <p className="font-ibm-mono text-xs font-bold text-[#1A120E] mt-0.5 truncate">
              {typeof window !== 'undefined' ? window.location.host : '/'}
              {config.profile.handle.trim() ? ` · ${config.profile.handle.trim()}` : ''}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E]">
            <span className="font-ibm-mono text-[10px] font-bold uppercase text-[#3A2418]">
              Active Pantone Spec
            </span>
            <p className="font-ibm-mono text-xs font-bold text-[#1A120E] mt-0.5 truncate">
              {config.designSystem.pantoneCode} ({config.designSystem.customSeedHex})
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E]">
            <span className="font-ibm-mono text-[10px] font-bold uppercase text-[#3A2418]">
              Config Payload Footprint
            </span>
            <p className="font-ibm-mono text-xs font-bold text-[#1A120E] mt-0.5">
              {(new Blob([JSON.stringify(config)]).size / 1024).toFixed(1)} KB JSON
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ============================================================================
 * 3. UNIFIED MESSAGES TAB (WORK WITH ME + CONTACT FORM + CUSTOM + SUBSCRIBERS)
 * ========================================================================== */
export const AdminMessagesTab: React.FC<{
  messages: StoredMessage[];
  subscribers: { name: string; email: string }[];
  onDeleteMessage: (id: string) => void;
  onToggleMessageRead?: (id: string, nextRead: boolean) => void;
}> = ({ messages, subscribers, onDeleteMessage, onToggleMessageRead }) => {
  const [sourceFilter, setSourceFilter] = useState<UnifiedMessageFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);

  const inboxSummary = aggregateUnifiedInboxStats(messages, sourceFilter, searchQuery);

  const filterButtons: {
    id: UnifiedMessageFilter;
    label: string;
    count: number;
  }[] = [
    { id: 'all', label: 'All Messages', count: inboxSummary.counts.all },
    { id: 'work', label: 'Work with me', count: inboxSummary.counts.work },
    { id: 'hub', label: 'Contact form', count: inboxSummary.counts.hub },
    ...(inboxSummary.counts.custom > 0
      ? [{ id: 'custom' as const, label: 'Custom', count: inboxSummary.counts.custom }]
      : []),
  ];

  const getSourceMeta = (source: StoredMessage['source']) => {
    if (source === 'work') {
      return {
        label: 'Work with me',
        icon: <Briefcase className="w-3 h-3" />,
        className: 'bg-[#3A2418] text-[#FAF6F0]',
      };
    }
    if (source === 'custom') {
      return {
        label: 'Custom message',
        icon: <Sparkles className="w-3 h-3" />,
        className: 'bg-[#6B4A2E] text-[#FAF6F0]',
      };
    }
    return {
      label: 'Contact form',
      icon: <MessageSquare className="w-3 h-3" />,
      className: 'bg-[#EAE0D3] text-[#1A120E] border border-[#B89B7E]',
    };
  };

  const handleCopyEmail = (id: string, email: string) => {
    navigator.clipboard?.writeText(email).catch(() => {});
    setCopiedEmailId(id);
    setTimeout(() => setCopiedEmailId((prev) => (prev === id ? null : prev)), 1500);
  };

  return (
    <section aria-label="Unified messages and subscribers inbox" className="space-y-4">
      {/* Top Unified Banner */}
      <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-[#3A2418]" />
            <h2 className="font-ibm-mono text-xs font-bold uppercase tracking-wider text-[#1A120E]">
              Unified Messages Inbox ({messages.length})
            </h2>
          </div>
          <p className="text-[11px] sm:text-xs font-medium text-[#3A2418]">
            Every visitor submission — whether from <strong className="text-[#1A120E]">Work with me</strong>, the <strong className="text-[#1A120E]">Contact me</strong> form, or custom inquiries — arrives right here in one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="px-2.5 py-1 rounded-lg bg-[#3A2418] text-[#FAF6F0] font-ibm-mono text-[10px] font-bold">
            {inboxSummary.counts.work} WORK REQUESTS
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[#1A120E] font-ibm-mono text-[10px] font-bold">
            {inboxSummary.counts.hub} HUB CONTACT
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4">
        {/* Main Unified Messages Stream */}
        <div className="lg:col-span-8 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-3">
          {/* Source Filter Pills + Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter messages by source">
              {filterButtons.map((btn) => {
                const active = sourceFilter === btn.id;
                return (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => setSourceFilter(btn.id)}
                    aria-pressed={active}
                    className={`min-h-[34px] sm:min-h-0 inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#3A2418] text-[#FAF6F0]'
                        : 'bg-[#F4EDE2] text-[#3A2418] border border-[#B89B7E] hover:text-[#1A120E]'
                    }`}
                  >
                    <span>{btn.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-ibm-mono ${
                        active ? 'bg-[#FAF6F0] text-[#1A120E]' : 'bg-[#EAE0D3] text-[#1A120E]'
                      }`}
                    >
                      {btn.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative sm:w-56">
              <Search className="w-3.5 h-3.5 text-[#3A2418] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sender or message..."
                aria-label="Search messages"
                className="w-full min-h-[36px] pl-8 pr-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs font-medium text-[#1A120E] placeholder-[#5C3D24]"
              />
            </div>
          </div>

          {/* Filtered Message Cards */}
          {inboxSummary.filtered.length === 0 ? (
            <div className="p-6 sm:p-8 rounded-xl sm:rounded-2xl bg-[#F4EDE2] border border-dashed border-[#B89B7E] text-center space-y-1">
              <p className="text-xs font-bold text-[#1A120E]">No matching messages</p>
              <p className="text-[11px] font-medium text-[#3A2418]">
                Submissions from Work with me or the Hub Contact form will appear here immediately.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {inboxSummary.filtered.map((m) => {
                const sourceMeta = getSourceMeta(m.source);
                const isCopied = copiedEmailId === m.id;
                return (
                  <article
                    key={m.id}
                    className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-[#F4EDE2] border border-[#B89B7E] space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-ibm-mono text-[10px] font-bold shrink-0 ${sourceMeta.className}`}
                        >
                          {sourceMeta.icon}
                          <span>{sourceMeta.label}</span>
                        </span>
                        <span className="text-xs font-bold text-[#1A120E]">{m.name}</span>
                        <span className="font-ibm-mono text-[11px] font-semibold text-[#3A2418] truncate max-w-full">
                          {m.email}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <span className="font-ibm-mono text-[10px] font-semibold text-[#3A2418] mr-auto sm:mr-1">
                          {m.timestamp}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyEmail(m.id, m.email)}
                          aria-label={`Copy email ${m.email}`}
                          title="Copy sender email"
                          className="min-h-[34px] min-w-[34px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-1.5 rounded-lg bg-[#FAF6F0] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[#1A120E] cursor-pointer"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-[#2E5E3E]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                          )}
                        </button>
                        <a
                          href={`mailto:${m.email}?subject=Re: ${encodeURIComponent(sourceMeta.label)}`}
                          aria-label={`Reply to ${m.name}`}
                          title={`Reply via email to ${m.email}`}
                          className="min-h-[34px] min-w-[34px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-1.5 rounded-lg bg-[#FAF6F0] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[#1A120E]"
                        >
                          <Mail className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                        </a>
                        {onToggleMessageRead && (
                          <button
                            type="button"
                            onClick={() => onToggleMessageRead(m.id, !m.read)}
                            className={`min-h-[34px] sm:min-h-0 px-2.5 py-1 sm:px-2 sm:py-1 rounded-lg border font-ibm-mono text-[10px] font-bold cursor-pointer ${
                              m.read
                                ? 'bg-[#F4EDE2] border-[#B89B7E] text-[#3A2418]'
                                : 'bg-[#3A2418] border-[#3A2418] text-[#FAF6F0]'
                            }`}
                          >
                            {m.read ? 'Read' : 'New'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteMessage(m.id)}
                          aria-label={`Delete message from ${m.name}`}
                          className="min-h-[34px] min-w-[34px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-1.5 rounded-lg bg-[#FAF6F0] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[#3A2418] hover:text-[#1A120E] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs font-medium text-[#1A120E] leading-relaxed">
                      {m.message}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* Update Subscribers Column */}
        <div className="lg:col-span-4 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5 sm:space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#3A2418]" />
              <h2 className="font-ibm-mono text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                Update Subscribers ({subscribers.length})
              </h2>
            </div>
          </div>

          <p className="text-[11px] font-medium text-[#3A2418]">
            Visitors who joined via the &ldquo;Get updates&rdquo; button.
          </p>

          {subscribers.length === 0 ? (
            <p className="text-xs font-medium text-[#3A2418] p-4 rounded-xl bg-[#F4EDE2] border border-[#B89B7E]">
              No subscribers yet.
            </p>
          ) : (
            <div className="space-y-2">
              {subscribers.map((sub, i) => (
                <div
                  key={`${sub.email}-${i}`}
                  className="p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#1A120E] truncate">{sub.name}</p>
                    <p className="font-ibm-mono text-[11px] font-semibold text-[#3A2418] truncate">
                      {sub.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyEmail(`sub-${i}`, sub.email)}
                    aria-label={`Copy subscriber email ${sub.email}`}
                    className="min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-1.5 rounded-lg bg-[#FAF6F0] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[#1A120E] shrink-0 cursor-pointer"
                  >
                    {copiedEmailId === `sub-${i}` ? (
                      <Check className="w-3 h-3 text-[#2E5E3E]" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

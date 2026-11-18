import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GitHubCalendar, type Activity, type Year } from 'react-github-calendar';
import { ExternalLink, RefreshCw, AlertCircle, Loader2, GitBranch } from 'lucide-react';
import {
  GITHUB_BROWN_BRONZE_THEME,
  formatContributionTooltip,
  formatRepoCommitTooltip,
  buildGitHubProfileUrl,
  summarizeGitHubActivities,
  parseGitHubRepoOrUserInput,
  buildRepoCalendarFromCommitActivity,
  buildRepoCalendarFromCommits,
  groupContributionDaysIntoWeeks,
  type ContributionDay,
  type GitHubActivitySummary,
} from '../utils/hubLogic';
import { BrandIcon } from './SocialIcons';

export interface GitHubActivityProps {
  username?: string;
  repo?: string;
  profileUrl?: string;
  title?: string;
  subtitle?: string;
  defaultYear?: Year;
  availableYears?: Year[];
  themeColors?: [string, string, string, string, string];
  className?: string;
}

const CALENDAR_LABELS_LAST_YEAR = {
  totalCount: '{{count}} contributions in the last 12 months',
  legend: {
    less: 'Less',
    more: 'More',
  },
};

const CALENDAR_LABELS_SPECIFIC_YEAR = {
  totalCount: '{{count}} contributions in {{year}}',
  legend: {
    less: 'Less',
    more: 'More',
  },
};

const CALENDAR_TOOLTIPS = {
  activity: {
    text: (activity: { date: string; count: number; level: number }) =>
      formatContributionTooltip(activity),
    placement: 'top' as const,
    offset: 8,
    hoverRestMs: 20,
    withArrow: true,
  },
  colorLegend: {
    text: (level: number) => `Intensity level ${level} of 4`,
    placement: 'top' as const,
    offset: 6,
    withArrow: true,
  },
};

const WEEKDAY_LABELS: Array<'mon' | 'wed' | 'fri'> = ['mon', 'wed', 'fri'];
const DEFAULT_YEAR_OPTIONS: Year[] = ['last', 2026, 2025];

export const GitHubActivity: React.FC<GitHubActivityProps> = React.memo(({
  username = '',
  repo = '',
  profileUrl,
  title = 'DEVELOPMENT ACTIVITY',
  subtitle = 'Live GitHub contributions and repository activity.',
  defaultYear = 'last',
  availableYears = DEFAULT_YEAR_OPTIONS,
  themeColors,
  className = '',
}) => {
  const parsedSource = parseGitHubRepoOrUserInput(username);
  const cleanUser = parsedSource.username || username.trim().replace(/^@/, '');
  const resolvedRepo = (repo || parsedSource.repo || '').trim();
  const isRepoMode = Boolean(cleanUser && resolvedRepo);

  const resolvedProfileUrl =
    profileUrl && profileUrl.trim()
      ? profileUrl
      : resolvedRepo
      ? `https://github.com/${cleanUser}/${resolvedRepo}`
      : buildGitHubProfileUrl(cleanUser);

  const [selectedYear, setSelectedYear] = useState<Year>(defaultYear);
  const [status, setStatus] = useState<'unconfigured' | 'loading' | 'ready' | 'error'>(
    cleanUser ? 'loading' : 'unconfigured'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<GitHubActivitySummary | null>(null);
  const [repoDays, setRepoDays] = useState<ContributionDay[] | null>(null);
  const [repoSourceKind, setRepoSourceKind] = useState<'stats' | 'commits'>('stats');
  const [hoveredDay, setHoveredDay] = useState<ContributionDay | null>(null);
  const [retrySeed, setRetrySeed] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(460);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const updateWidth = () => {
      const w = el.clientWidth;
      if (w > 0) {
        setContainerWidth(w);
      }
    };

    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
  }, []);

  const verifyLiveGitHubData = useCallback(
    async (signal: AbortSignal) => {
      if (!cleanUser) {
        setStatus('unconfigured');
        setErrorMessage(null);
        return;
      }

      setStatus('loading');
      setErrorMessage(null);
      setHoveredDay(null);

      try {
        if (resolvedRepo) {
          // Repository Heatmap Mode: use GitHub's official REST API so both personal & org repos work cleanly
          const ownerEnc = encodeURIComponent(cleanUser);
          const repoEnc = encodeURIComponent(resolvedRepo);
          let resolvedDays: ContributionDay[] | null = null;
          let sourceKind: 'stats' | 'commits' = 'stats';

          const statsRes = await fetch(
            `https://api.github.com/repos/${ownerEnc}/${repoEnc}/stats/commit_activity`,
            {
              signal,
              headers: { Accept: 'application/vnd.github+json' },
            }
          );

          if (statsRes.status === 404) {
            throw new Error(
              `Repository "${cleanUser}/${resolvedRepo}" was not found or is private.`
            );
          }

          if (statsRes.status === 200) {
            const statsPayload = await statsRes.json();
            if (
              Array.isArray(statsPayload) &&
              statsPayload.length > 0 &&
              statsPayload.some((w) => w && typeof w.total === 'number' && w.total > 0)
            ) {
              resolvedDays = buildRepoCalendarFromCommitActivity(statsPayload);
              sourceKind = 'stats';
            }
          }

          if (!resolvedDays) {
            // 202 (cache warming) or empty stats fallback: read recent commits directly
            const commitsRes = await fetch(
              `https://api.github.com/repos/${ownerEnc}/${repoEnc}/commits?per_page=100`,
              {
                signal,
                headers: { Accept: 'application/vnd.github+json' },
              }
            );
            if (!commitsRes.ok) {
              throw new Error(
                commitsRes.status === 404
                  ? `Repository "${cleanUser}/${resolvedRepo}" was not found or is private.`
                  : `GitHub API returned status ${commitsRes.status} for "${cleanUser}/${resolvedRepo}".`
              );
            }
            const commitsPayload = await commitsRes.json();
            resolvedDays = buildRepoCalendarFromCommits(
              Array.isArray(commitsPayload) ? commitsPayload : []
            );
            sourceKind = 'commits';
          }

          setRepoDays(resolvedDays);
          setRepoSourceKind(sourceKind);
          setSummary(summarizeGitHubActivities(resolvedDays));
          setStatus('ready');
          return;
        }

        // Personal GitHub User Heatmap Mode
        setRepoDays(null);
        const response = await fetch(
          `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(
            cleanUser
          )}?y=${encodeURIComponent(String(selectedYear))}&client=react-github-calendar`,
          { signal }
        );
        const payload = await response.json();

        if (!response.ok || payload.error) {
          throw new Error(
            response.status === 404
              ? `GitHub user "${cleanUser}" not found. For an organization repo, enter owner/repo (e.g. vercel/next.js).`
              : payload?.error || `Could not load GitHub contributions for "${cleanUser}".`
          );
        }

        const contributions: Activity[] = Array.isArray(payload.contributions)
          ? payload.contributions
          : [];
        setSummary(summarizeGitHubActivities(contributions));
        setStatus('ready');
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setStatus('error');
        setErrorMessage(
          err instanceof Error
            ? err.message
            : `Unable to fetch live GitHub contribution data for @${cleanUser}${
                resolvedRepo ? `/${resolvedRepo}` : ''
              }.`
        );
      }
    },
    [cleanUser, resolvedRepo, selectedYear]
  );

  useEffect(() => {
    const controller = new AbortController();
    verifyLiveGitHubData(controller.signal);
    return () => controller.abort();
  }, [verifyLiveGitHubData, retrySeed]);

  const handleRetry = () => {
    setRetrySeed((prev) => prev + 1);
  };

  // Compute exact square size & spacing so all 53 weeks + weekday labels fit cleanly inside the container without clipping
  const isCompactContainer = containerWidth > 0 && containerWidth < 475;
  const blockSize = isCompactContainer ? 5 : 6;
  const blockMargin = 2;
  const fontSize = 10;

  const defaultWarmHighlightPalette: [string, string, string, string, string] = [
    '#EFE6DA',
    '#D5C4AE',
    '#A88462',
    '#6B4A2E',
    '#3A2418',
  ];
  const activePalette = themeColors || defaultWarmHighlightPalette;
  const repoWeeks = useMemo(
    () => (repoDays ? groupContributionDaysIntoWeeks(repoDays) : []),
    [repoDays]
  );

  const periodLabel = isRepoMode
    ? 'Repository commits (52W)'
    : selectedYear === 'last'
    ? 'Last 12 months'
    : `${selectedYear} activity`;

  // SVG layout coordinates for Repo Mode
  const svgCellSize = 7;
  const svgCellGap = 2;
  const svgStep = svgCellSize + svgCellGap;
  const svgLeftOffset = 28;
  const svgTopOffset = 15;
  const svgWidth = svgLeftOffset + Math.max(1, repoWeeks.length) * svgStep + 2;
  const svgHeight = svgTopOffset + 7 * svgStep + 2;

  return (
    <section
      aria-labelledby="dev-activity-heading"
      className={`w-full max-w-full rounded-2xl border p-3.5 sm:p-4 space-y-3 shadow-sm font-manrope ${className}`}
      style={{
        backgroundColor:
          'color-mix(in srgb, var(--lh-card-bg, #F4EDE2) 72%, var(--lh-accent-secondary, #A88462) 28%)',
        borderColor: 'var(--lh-accent-secondary, #A88462)',
        color: 'var(--lh-primary-text, #1A120E)',
      }}
    >
      {/* Highlighted Section Header: Title, Subtitle & GitHub Profile Button */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5 px-0.5">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-md text-[#FAF6F0] shrink-0 shadow-2xs"
              style={{ backgroundColor: 'var(--lh-primary-text, #1A120E)' }}
            >
              <BrandIcon platform="github" className="w-3.5 h-3.5" />
            </span>
            <h2
              id="dev-activity-heading"
              className="font-ibm-mono text-[11px] sm:text-xs font-bold uppercase tracking-[0.11em] whitespace-nowrap"
              style={{ color: 'var(--lh-primary-text, #1A120E)' }}
            >
              {title}
            </h2>
          </div>
          <p
            className="font-manrope text-xs font-medium leading-relaxed"
            style={{ color: 'var(--lh-secondary-surface, #3A2418)' }}
          >
            {subtitle}
          </p>
        </div>

        {/* GitHub Profile / Repo Link Button */}
        {cleanUser && (
          <a
            href={resolvedProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open @${cleanUser}${resolvedRepo ? `/${resolvedRepo}` : ''} on GitHub`}
            className="inline-flex items-center gap-1.5 self-start sm:self-center px-3 py-2 sm:px-2.5 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-xl bg-[#1A120E] hover:bg-[#3A2418] text-[#FAF6F0] border border-[#6B4A2E]/40 text-xs font-manrope font-semibold shadow-xs transition-all duration-150 hover:-translate-y-0.5 shrink-0 max-w-full"
          >
            <BrandIcon platform="github" className="w-3.5 h-3.5 opacity-90 shrink-0" />
            <span className="font-ibm-mono text-[11px] tracking-tight max-w-[215px] sm:max-w-[235px] truncate">
              @{cleanUser}
              {resolvedRepo ? `/${resolvedRepo}` : ''}
            </span>
            <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
          </a>
        )}
      </div>

      {/* Heatmap Container Card */}
      <div
        ref={wrapperRef}
        className="w-full max-w-full rounded-xl p-2.5 sm:p-3 border shadow-xs space-y-3 overflow-hidden"
        style={{
          backgroundColor: 'var(--lh-inner-card-bg, #FAF6F0)',
          borderColor: 'var(--lh-border-color, #D5C4AE)',
        }}
      >
        {/* Top Technical Metadata Bar with Year Switcher or Repo Badge */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b"
          style={{ borderColor: 'var(--lh-border-color, #D5C4AE)' }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                status === 'loading' ? 'animate-pulse' : ''
              }`}
              style={{ backgroundColor: 'var(--lh-accent-secondary, #A88462)' }}
            />
            <span
              className="font-ibm-mono text-[11px] font-bold truncate"
              style={{ color: 'var(--lh-primary-text, #1A120E)' }}
            >
              {status === 'unconfigured'
                ? 'Not connected'
                : status === 'loading'
                ? isRepoMode
                  ? `Syncing ${cleanUser}/${resolvedRepo}...`
                  : `Syncing ${selectedYear === 'last' ? 'last 12m' : selectedYear}...`
                : status === 'error'
                ? 'GitHub API error'
                : periodLabel}
            </span>

            {summary && status === 'ready' && (
              <span
                className="font-ibm-mono text-[11px] font-semibold hidden sm:inline"
                style={{ color: 'var(--lh-accent-primary, #6B4A2E)' }}
              >
                · {summary.activeDays} active {summary.activeDays === 1 ? 'day' : 'days'}
              </span>
            )}
          </div>

          {isRepoMode ? (
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-ibm-mono text-[10px] font-semibold shrink-0 ml-auto border"
              style={{
                backgroundColor: 'var(--lh-card-bg, #F4EDE2)',
                borderColor: 'var(--lh-border-color, #D5C4AE)',
                color: 'var(--lh-secondary-surface, #3A2418)',
              }}
            >
              <GitBranch className="w-3 h-3" />
              <span>
                {cleanUser}/{resolvedRepo}
              </span>
            </div>
          ) : (
            <div
              role="group"
              aria-label="Select contribution year"
              className="inline-flex items-center gap-0.5 p-0.5 rounded-lg shrink-0 ml-auto border"
              style={{
                backgroundColor: 'var(--lh-card-bg, #F4EDE2)',
                borderColor: 'var(--lh-border-color, #D5C4AE)',
              }}
            >
              {availableYears.map((yr) => {
                const isSelected = selectedYear === yr;
                const label = yr === 'last' ? 'Last 12M' : String(yr);
                return (
                  <button
                    key={String(yr)}
                    type="button"
                    onClick={() => setSelectedYear(yr)}
                    aria-pressed={isSelected}
                    className={`px-2.5 py-1.5 sm:px-2 sm:py-0.5 min-h-[34px] sm:min-h-0 rounded-md font-ibm-mono text-[10px] sm:text-[11px] font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'text-[#FAF6F0] shadow-2xs'
                        : 'hover:opacity-80'
                    }`}
                    style={
                      isSelected
                        ? { backgroundColor: 'var(--lh-secondary-surface, #3A2418)' }
                        : { color: 'var(--lh-accent-primary, #6B4A2E)' }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Unconfigured State */}
        {status === 'unconfigured' && (
          <div className="rounded-xl bg-[#F4EDE2] border border-dashed border-[#D5C4AE] p-4 text-center space-y-1">
            <p className="font-manrope text-xs font-bold text-[#1A120E]">
              GitHub activity is not connected yet
            </p>
            <p className="font-ibm-mono text-[11px] text-[#5C3D24]">
              Add a GitHub username or repository (owner/repo) in Studio to display live contributions.
            </p>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <div
            role="alert"
            className="rounded-xl bg-[#F4EDE2] border border-[#D5C4AE] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-[#6B4A2E] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-manrope text-xs font-bold text-[#1A120E]">
                  Unable to load GitHub contribution heatmap
                </p>
                <p className="font-ibm-mono text-[11px] text-[#5C3D24]">
                  {errorMessage}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:px-3 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-lg bg-[#3A2418] hover:bg-[#1A120E] text-[#FAF6F0] font-ibm-mono text-[11px] font-semibold transition-colors cursor-pointer self-start sm:self-center shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Loading State Indicator */}
        {status === 'loading' && (
          <div
            aria-live="polite"
            className="flex items-center gap-2 py-1 text-xs text-[#6B4A2E] font-ibm-mono"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#A88462]" />
            <span>
              {isRepoMode
                ? `Fetching live commit activity for ${cleanUser}/${resolvedRepo}...`
                : `Fetching ${selectedYear === 'last' ? 'last 12 months' : selectedYear} contributions for @${cleanUser}...`}
            </span>
          </div>
        )}

        {/* Live Repository Commit Heatmap (supports personal & organization repos) */}
        {status === 'ready' && isRepoMode && repoWeeks.length > 0 && (
          <div className="w-full space-y-2.5" data-testid="repo-commit-heatmap">
            <div className="w-full overflow-x-auto pb-1">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-auto block select-none"
                role="img"
                aria-label={`52-week commit activity heatmap for ${cleanUser}/${resolvedRepo}`}
                onMouseLeave={() => setHoveredDay(null)}
              >
                {/* Weekday Labels (Mon, Wed, Fri) */}
                {[
                  { label: 'Mon', row: 1 },
                  { label: 'Wed', row: 3 },
                  { label: 'Fri', row: 5 },
                ].map((item) => (
                  <text
                    key={item.label}
                    x={0}
                    y={svgTopOffset + item.row * svgStep + svgCellSize - 1}
                    fontSize={8}
                    fontFamily="'IBM Plex Mono', monospace"
                    fill="#6B4A2E"
                    opacity={0.92}
                  >
                    {item.label}
                  </text>
                ))}

                {/* Month Headers */}
                {repoWeeks.map((week, colIdx) =>
                  week.monthLabel ? (
                    <text
                      key={`m-${colIdx}-${week.monthLabel}`}
                      x={svgLeftOffset + colIdx * svgStep}
                      y={9}
                      fontSize={8}
                      fontFamily="'IBM Plex Mono', monospace"
                      fill="#4A3324"
                      opacity={0.95}
                    >
                      {week.monthLabel}
                    </text>
                  ) : null
                )}

                {/* 52 Weeks x 7 Days Commit Squares */}
                {repoWeeks.map((week, colIdx) =>
                  week.days.map((day, rowIdx) => {
                    if (!day) return null;
                    const fill = activePalette[day.level] ?? activePalette[0];
                    const tooltipText = formatRepoCommitTooltip(day);
                    return (
                      <rect
                        key={day.date}
                        x={svgLeftOffset + colIdx * svgStep}
                        y={svgTopOffset + rowIdx * svgStep}
                        width={svgCellSize}
                        height={svgCellSize}
                        rx={1.5}
                        ry={1.5}
                        fill={fill}
                        stroke="rgba(58, 36, 24, 0.14)"
                        strokeWidth={0.5}
                        className="cursor-pointer transition-opacity hover:opacity-80"
                        onMouseEnter={() => setHoveredDay(day)}
                      >
                        <title>{tooltipText}</title>
                      </rect>
                    );
                  })
                )}
              </svg>
            </div>

            {/* Footer Metadata: Total Count / Hover Readout + Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-ibm-mono">
              <span className="text-[#4A3324]">
                {hoveredDay ? (
                  <strong className="text-[#1A120E]">
                    {formatRepoCommitTooltip(hoveredDay)}
                  </strong>
                ) : (
                  <>
                    <strong className="text-[#1A120E]">
                      {summary?.totalContributions ?? 0}
                    </strong>{' '}
                    {repoSourceKind === 'stats'
                      ? 'commits in the last 52 weeks'
                      : 'recent commits indexed'}
                  </>
                )}
              </span>

              <div className="inline-flex items-center gap-1 text-[#6B4A2E]">
                <span className="text-[10px]">Less</span>
                {[0, 1, 2, 3, 4].map((lvl) => (
                  <span
                    key={lvl}
                    className="inline-block w-2.5 h-2.5 rounded-[2px] border border-[#3A2418]/15"
                    style={{ backgroundColor: activePalette[lvl] }}
                    title={`Intensity level ${lvl} of 4`}
                  />
                ))}
                <span className="text-[10px]">More</span>
              </div>
            </div>
          </div>
        )}

        {/* Live Interactive Personal GitHub Calendar */}
        {status !== 'error' && cleanUser && !isRepoMode && (
          <div className="github-activity-calendar-wrapper w-full max-w-full">
            <GitHubCalendar
              key={`${cleanUser}-${selectedYear}-${retrySeed}`}
              username={cleanUser}
              year={selectedYear}
              colorScheme="light"
              theme={{ light: activePalette, dark: activePalette }}
              blockSize={blockSize}
              blockMargin={blockMargin}
              blockRadius={2}
              fontSize={fontSize}
              showMonthLabels={true}
              showWeekdayLabels={WEEKDAY_LABELS}
              showTotalCount={true}
              showColorLegend={true}
              labels={
                selectedYear === 'last'
                  ? CALENDAR_LABELS_LAST_YEAR
                  : CALENDAR_LABELS_SPECIFIC_YEAR
              }
              tooltips={CALENDAR_TOOLTIPS}
              errorMessage={`Unable to load GitHub contributions for @${cleanUser}.`}
            />
          </div>
        )}
      </div>
    </section>
  );
});


import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import {
  Pin,
  Play,
  Pause,
  MapPin,
  ArrowUpRight,
  Volume2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  sortAndFilterLinks,
  paginateLinksWithShowAll,
  extractAvailableCategories,
  type LinkCardItem,
} from '../utils/hubLogic';
import type { FeaturedSongConfig } from '../data/profileData';
import { CardPreviewGraphic } from './CardPreviewGraphic';

const LazyPublicMapBlock = lazy(() =>
  import('./GoogleMapView').then((m) => ({
    default: (props: {
      coords: { lat: number; lng: number } | null;
      zoom: number;
      title: string;
      overlayLabel: string;
      subtitle: string;
      gmpQuotaExceeded: boolean;
      locationLabel: string;
    }) => (
      <m.PublicGoogleMapShowcase
        coords={props.coords}
        zoom={props.zoom}
        title={props.title}
        overlayLabel={props.overlayLabel}
        subtitle={props.subtitle}
        gmpQuotaExceeded={props.gmpQuotaExceeded}
        fallbackGraphic={
          <m.PageoDarkMapSvg
            displayMapLabel={props.overlayLabel}
            locationLabel={props.locationLabel}
          />
        }
      />
    ),
  }))
);
import {
  buildGoogleMapsExternalUrl,
  buildOpenStreetMapExternalUrl,
  formatCoordinatesLabel,
  hasAnyMapLocationData,
  resolveProfileCoordinates,
} from '../utils/mapLocation';

const EMPTY_FEATURED_SONG: FeaturedSongConfig = {
  type: 'Song',
  title: '',
  artist: '',
  bpm: 0,
  keySignature: '',
  platforms: [],
};

interface LinkBentoSectionProps {
  links: LinkCardItem[];
  customCategories?: string[];
  location: string;
  mapLabel?: string;
  coordinates?: string;
  googleMapsUrl?: string;
  mapLat?: number | null;
  mapLng?: number | null;
  mapZoom?: number;
  gmpQuotaExceeded?: boolean;
  featuredSong?: FeaturedSongConfig;
  showSongCard?: boolean;
  showMapCard?: boolean;
  onTogglePin?: (id: string) => void;
  onRecordClick?: (id: string) => void;
}

export const LinkBentoSection: React.FC<LinkBentoSectionProps> = React.memo(({
  links,
  customCategories = [],
  location,
  mapLabel = '',
  coordinates = '',
  googleMapsUrl = '',
  mapLat = null,
  mapLng = null,
  mapZoom = 13,
  gmpQuotaExceeded = false,
  featuredSong = EMPTY_FEATURED_SONG,
  showSongCard = false,
  showMapCard = false,
  onRecordClick,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showAllLinks, setShowAllLinks] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [mapInView, setMapInView] = useState(false);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (mapInView) return;
    const node = mapSectionRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setMapInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMapInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mapInView, showMapCard]);

  const dynamicCategories = extractAvailableCategories(links, customCategories);
  const activeFilter =
    categoryFilter === 'all' || dynamicCategories.some((c) => c.id === categoryFilter)
      ? categoryFilter
      : 'all';

  const sortedLinks = sortAndFilterLinks(links, activeFilter);
  const { visibleLinks, hasMore, totalCount, hiddenCount } = paginateLinksWithShowAll(
    sortedLinks,
    showAllLinks,
    4
  );

  const stopAudioPreview = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => { });
      audioCtxRef.current = null;
    }
    setIsPlayingPreview(false);
  };

  const toggleAudioPreview = () => {
    if (isPlayingPreview) {
      stopAudioPreview();
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      const chords = [
        [174.61, 207.65, 261.63, 311.13], // Fm7
        [155.56, 196.0, 233.08, 293.66],  // EbMaj7
        [138.59, 174.61, 207.65, 261.63], // DbMaj7
        [130.81, 164.81, 196.0, 246.94],  // CMaj7
      ];
      let step = 0;

      const playChord = () => {
        if (!audioCtxRef.current) return;
        const now = audioCtxRef.current.currentTime;
        const freqs = chords[step % chords.length];
        freqs.forEach((f) => {
          if (!audioCtxRef.current) return;
          const osc = audioCtxRef.current.createOscillator();
          const gain = audioCtxRef.current.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, now);
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.exponentialRampToValueAtTime(0.035, now + 0.15);
          gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.4);
          osc.connect(gain);
          gain.connect(audioCtxRef.current.destination);
          osc.start(now);
          osc.stop(now + 1.45);
        });
        step++;
      };

      playChord();
      intervalRef.current = window.setInterval(playChord, 1500);
      setIsPlayingPreview(true);
    } catch {
      setIsPlayingPreview(false);
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => { });
    };
  }, []);

  const songPlatformsWithUrls = (featuredSong.platforms || []).filter((p) => p.url && p.url.trim());
  const hasSongContent = Boolean(
    featuredSong.title.trim() || featuredSong.artist.trim() || songPlatformsWithUrls.length > 0
  );
  const mapLocationPayload = {
    location,
    mapLabel,
    coordinates,
    googleMapsUrl,
    mapLat,
    mapLng,
    mapZoom,
  };
  const resolvedCoords = resolveProfileCoordinates(mapLocationPayload);
  const hasMapContent = hasAnyMapLocationData(mapLocationPayload);
  const displayCoordsLabel =
    coordinates.trim() ||
    (resolvedCoords ? formatCoordinatesLabel(resolvedCoords.lat, resolvedCoords.lng) : '');
  const displayMapLabel = (mapLabel || location || displayCoordsLabel || 'LOCATION')
    .trim()
    .toUpperCase();
  const outboundGoogleMapsUrl = buildGoogleMapsExternalUrl(mapLocationPayload);
  const outboundOsmUrl = buildOpenStreetMapExternalUrl(mapLocationPayload);

  return (
    <div className="space-y-6">
      {/* MY LINKS SECTION */}
      <section aria-labelledby="my-links-heading" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2
            id="my-links-heading"
            className="text-xs font-bold tracking-tight"
            style={{ color: 'var(--lh-primary-text, #1A120E)' }}
          >
            My links
          </h2>

          {/* Interactive filter segmented buttons (built-in + custom categories) */}
          {links.length > 0 && (
            <div
              className="flex flex-nowrap sm:flex-wrap items-center gap-1.5 sm:gap-1 p-1 sm:p-0.5 rounded-xl sm:rounded-lg overflow-x-auto no-scrollbar max-w-full"
              style={{
                backgroundColor: 'var(--lh-card-bg, #EAE0D3)',
                borderColor: 'var(--lh-border-color, #D5C4AE)',
                borderWidth: '1px',
              }}
              role="group"
              aria-label="Filter links by category"
            >
              {[
                { id: 'all', label: 'All' },
                ...dynamicCategories.map((c) => ({ id: c.id, label: c.label })),
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setCategoryFilter(tab.id);
                    setShowAllLinks(false);
                  }}
                  aria-pressed={activeFilter === tab.id}
                  className={`px-3 py-1.5 sm:px-2 sm:py-0.5 min-h-[38px] sm:min-h-0 text-xs sm:text-[11px] font-semibold sm:font-medium rounded-lg sm:rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${activeFilter === tab.id ? 'text-[#FAF6F0] shadow-xs' : 'hover:opacity-80'
                    }`}
                  style={
                    activeFilter === tab.id
                      ? { backgroundColor: 'var(--lh-secondary-surface, #3A2418)' }
                      : { color: 'var(--lh-accent-primary, #6B4A2E)' }
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 2x2 Bento Grid of Link Cards OR Clean Empty State */}
        {links.length === 0 ? (
          <div
            className="p-5 rounded-2xl border border-dashed text-center space-y-1"
            style={{
              backgroundColor: 'var(--lh-inner-card-bg, #FAF6F0)',
              borderColor: 'var(--lh-border-color, #D5C4AE)',
            }}
          >
            <p
              className="text-xs font-semibold"
              style={{ color: 'var(--lh-primary-text, #1A120E)' }}
            >
              No links published yet
            </p>
            <p
              className="text-[11px] opacity-80"
              style={{ color: 'var(--lh-secondary-surface, #3A2418)' }}
            >
              Projects, products, and featured links added in Studio will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleLinks.map((item) => (
              <div key={item.id} className="relative group">
                {item.pinned && (
                  <div
                    role="img"
                    title="Primary link"
                    aria-label="Primary link"
                    className="absolute -top-1.5 -right-1.5 z-20 w-6 h-6 rounded-full text-[#FAF6F0] flex items-center justify-center shadow-md"
                    style={{
                      backgroundColor: 'var(--lh-secondary-surface, #3A2418)',
                      borderColor: 'var(--lh-accent-secondary, #A88462)',
                      borderWidth: '1px',
                    }}
                  >
                    <Pin className="w-3 h-3 opacity-90 rotate-45" />
                  </div>
                )}

                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onRecordClick?.(item.id)}
                  className="flex flex-col h-full p-2.5 rounded-2xl shadow-xs hover:shadow-md transition-all duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    backgroundColor: 'var(--lh-inner-card-bg, #FAF6F0)',
                    borderColor: 'var(--lh-border-color, #D5C4AE)',
                    borderWidth: '1px',
                  }}
                >
                  <CardPreviewGraphic
                    type={item.previewType}
                    thumbnailUrl={item.thumbnailUrl}
                    autoThumbnailUrl={item.autoThumbnailUrl}
                    title={item.title}
                  />

                  <div className="pt-2.5 px-1 pb-1 space-y-1 flex-1 flex flex-col">
                    <p
                      className="text-xs font-bold line-clamp-1 transition-colors"
                      style={{ color: 'var(--lh-primary-text, #1A120E)' }}
                    >
                      {item.title}
                    </p>
                    <p
                      className="text-xs sm:text-[11px] font-mono font-semibold truncate"
                      style={{ color: 'var(--lh-secondary-surface, #3A2418)' }}
                    >
                      {item.displayUrl}
                    </p>
                    <p
                      className="text-xs sm:text-[11px] font-medium line-clamp-2 leading-relaxed pt-0.5"
                      style={{ color: 'var(--lh-primary-text, #2D1C12)', opacity: 0.85 }}
                    >
                      {item.description}
                    </p>
                  </div>
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Top 4 cap + Show all toggle button */}
        {hasMore && (
          <div className="flex justify-center pt-0.5">
            <button
              type="button"
              onClick={() => setShowAllLinks((prev) => !prev)}
              aria-expanded={showAllLinks}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold shadow-2xs transition-all duration-150 hover:opacity-90 active:scale-[0.99] cursor-pointer"
              style={{
                backgroundColor: 'var(--lh-inner-card-bg, #FAF6F0)',
                borderColor: 'var(--lh-border-color, #B89B7E)',
                color: 'var(--lh-primary-text, #1A120E)',
              }}
            >
              <span>
                {showAllLinks ? 'Show top 4 only' : 'Show all'}
              </span>
              <span
                className="px-2 py-0.5 rounded-md font-ibm-mono text-[10px] font-bold"
                style={{
                  backgroundColor: 'var(--lh-card-bg, #F4EDE2)',
                  color: 'var(--lh-secondary-surface, #3A2418)',
                }}
              >
                {showAllLinks ? `Showing ${totalCount}` : `+${hiddenCount} more · ${totalCount} total`}
              </span>
              {showAllLinks ? (
                <ChevronUp className="w-4 h-4 opacity-80" />
              ) : (
                <ChevronDown className="w-4 h-4 opacity-80" />
              )}
            </button>
          </div>
        )}

        {/* Song / Music Release Card */}
        {showSongCard && hasSongContent && (
          <div
            className="p-3.5 rounded-2xl shadow-xs space-y-3"
            style={{
              backgroundColor: 'var(--lh-inner-card-bg, #FAF6F0)',
              borderColor: 'var(--lh-border-color, #B89B7E)',
              borderWidth: '1px',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* Album Art */}
                <div
                  className="w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 relative overflow-hidden shadow-xs"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--lh-secondary-surface, #3A2418), var(--lh-accent-primary, #6B4A2E))',
                    borderColor: 'var(--lh-accent-secondary, #A88462)',
                    borderWidth: '1px',
                  }}
                >
                  <div className="w-4 h-4 rounded-full border border-[#FAF6F0]/60 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#D5C4AE]" />
                  </div>
                  <span className="text-[7px] font-mono text-[#FAF6F0] font-semibold mt-0.5 truncate max-w-[40px]">
                    {featuredSong.artist || 'AUDIO'}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="text-[10px] text-[#3A2418] font-bold uppercase tracking-wider">
                    {featuredSong.type || 'Song'}
                  </div>
                  {featuredSong.title && (
                    <div className="text-xs font-bold text-[#1A120E] truncate">
                      {featuredSong.title}
                    </div>
                  )}
                  {featuredSong.artist && (
                    <div className="text-[11px] font-semibold text-[#3A2418]">
                      {featuredSong.artist}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={toggleAudioPreview}
                aria-label={isPlayingPreview ? 'Pause synth preview' : 'Preview synth loop'}
                className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 min-h-[42px] sm:min-h-0 rounded-xl text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${isPlayingPreview
                  ? 'bg-[#3A2418] text-[#FAF6F0] border-[#3A2418]'
                  : 'bg-[#F3ECE1] text-[#3A2418] border-[#D5C4AE] hover:border-[#A88462]'
                  }`}
              >
                {isPlayingPreview ? (
                  <>
                    <Pause className="w-3.5 h-3.5 sm:w-3 sm:h-3 fill-current" />
                    <span>Stop preview</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                    <span>Preview audio</span>
                  </>
                )}
              </button>
            </div>

            {songPlatformsWithUrls.length > 0 && (
              <ul className="rounded-xl bg-[#F4EDE2]/75 border border-[#D5C4AE] divide-y divide-[#D5C4AE]/70">
                {songPlatformsWithUrls.map((platform) => (
                  <li key={platform.id}>
                    <a
                      href={platform.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Play ${featuredSong.title || 'track'} on ${platform.name}`}
                      className="flex items-center justify-between px-3 py-3 sm:py-2.5 min-h-[48px] hover:bg-[#EAE0D3]/70 transition-colors first:rounded-t-xl last:rounded-b-xl group"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-6 h-6 sm:w-5 sm:h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${platform.name === 'Spotify'
                            ? 'bg-[#6B4A2E] text-[#FAF6F0]'
                            : platform.name === 'Apple Music'
                              ? 'bg-[#A88462] text-[#1A120E]'
                              : 'bg-[#3A2418] text-[#D5C4AE]'
                            }`}
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                        </span>
                        <span className="text-xs font-semibold text-[#1A120E]">
                          {platform.name}
                        </span>
                      </div>

                      <span className="px-3.5 py-1.5 sm:px-3 sm:py-1 rounded-full border border-[#D5C4AE] bg-[#FAF6F0] text-[11px] font-semibold text-[#3A2418] group-hover:border-[#6B4A2E] group-hover:bg-[#3A2418] group-hover:text-[#FAF6F0] transition-colors">
                        Play
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {showMapCard && hasMapContent && (
        <>
          {/* Hairline Dashed Divider */}
          <div
            className="border-t border-dashed"
            style={{ borderColor: 'var(--lh-border-color, #C7B49E)' }}
          />

          {/* PAGEO-STYLE DARK STREET MAP + LIVE GOOGLE MAP SHOWCASE CARD */}
          <section
            ref={mapSectionRef}
            aria-label="Location map"
            className="rounded-2xl overflow-hidden border shadow-xs"
            style={{
              backgroundColor: 'var(--lh-inner-card-bg, #FAF6F0)',
              borderColor: 'var(--lh-border-color, #D5C4AE)',
            }}
          >
            {mapInView ? (
              <Suspense
                fallback={
                  <div className="w-full h-[210px] sm:h-[224px] bg-[#281810] animate-pulse" />
                }
              >
                <LazyPublicMapBlock
                  coords={resolvedCoords}
                  zoom={mapZoom}
                  title={location.trim() || mapLabel.trim() || 'Pinned Location'}
                  overlayLabel={displayMapLabel}
                  subtitle={displayCoordsLabel}
                  gmpQuotaExceeded={gmpQuotaExceeded}
                  locationLabel={location}
                />
              </Suspense>
            ) : (
              <div className="w-full h-[210px] sm:h-[224px] bg-[#281810]" />
            )}

            <div
              className="p-3.5 sm:px-4 sm:py-3.5 border-t space-y-2"
              style={{
                backgroundColor: 'var(--lh-inner-card-bg, #FAF6F0)',
                borderColor: 'var(--lh-border-color, #D5C4AE)',
              }}
            >
              {(location.trim() || mapLabel.trim()) && (
                <div
                  className="flex items-center gap-2 text-xs sm:text-[13px] font-medium min-w-0"
                  style={{ color: 'var(--lh-primary-text, #1A120E)' }}
                >
                  <MapPin
                    className="w-3.5 h-3.5 shrink-0 opacity-70"
                    style={{ color: 'var(--lh-secondary-surface, #3A2418)' }}
                  />
                  <span className="truncate">
                    {location.trim() || mapLabel.trim()}
                  </span>
                </div>
              )}

              {(outboundGoogleMapsUrl || outboundOsmUrl) && (
                <div
                  className="flex flex-wrap items-center gap-4 text-xs sm:text-[11.5px] font-medium"
                  style={{ color: 'var(--lh-secondary-surface, #3A2418)' }}
                >
                  {outboundGoogleMapsUrl && (
                    <a
                      href={outboundGoogleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-0 px-2.5 py-1.5 sm:px-0 sm:py-0 rounded-lg bg-[#F4EDE2] sm:bg-transparent hover:opacity-80 transition-opacity"
                    >
                      {/* Authentic 4-Color Google Maps Pin Icon */}
                      <svg
                        viewBox="0 0 24 24"
                        className="w-3.5 h-3.5 shrink-0"
                        aria-hidden="true"
                      >
                        <path
                          fill="#EA4335"
                          d="M12 2C8.13 2 5 5.13 5 9c0 1.74.5 3.37 1.41 4.84.95 1.54 2.2 2.86 3.16 4.4.47.75.81 1.45 1.17 2.26.26.55.47 1.5 1.26 1.5s1-.95 1.26-1.5c.37-.81.7-1.51 1.17-2.26.96-1.53 2.21-2.85 3.16-4.4C18.5 12.37 19 10.74 19 9c0-3.87-3.13-7-7-7z"
                        />
                        <path
                          fill="#4285F4"
                          d="M12 2c3.87 0 7 3.13 7 7 0 1.74-.5 3.37-1.41 4.84L12 9V2z"
                        />
                        <path
                          fill="#FBBC04"
                          d="M5 9c0 1.74.5 3.37 1.41 4.84L12 9H5z"
                        />
                        <path
                          fill="#34A853"
                          d="M6.41 13.84c.95 1.54 2.2 2.86 3.16 4.4L17.59 13.84 12 9l-5.59 4.84z"
                        />
                        <circle cx="12" cy="9" r="2.6" fill="#FFFFFF" />
                      </svg>
                      <span>Google Maps</span>
                      <ArrowUpRight className="w-3 h-3 opacity-75" />
                    </a>
                  )}

                  {outboundOsmUrl && (
                    <a
                      href={outboundOsmUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-0 px-2.5 py-1.5 sm:px-0 sm:py-0 rounded-lg bg-[#F4EDE2] sm:bg-transparent hover:opacity-80 transition-opacity"
                    >
                      {/* OpenStreetMap Magnifier Icon */}
                      <svg
                        viewBox="0 0 24 24"
                        className="w-3.5 h-3.5 shrink-0"
                        aria-hidden="true"
                      >
                        <circle cx="10.5" cy="10.5" r="7.5" fill="#7EBC6F" stroke="#2E6B34" strokeWidth="1.5" />
                        <path d="M5 10.5h11M10.5 5v11" stroke="#FAF6F0" strokeWidth="1.5" />
                        <path d="M16 16l5 5" stroke="#4B5563" strokeWidth="2.4" strokeLinecap="round" />
                      </svg>
                      <span>OpenStreetMap</span>
                      <ArrowUpRight className="w-3 h-3 opacity-75" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
});

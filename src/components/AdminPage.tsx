import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Save,
  RotateCcw,
  User,
  GitBranch,
  Link2,
  Share2,
  FileText,
  Palette,
  Inbox,
  Plus,
  Trash2,
  Pin,
  ArrowUp,
  ArrowDown,
  Check,
  Copy,
  Download,
  Sparkles,
  Music,
  MapPin,
  Upload,
  Image as ImageIcon,
  BarChart3,
  Wrench,
  Coffee,
  Tag,
  X,
  Fingerprint,
  Crop,
} from 'lucide-react';
import {
  DEFAULT_SITE_CONFIG,
  SAVED_DESIGN_SYSTEM,
  DEFAULT_AVATAR_DATA_URI,
  type SiteConfigState,
  type SocialPlatform,
  type SocialLink,
  type BlogPost,
} from '../data/profileData';
import {
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Layers,
  ShieldCheck,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  parseGitHubRepoOrUserInput,
  extractAvailableCategories,
  normalizeCategoryId,
  formatCategorySingularLabel,
  addOrRestoreCategoryEntry,
  deleteCategoryFromEntriesAndLinks,
  ADMIN_WORKSPACE_GROUPS,
  getWorkspaceGroupForTab,
  computeWorkspaceGroupBadges,
  type LinkCardItem,
  type AdminWorkspaceGroupId,
} from '../utils/hubLogic';
import {
  deriveLinkTitleFromUrl,
  fetchLinkPreviewClientSide,
  resolveCardPreviewDisplay,
  validatePreviewTargetUrl,
  type LinkPreviewMetadata,
  type LinkPreviewType,
} from '../utils/linkPreview';
import { CardPreviewGraphic } from './CardPreviewGraphic';
import { GitHubActivity } from './GitHubActivity';
import type { StoredMessage } from './SubViewsAndModals';
import { BrandIcon } from './SocialIcons';
import {
  formatBytes,
  triggerBrowserDownload,
  type MediaAssetCategory,
} from '../utils/mediaAndZip';
import {
  deleteMediaFromFirebaseStorage,
  uploadCompressedMediaToFirebaseStorage,
  persistFullHubToFirestore,
  type FirestoreAnalyticsRecord,
  type AdminSubscriberRecord,
} from '../services/firebaseHubService';
import {
  PANTONE_INSTITUTE_CATALOG,
  resolvePantoneFromColorCode,
  normalizeHexColorCode,
  computeLinkAnalyticsReport,
  auditDeveloperLinkHealth,
} from '../utils/pantoneAndAnalytics';
import {
  AdminAnalyticsTab,
  AdminDevToolsTab,
  AdminMessagesTab,
} from './AdminInsightsTabs';
import { LogOut, Lock } from 'lucide-react';
import { BiometricSecurityTab } from './BiometricSecurityTab';
import { ImageCropModal, type CropSessionRequest } from './ImageCropModal';
import type { AdminPasskeyRecord } from '../utils/biometricAuth';
import { AdminGoogleMapPicker, PageoDarkMapSvg } from './GoogleMapView';
import {
  buildGoogleMapsExternalUrl,
  buildOpenStreetMapExternalUrl,
  formatCoordinatesLabel,
  hasAnyMapLocationData,
  parseCoordinatesInput,
  parseGoogleMapsUrl,
  resolveProfileCoordinates,
} from '../utils/mapLocation';

export type AdminTab =
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

export interface AdminPageProps {
  config: SiteConfigState;
  ownerUid: string;
  ownerEmail: string;
  knownCloudLinkIds: string[];
  analyticsEvents: FirestoreAnalyticsRecord[];
  messages: StoredMessage[];
  subscribers: AdminSubscriberRecord[];
  passkeys: AdminPasskeyRecord[];
  biometricLockEnabled: boolean;
  gmpQuotaExceeded?: boolean;
  onToggleBiometricLock: (enabled: boolean) => void;
  onLockStudio: () => void;
  onUpdateConfig: (next: SiteConfigState) => void;
  onUpdateKnownCloudLinkIds: (ids: string[]) => void;
  onDeleteMessage: (id: string) => void;
  onToggleMessageRead: (id: string, nextRead: boolean) => void;
  onSignOut: () => Promise<void>;
  onBackToHub: () => void;
}

const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'x',
  'github',
  'medium',
  'linkedin',
  'stackoverflow',
  'instagram',
  'spotify',
  'soundcloud',
];

export const AdminPage: React.FC<AdminPageProps> = ({
  config,
  ownerUid,
  ownerEmail,
  knownCloudLinkIds,
  analyticsEvents,
  messages,
  subscribers,
  passkeys,
  biometricLockEnabled,
  gmpQuotaExceeded = false,
  onToggleBiometricLock,
  onLockStudio,
  onUpdateConfig: commitLocalConfig,
  onUpdateKnownCloudLinkIds,
  onDeleteMessage,
  onToggleMessageRead,
  onSignOut,
  onBackToHub,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('profile');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [cropSession, setCropSession] = useState<CropSessionRequest | null>(null);
  const [savingToCloud, setSavingToCloud] = useState(false);
  const [showMobileMoreMenu, setShowMobileMoreMenu] = useState(false);
  const [showAddLinkForm, setShowAddLinkForm] = useState(() => config.links.length === 0);
  const [expandedLinkIds, setExpandedLinkIds] = useState<Record<string, boolean>>({});
  const [showAddPostForm, setShowAddPostForm] = useState(() => config.posts.length === 0);
  const [expandedPostSlugs, setExpandedPostSlugs] = useState<Record<string, boolean>>({});

  // New Link form state
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkDisplayUrl, setNewLinkDisplayUrl] = useState('');
  const [newLinkDesc, setNewLinkDesc] = useState('');
  const [newLinkCategory, setNewLinkCategory] = useState<string>('project');
  const [creatingNewLinkCategory, setCreatingNewLinkCategory] = useState(false);
  const [newLinkCustomCategoryInput, setNewLinkCustomCategoryInput] = useState('');
  const [customCategoryDraft, setCustomCategoryDraft] = useState('');
  const [editingCategoryLinkId, setEditingCategoryLinkId] = useState<string | null>(null);
  const [editingCategoryDraft, setEditingCategoryDraft] = useState('');
  const [newLinkPreview, setNewLinkPreview] = useState<LinkPreviewType>('auto');
  const [newLinkThumbnailUrl, setNewLinkThumbnailUrl] = useState('');
  const [newLinkAutoThumbnailUrl, setNewLinkAutoThumbnailUrl] = useState('');
  const [newLinkPreviewFetching, setNewLinkPreviewFetching] = useState(false);
  const [newLinkThumbnailPath, setNewLinkThumbnailPath] = useState('');
  const [newLinkPinned, setNewLinkPinned] = useState(false);
  const [fetchingLinkIds, setFetchingLinkIds] = useState<Record<string, boolean>>({});
  const lastFetchedNewUrlRef = useRef<string>('');
  const newLinkFetchedMetaRef = useRef<{ title?: string; description?: string }>({});
  const existingUrlDebounceTimersRef = useRef<Record<string, number>>({});
  const cloudAutoSaveTimerRef = useRef<number | null>(null);
  const linksRef = useRef<LinkCardItem[]>(config.links);
  linksRef.current = config.links;
  const configRef = useRef<SiteConfigState>(config);
  configRef.current = config;
  const knownCloudLinkIdsRef = useRef<string[]>(knownCloudLinkIds);
  knownCloudLinkIdsRef.current = knownCloudLinkIds;

  // New Social form state
  const [newSocialPlatform, setNewSocialPlatform] = useState<SocialPlatform>('x');
  const [newSocialLabel, setNewSocialLabel] = useState('');
  const [newSocialHandle, setNewSocialHandle] = useState('');
  const [newSocialUrl, setNewSocialUrl] = useState('');

  // New Blog Post form state
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostCategory, setNewPostCategory] = useState('Engineering');
  const [newPostReadTime, setNewPostReadTime] = useState('2 min read');
  const [newPostExcerpt, setNewPostExcerpt] = useState('');
  const [newPostBody, setNewPostBody] = useState('');

  // Pantone Color Institute® Quick Theme Switcher input
  const [pantoneInputHex, setPantoneInputHex] = useState(
    config.designSystem.customSeedHex || config.designSystem.canvasBg
  );

  // GitHub repo / user quick-connect input
  const [githubSourceInput, setGithubSourceInput] = useState(
    config.profile.githubRepo
      ? `${config.profile.githubUsername}/${config.profile.githubRepo}`
      : config.profile.githubUsername
  );

  const triggerSavedBanner = (msg = 'All changes saved to live site') => {
    setSaveNotice(msg);
    setTimeout(() => {
      setSaveNotice((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  const persistConfigToCloudNow = async (
    nextConfig: SiteConfigState,
    successMsg?: string
  ): Promise<boolean> => {
    if (cloudAutoSaveTimerRef.current) {
      window.clearTimeout(cloudAutoSaveTimerRef.current);
      cloudAutoSaveTimerRef.current = null;
    }
    configRef.current = nextConfig;
    commitLocalConfig(nextConfig);
    if (!ownerUid) {
      if (successMsg) triggerSavedBanner(successMsg);
      return true;
    }
    setSavingToCloud(true);
    try {
      const nextCloudIds = await persistFullHubToFirestore({
        siteConfig: nextConfig,
        ownerUid,
        knownCloudLinkIds: knownCloudLinkIdsRef.current,
      });
      knownCloudLinkIdsRef.current = nextCloudIds;
      onUpdateKnownCloudLinkIds(nextCloudIds);
      setCloudSyncError(null);
      if (successMsg) {
        triggerSavedBanner(successMsg);
      }
      return true;
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Failed to sync changes to Firestore';
      let friendlyMsg = rawMsg;
      try {
        const parsed = JSON.parse(rawMsg) as { error?: string; path?: string };
        if (parsed?.error) {
          friendlyMsg = parsed.path ? `${parsed.path}: ${parsed.error}` : parsed.error;
        }
      } catch {
        // plain message
      }
      setCloudSyncError(friendlyMsg);
      return false;
    } finally {
      setSavingToCloud(false);
    }
  };

  const scheduleCloudAutoSave = (nextConfig: SiteConfigState) => {
    configRef.current = nextConfig;
    commitLocalConfig(nextConfig);
    if (!ownerUid) return;
    if (cloudAutoSaveTimerRef.current) {
      window.clearTimeout(cloudAutoSaveTimerRef.current);
    }
    cloudAutoSaveTimerRef.current = window.setTimeout(() => {
      cloudAutoSaveTimerRef.current = null;
      void persistConfigToCloudNow(configRef.current);
    }, 900);
  };

  // Route all studio state updates (Profile, Map, Media, Visibility, GitHub, Song, Pantone)
  // through debounced Cloud Firestore auto-save so no edits are ever lost on refresh.
  const onUpdateConfig = (nextConfig: SiteConfigState) => {
    scheduleCloudAutoSave(nextConfig);
  };

  useEffect(() => {
    return () => {
      if (cloudAutoSaveTimerRef.current) {
        window.clearTimeout(cloudAutoSaveTimerRef.current);
      }
    };
  }, []);

  const requestWebsitePreview = async (
    rawUrl: string,
    signal?: AbortSignal
  ): Promise<LinkPreviewMetadata | null> => {
    try {
      return await fetchLinkPreviewClientSide(rawUrl, signal);
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const check = validatePreviewTargetUrl(newLinkUrl);
    if (!check.valid || !check.normalizedUrl) {
      setNewLinkPreviewFetching(false);
      if (!newLinkUrl.trim()) {
        setNewLinkAutoThumbnailUrl('');
        lastFetchedNewUrlRef.current = '';
        newLinkFetchedMetaRef.current = {};
      }
      return;
    }

    const targetUrl = check.normalizedUrl;
    if (lastFetchedNewUrlRef.current === targetUrl) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setNewLinkPreviewFetching(true);
      const data = await requestWebsitePreview(targetUrl, controller.signal);
      if (controller.signal.aborted) return;
      lastFetchedNewUrlRef.current = targetUrl;
      newLinkFetchedMetaRef.current = {
        title: data?.title,
        description: data?.description,
      };
      setNewLinkAutoThumbnailUrl(data?.found && data.imageUrl ? data.imageUrl : '');
      if (data?.title) {
        setNewLinkTitle((prev) => (prev.trim() ? prev : data.title!));
      }
      if (data?.description) {
        setNewLinkDesc((prev) => (prev.trim() ? prev : data.description!));
      }
      setNewLinkPreviewFetching(false);
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [newLinkUrl]);

  const handleManualRefreshNewPreview = async () => {
    const check = validatePreviewTargetUrl(newLinkUrl);
    if (!check.valid || !check.normalizedUrl) {
      triggerSavedBanner('Enter a valid public URL (https://...) first');
      return;
    }
    setNewLinkPreviewFetching(true);
    lastFetchedNewUrlRef.current = '';
    const data = await requestWebsitePreview(check.normalizedUrl);
    lastFetchedNewUrlRef.current = check.normalizedUrl;
    newLinkFetchedMetaRef.current = {
      title: data?.title,
      description: data?.description,
    };
    setNewLinkAutoThumbnailUrl(data?.found && data.imageUrl ? data.imageUrl : '');
    if (data?.title) {
      setNewLinkTitle((prev) => (prev.trim() ? prev : data.title!));
    }
    if (data?.description) {
      setNewLinkDesc((prev) => (prev.trim() ? prev : data.description!));
    }
    setNewLinkPreviewFetching(false);
    triggerSavedBanner(
      data?.found && data.imageUrl
        ? data.cached
          ? 'Loaded cached website preview'
          : 'Fetched website preview image'
        : 'No preview image found — using built-in fallback'
    );
  };

  const fetchPreviewForSavedLink = async (linkId: string, rawUrl: string) => {
    const check = validatePreviewTargetUrl(rawUrl);
    if (!check.valid || !check.normalizedUrl) return;
    setFetchingLinkIds((prev) => ({ ...prev, [linkId]: true }));
    const data = await requestWebsitePreview(check.normalizedUrl);
    setFetchingLinkIds((prev) => ({ ...prev, [linkId]: false }));
    const nextAutoUrl = data?.found && data.imageUrl ? data.imageUrl : '';
    const latestConfig = configRef.current;
    const nextConfig: SiteConfigState = {
      ...latestConfig,
      links: latestConfig.links.map((item) => {
        if (item.id !== linkId) return item;
        const shouldFillDesc =
          (!item.description || item.description === 'Featured resource link.') &&
          Boolean(data?.description);
        return {
          ...item,
          autoThumbnailUrl: nextAutoUrl,
          description: shouldFillDesc ? data!.description! : item.description,
        };
      }),
    };
    await persistConfigToCloudNow(nextConfig);
  };

  const scheduleSavedLinkPreviewFetch = (linkId: string, rawUrl: string) => {
    const existingTimer = existingUrlDebounceTimersRef.current[linkId];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    const check = validatePreviewTargetUrl(rawUrl);
    if (!check.valid) return;
    existingUrlDebounceTimersRef.current[linkId] = window.setTimeout(() => {
      delete existingUrlDebounceTimersRef.current[linkId];
      fetchPreviewForSavedLink(linkId, rawUrl);
    }, 500);
  };

  const updateProfileField = <K extends keyof SiteConfigState['profile']>(
    key: K,
    value: SiteConfigState['profile'][K]
  ) => {
    onUpdateConfig({
      ...config,
      profile: {
        ...config.profile,
        [key]: value,
      },
    });
  };

  const handleLocationInputChange = (nextLocation: string) => {
    const trimmed = nextLocation.trim();
    const shouldAutoFillMapLabel =
      !config.profile.mapLabel.trim() ||
      config.profile.mapLabel.trim() === config.profile.location.trim().toUpperCase();
    onUpdateConfig({
      ...config,
      showMapCard: trimmed ? true : config.showMapCard,
      profile: {
        ...config.profile,
        location: nextLocation,
        mapLabel: shouldAutoFillMapLabel ? trimmed.toUpperCase() : config.profile.mapLabel,
      },
    });
  };

  const handleCoordinatesInputChange = (nextCoordinatesText: string) => {
    const parsed = parseCoordinatesInput(nextCoordinatesText);
    onUpdateConfig({
      ...config,
      showMapCard: parsed ? true : config.showMapCard,
      profile: {
        ...config.profile,
        coordinates: nextCoordinatesText,
        mapLat: parsed ? parsed.lat : config.profile.mapLat,
        mapLng: parsed ? parsed.lng : config.profile.mapLng,
      },
    });
  };

  const handleGoogleMapsUrlChange = (rawUrl: string, showToastOnExtract = false) => {
    const parsed = parseGoogleMapsUrl(rawUrl);
    const extractedPlace = parsed?.placeName?.trim() || '';
    const hasValidCoords =
      parsed !== null &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number';

    const nextLocation =
      extractedPlace && !config.profile.location.trim()
        ? extractedPlace
        : config.profile.location;
    const nextMapLabel =
      extractedPlace && !config.profile.mapLabel.trim()
        ? extractedPlace.split(',')[0].trim().toUpperCase()
        : config.profile.mapLabel;
    const nextCoordsString =
      hasValidCoords && parsed
        ? formatCoordinatesLabel(parsed.lat!, parsed.lng!)
        : config.profile.coordinates;

    onUpdateConfig({
      ...config,
      showMapCard: rawUrl.trim() ? true : config.showMapCard,
      profile: {
        ...config.profile,
        googleMapsUrl: rawUrl,
        location: nextLocation,
        mapLabel: nextMapLabel,
        coordinates: nextCoordsString,
        mapLat: hasValidCoords && parsed ? parsed.lat! : config.profile.mapLat,
        mapLng: hasValidCoords && parsed ? parsed.lng! : config.profile.mapLng,
        mapZoom:
          parsed && typeof parsed.zoom === 'number'
            ? parsed.zoom
            : config.profile.mapZoom || 13,
      },
    });

    if (showToastOnExtract) {
      if (hasValidCoords && parsed) {
        triggerSavedBanner(
          `Extracted coordinates (${parsed.lat}, ${parsed.lng})${
            extractedPlace ? ` · ${extractedPlace}` : ''
          }`
        );
      } else if (extractedPlace) {
        triggerSavedBanner(`Extracted location "${extractedPlace}" from Google Maps link`);
      } else if (rawUrl.trim()) {
        triggerSavedBanner('Saved Google Maps link');
      }
    }
  };

  const handleUseDeviceGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      triggerSavedBanner('Geolocation is not supported in this browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const formatted = formatCoordinatesLabel(lat, lng);
        onUpdateConfig({
          ...config,
          showMapCard: true,
          profile: {
            ...config.profile,
            mapLat: lat,
            mapLng: lng,
            mapZoom: 13,
            coordinates: formatted,
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
          },
        });
        triggerSavedBanner(`Pinned current GPS coordinates (${formatted})`);
      },
      (err) => {
        triggerSavedBanner(err.message || 'Unable to read current GPS location');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleClearLocationData = () => {
    onUpdateConfig({
      ...config,
      showMapCard: false,
      profile: {
        ...config.profile,
        location: '',
        mapLabel: '',
        coordinates: '',
        googleMapsUrl: '',
        mapLat: null,
        mapLng: null,
        mapPlaceId: '',
        mapZoom: 12,
      },
    });
    triggerSavedBanner('Cleared location & map showcase settings');
  };

  const renderLocationMapEditor = (sectionKey: 'profile' | 'links') => {
    const resolvedCoords = resolveProfileCoordinates(config.profile);
    const hasLocation = hasAnyMapLocationData(config.profile);
    const previewMapLabel =
      (config.profile.mapLabel || '').trim() ||
      (config.profile.location || '').trim().toUpperCase() ||
      'YOUR CITY';
    const previewLocationName =
      (config.profile.location || '').trim() ||
      (config.profile.mapLabel || '').trim() ||
      'City / Region';
    const previewCoordsLabel =
      (config.profile.coordinates || '').trim() ||
      (resolvedCoords ? formatCoordinatesLabel(resolvedCoords.lat, resolvedCoords.lng) : '');
    const googleMapsHref = buildGoogleMapsExternalUrl(config.profile);
    const openStreetMapHref = buildOpenStreetMapExternalUrl(config.profile);

    return (
      <div
        data-testid={`admin-location-map-editor-${sectionKey}`}
        className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#B89B7E]/40 pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#3A2418]" />
              <h3 className="font-ibm-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                Location &amp; Google Map Showcase
              </h3>
            </div>
            <p className="text-[11px] font-medium text-[#3A2418] mt-0.5">
              Search a place on Google Maps, paste a Google Maps link, or enter coordinates to showcase a dark Pageo-style map card on your live hub.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasLocation && (
              <button
                type="button"
                onClick={handleClearLocationData}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[11px] font-semibold text-[#6E1414] hover:bg-[#EBDCCB] transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
            <label className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 py-1 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[11.5px] font-bold text-[#1A120E] cursor-pointer">
              <input
                type="checkbox"
                checked={config.showMapCard}
                onChange={(e) =>
                  onUpdateConfig({ ...config, showMapCard: e.target.checked })
                }
                aria-label="Show Location Map card on live hub"
                className="accent-[#3A2418]"
              />
              <span>Show on Live Hub</span>
            </label>
          </div>
        </div>

        {/* Interactive Google Map Picker (Places Autocomplete + Click-to-Pin) */}
        <AdminGoogleMapPicker
          coords={resolvedCoords}
          zoom={config.profile.mapZoom || 13}
          pinLabel={config.profile.location || config.profile.mapLabel || 'Pinned Location'}
          gmpQuotaExceeded={gmpQuotaExceeded}
          onSelectFromMapClick={(lat, lng, zoom) => {
            const formatted = formatCoordinatesLabel(lat, lng);
            onUpdateConfig({
              ...config,
              showMapCard: true,
              profile: {
                ...config.profile,
                coordinates: formatted,
                mapLat: lat,
                mapLng: lng,
                mapZoom: zoom,
                googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
              },
            });
            triggerSavedBanner(`Pinned coordinates on map (${formatted})`);
          }}
          onSelectPlace={(sel) => {
            const formatted = formatCoordinatesLabel(sel.lat, sel.lng);
            const shortCity = sel.placeName.split(',')[0].trim();
            onUpdateConfig({
              ...config,
              showMapCard: true,
              profile: {
                ...config.profile,
                location: sel.placeName,
                mapLabel: (shortCity || sel.placeName).toUpperCase(),
                coordinates: formatted,
                googleMapsUrl: sel.googleMapsUrl,
                mapLat: sel.lat,
                mapLng: sel.lng,
                mapPlaceId: sel.placeId || '',
                mapZoom: sel.zoom || 13,
              },
            });
            triggerSavedBanner(`Pinned ${sel.placeName} (${formatted})`);
          }}
        />

        {/* Google Maps Link + Manual Fields */}
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={`admin-gmaps-url-${sectionKey}`}
                className="block text-[12px] font-bold text-[#1A120E]"
              >
                Google Maps Link (Paste Share URL or Place Link)
              </label>
              <button
                type="button"
                onClick={() =>
                  handleGoogleMapsUrlChange(config.profile.googleMapsUrl || '', true)
                }
                className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#EBDCCB] text-[#1A120E] hover:bg-[#DFCBB5] transition-colors cursor-pointer"
              >
                Extract Pin &amp; Coords
              </button>
            </div>
            <input
              id={`admin-gmaps-url-${sectionKey}`}
              type="url"
              value={config.profile.googleMapsUrl || ''}
              onChange={(e) => handleGoogleMapsUrlChange(e.target.value, false)}
              placeholder="https://www.google.com/maps/place/Gurugram/@28.4595,77.0266,12z"
              className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] text-[#1A120E]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
            <div className="space-y-1">
              <label
                htmlFor={`admin-location-city-${sectionKey}`}
                className="block text-[12px] font-bold text-[#1A120E]"
              >
                Place / City Name (Bottom Pin)
              </label>
              <input
                id={`admin-location-city-${sectionKey}`}
                type="text"
                value={config.profile.location}
                onChange={(e) => handleLocationInputChange(e.target.value)}
                placeholder="e.g. Gurugram"
                className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`admin-location-label-${sectionKey}`}
                className="block text-[12px] font-bold text-[#1A120E]"
              >
                Centered Map Title (Uppercase)
              </label>
              <input
                id={`admin-location-label-${sectionKey}`}
                type="text"
                value={config.profile.mapLabel}
                onChange={(e) => updateProfileField('mapLabel', e.target.value)}
                placeholder="e.g. GURGAON"
                className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1">
                <label
                  htmlFor={`admin-location-coords-${sectionKey}`}
                  className="block text-[12px] font-bold text-[#1A120E]"
                >
                  Coordinates (Lat, Lng)
                </label>
                <button
                  type="button"
                  onClick={handleUseDeviceGps}
                  className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#EBDCCB] text-[#1A120E] hover:bg-[#DFCBB5] transition-colors cursor-pointer"
                >
                  Use GPS
                </button>
              </div>
              <input
                id={`admin-location-coords-${sectionKey}`}
                type="text"
                value={config.profile.coordinates}
                onChange={(e) => handleCoordinatesInputChange(e.target.value)}
                placeholder="e.g. 28.4595° N, 77.0266° E"
                className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
              />
            </div>
          </div>
        </div>

        {/* Live Pageo-Style Dark Map Showcase Preview */}
        <div className="pt-1 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#3A2418]">
              Live Pageo-Style Map Card Preview
            </span>
            <span className="font-ibm-mono text-[10px] font-semibold text-[#3A2418]">
              {config.showMapCard && hasLocation
                ? 'Active on Live Hub'
                : !hasLocation
                ? 'Enter a city, link, or coordinates above to activate'
                : 'Hidden (Enable "Show on Live Hub")'}
            </span>
          </div>
          <div className="rounded-2xl overflow-hidden bg-[#FAF6F0] border border-[#B89B7E] shadow-sm">
            <div className="relative w-full overflow-hidden bg-[#0B0D11]">
              <PageoDarkMapSvg
                displayMapLabel={previewMapLabel}
                locationLabel={previewLocationName}
              />
            </div>
            <div className="px-4 py-3 bg-[#FAF6F0] border-t border-[#B89B7E]/40 space-y-1.5">
              <div className="flex items-center gap-2 text-[13px] font-medium text-[#1A120E] min-w-0">
                <MapPin className="w-3.5 h-3.5 text-[#5E493A] shrink-0" />
                <span className="truncate">{previewLocationName}</span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[12px] font-medium text-[#3A2418]">
                <a
                  href={googleMapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-[#1A120E] transition-colors"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M12 2C8.13 2 5 5.13 5 9c0 1.74.5 3.37 1.41 4.84.95 1.54 2.2 2.86 3.16 4.4.47.75.81 1.45 1.17 2.26.26.55.47 1.5 1.26 1.5s1-.95 1.26-1.5c.37-.81.7-1.51 1.17-2.26.96-1.53 2.21-2.85 3.16-4.4C18.5 12.37 19 10.74 19 9c0-3.87-3.13-7-7-7z"
                    />
                    <circle cx="12" cy="9" r="2.6" fill="#FFFFFF" />
                    <path fill="#4285F4" d="M12 2c3.87 0 7 3.13 7 7 0 1.74-.5 3.37-1.41 4.84L12 9V2z" opacity="0.88" />
                    <path fill="#34A853" d="M6.41 13.84C8.1 16.58 10.6 18.8 12 22c1.4-3.2 3.9-5.42 5.59-8.16L12 9l-5.59 4.84z" opacity="0.85" />
                    <path fill="#FBBC04" d="M5 9c0 1.74.5 3.37 1.41 4.84L12 9 6.41 4.16C5.5 5.63 5 7.26 5 9z" opacity="0.9" />
                  </svg>
                  <span>Google Maps</span>
                  <span aria-hidden="true" className="text-[11px] leading-none">↗</span>
                </a>
                <a
                  href={openStreetMapHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-[#1A120E] transition-colors"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="10.5" cy="10.5" r="6.5" fill="#7EBC6F" stroke="#2D6A4F" strokeWidth="1.6" />
                    <path d="M7.5 10.5h6M10.5 7.5v6" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M15.5 15.5L20.5 20.5" stroke="#524135" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                  <span>OpenStreetMap</span>
                  <span aria-hidden="true" className="text-[11px] leading-none">↗</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const updateDesignField = <K extends keyof SiteConfigState['designSystem']>(
    key: K,
    value: SiteConfigState['designSystem'][K]
  ) => {
    onUpdateConfig({
      ...config,
      designSystem: {
        ...config.designSystem,
        [key]: value,
      },
    });
  };

  /**
   * Handles client-side Canvas WebP/JPEG compression + direct upload to Firebase Storage
   * under `hub-media/{ownerUid}/{category}/{filename}`, saves CDN URL metadata in Firestore,
   * and automatically deletes any replaced Storage object to keep bucket usage optimized.
   */
  const handleMediaFileUpload = async (
    file: File | undefined,
    category: MediaAssetCategory,
    slotId: string,
    onComplete: (publicUrl: string, storagePath: string) => void,
    previousStoragePath?: string,
    customMaxDimensions?: { maxWidth: number; maxHeight: number },
    uploadOptions?: {
      signal?: AbortSignal;
      onProgress?: (progressPct: number, statusLabel: string) => void;
    }
  ) => {
    if (!file) return;
    setUploadingSlot(slotId);
    try {
      const finalized = await uploadCompressedMediaToFirebaseStorage({
        file,
        category,
        ownerUid,
        previousStoragePath,
        customMaxDimensions,
        signal: uploadOptions?.signal,
        onProgress: uploadOptions?.onProgress,
      });

      onComplete(finalized.publicUrl, finalized.bucketPath);
      const storageLabel =
        finalized.storageBackend === 'firebase-storage'
          ? 'Firebase Storage'
          : 'Cloud Media';
      triggerSavedBanner(
        finalized.replacedOldAsset
          ? `Uploaded to ${storageLabel} (${finalized.width}×${finalized.height}, ${formatBytes(
              finalized.sizeBytes
            )}) · Old file cleaned`
          : `Uploaded to ${storageLabel} (${finalized.width}×${finalized.height}, ${formatBytes(
              finalized.sizeBytes
            )})`
      );
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        triggerSavedBanner(
          err instanceof Error ? err.message : 'Media upload failed'
        );
      }
      throw err;
    } finally {
      setUploadingSlot(null);
    }
  };

  const openCropperForSlot = (params: {
    slotId: string;
    category: MediaAssetCategory;
    title: string;
    file?: File;
    sourceUrl?: string;
    previousStoragePath?: string;
    onComplete: (publicUrl: string, storagePath: string) => void;
  }) => {
    setCropSession({
      slotId: params.slotId,
      category: params.category,
      title: params.title,
      file: params.file,
      sourceUrl: params.sourceUrl,
      previousStoragePath: params.previousStoragePath,
      onApply: async (croppedFile, dimensions, uploadOptions) => {
        await handleMediaFileUpload(
          croppedFile,
          params.category,
          params.slotId,
          params.onComplete,
          params.previousStoragePath,
          { maxWidth: dimensions.width, maxHeight: dimensions.height },
          uploadOptions
        );
      },
      onUseOriginal: params.file
        ? async (originalFile, uploadOptions) => {
            await handleMediaFileUpload(
              originalFile,
              params.category,
              params.slotId,
              params.onComplete,
              params.previousStoragePath,
              undefined,
              uploadOptions
            );
          }
        : undefined,
    });
  };

  const availableCategories = extractAvailableCategories(
    config.links,
    config.customCategories || []
  );

  const buildDraftNewLinkResult = (
    baseConfig: SiteConfigState
  ): {
    nextConfig: SiteConfigState;
    createdItem: LinkCardItem;
    resolvedCategory: string;
  } | null => {
    if (!newLinkUrl.trim()) return null;
    const cleanUrl = /^https?:\/\//i.test(newLinkUrl.trim())
      ? newLinkUrl.trim()
      : `https://${newLinkUrl.trim()}`;

    const cats = extractAvailableCategories(
      baseConfig.links,
      baseConfig.customCategories || []
    );
    const activeFallback = cats[0]?.id || 'project';
    let resolvedCategory = cats.some((c) => c.id === newLinkCategory)
      ? newLinkCategory
      : activeFallback;
    let nextCustomCategories = baseConfig.customCategories || [];

    if (creatingNewLinkCategory && newLinkCustomCategoryInput.trim()) {
      const added = addOrRestoreCategoryEntry(
        nextCustomCategories,
        newLinkCustomCategoryInput
      );
      if (added.categoryId) {
        resolvedCategory = added.categoryId;
        nextCustomCategories = added.nextCustomCategories;
      }
    }

    const resolvedTitle =
      newLinkTitle.trim() ||
      deriveLinkTitleFromUrl(cleanUrl, newLinkFetchedMetaRef.current?.title);
    const resolvedDesc =
      newLinkDesc.trim() ||
      newLinkFetchedMetaRef.current?.description ||
      'Featured resource link.';

    const item: LinkCardItem = {
      id: `link-${Date.now()}`,
      title: resolvedTitle,
      url: cleanUrl,
      displayUrl: newLinkDisplayUrl.trim() || cleanUrl.replace(/^https?:\/\//, ''),
      description: resolvedDesc,
      pinned: newLinkPinned,
      category: resolvedCategory,
      previewType: newLinkPreview,
      thumbnailUrl: newLinkThumbnailUrl.trim(),
      autoThumbnailUrl: newLinkAutoThumbnailUrl.trim(),
      thumbnailPath: newLinkThumbnailPath,
      galleryUrls: [],
      clicks: 0,
    };

    return {
      nextConfig: {
        ...baseConfig,
        customCategories: nextCustomCategories,
        links: [item, ...baseConfig.links],
      },
      createdItem: item,
      resolvedCategory,
    };
  };

  const resetNewLinkFormState = (nextCategory: string) => {
    setNewLinkTitle('');
    setNewLinkUrl('');
    setNewLinkDisplayUrl('');
    setNewLinkDesc('');
    setNewLinkCategory(nextCategory);
    setCreatingNewLinkCategory(false);
    setNewLinkCustomCategoryInput('');
    setNewLinkPreview('auto');
    setNewLinkThumbnailUrl('');
    setNewLinkAutoThumbnailUrl('');
    lastFetchedNewUrlRef.current = '';
    newLinkFetchedMetaRef.current = {};
    setNewLinkThumbnailPath('');
    setNewLinkPinned(false);
    setShowAddLinkForm(false);
  };

  const handleExplicitSave = async () => {
    let configToSave = configRef.current;
    let newlyCommittedLink: LinkCardItem | null = null;

    const draftResult = buildDraftNewLinkResult(configToSave);
    if (draftResult) {
      configToSave = draftResult.nextConfig;
      newlyCommittedLink = draftResult.createdItem;
      resetNewLinkFormState(draftResult.resolvedCategory);
      setExpandedLinkIds((prev) => ({ ...prev, [ draftResult.createdItem.id]: true }));
    }

    await persistConfigToCloudNow(
      configToSave,
      newlyCommittedLink
        ? `Added "${newlyCommittedLink.title}" & synced to Cloud Firestore`
        : 'Synced live to Cloud Firestore'
    );

    if (
      newlyCommittedLink &&
      newlyCommittedLink.previewType === 'auto' &&
      !newlyCommittedLink.autoThumbnailUrl
    ) {
      void fetchPreviewForSavedLink(newlyCommittedLink.id, newlyCommittedLink.url);
    }
  };

  const registerCustomCategory = (rawName: string): string | null => {
    const result = addOrRestoreCategoryEntry(
      config.customCategories || [],
      rawName
    );
    if (!result.categoryId) return null;
    const nextConfig: SiteConfigState = {
      ...config,
      customCategories: result.nextCustomCategories,
    };
    void persistConfigToCloudNow(nextConfig);
    return result.categoryId;
  };

  const handleDeleteCategory = (catId: string) => {
    const result = deleteCategoryFromEntriesAndLinks({
      categoryId: catId,
      links: config.links,
      customCategories: config.customCategories || [],
    });
    if (!result.deleted || !result.fallbackCategoryId) {
      triggerSavedBanner('Keep at least one category (add another category first)');
      return;
    }

    const nextConfig: SiteConfigState = {
      ...config,
      customCategories: result.nextCustomCategories,
      links: result.nextLinks,
    };
    if (normalizeCategoryId(newLinkCategory) === normalizeCategoryId(catId)) {
      setNewLinkCategory(result.fallbackCategoryId);
    }
    const label = formatCategorySingularLabel(catId);
    const fallbackLabel = formatCategorySingularLabel(result.fallbackCategoryId);
    void persistConfigToCloudNow(
      nextConfig,
      result.reassignedCount > 0
        ? `Removed "${label}" (${result.reassignedCount} link moved to ${fallbackLabel})`
        : `Removed category "${label}"`
    );
  };

  // Link handlers
  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkUrl.trim()) {
      triggerSavedBanner('Paste a link URL (https://...) first');
      return;
    }

    const draftResult = buildDraftNewLinkResult(configRef.current);
    if (!draftResult) return;

    const { nextConfig, createdItem, resolvedCategory } = draftResult;
    resetNewLinkFormState(resolvedCategory);
    setExpandedLinkIds((prev) => ({ ...prev, [createdItem.id]: true }));

    const saved = await persistConfigToCloudNow(
      nextConfig,
      `Added & saved "${createdItem.title}" to live hub`
    );

    if (saved && createdItem.previewType === 'auto' && !createdItem.autoThumbnailUrl) {
      void fetchPreviewForSavedLink(createdItem.id, createdItem.url);
    }
  };

  const handleUpdateLink = (id: string, patch: Partial<LinkCardItem>) => {
    const latest = configRef.current;
    const nextConfig: SiteConfigState = {
      ...latest,
      links: latest.links.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    };
    scheduleCloudAutoSave(nextConfig);
  };

  const handleDeleteLink = (id: string) => {
    const latest = configRef.current;
    const target = latest.links.find((item) => item.id === id);
    if (target?.thumbnailPath) {
      deleteMediaFromFirebaseStorage({
        storagePath: target.thumbnailPath,
        ownerUid,
      }).catch(() => {});
    }
    const nextConfig: SiteConfigState = {
      ...latest,
      links: latest.links.filter((item) => item.id !== id),
    };
    void persistConfigToCloudNow(nextConfig, 'Removed link card');
  };

  const handleMoveLink = (index: number, direction: -1 | 1) => {
    const latest = configRef.current;
    const target = index + direction;
    if (target < 0 || target >= latest.links.length) return;
    const next = [...latest.links];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    void persistConfigToCloudNow({ ...latest, links: next });
  };

  // Social handlers
  const handleAddSocial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSocialUrl.trim()) return;
    const cleanUrl = newSocialUrl.trim().startsWith('http')
      ? newSocialUrl.trim()
      : `https://${newSocialUrl.trim()}`;
    const defaultHandle = config.profile.handle.trim()
      ? config.profile.handle.trim()
      : config.profile.name.trim()
      ? `@${config.profile.name.trim().toLowerCase().replace(/\s+/g, '')}`
      : '@handle';
    const item: SocialLink = {
      id: `social-${Date.now()}`,
      platform: newSocialPlatform,
      label: newSocialLabel.trim() || newSocialPlatform.toUpperCase(),
      handle: newSocialHandle.trim() || defaultHandle,
      url: cleanUrl,
    };
    const nextConfig: SiteConfigState = {
      ...configRef.current,
      socials: [...configRef.current.socials, item],
    };
    setNewSocialLabel('');
    setNewSocialHandle('');
    setNewSocialUrl('');
    void persistConfigToCloudNow(nextConfig, 'Added social icon');
  };

  const handleUpdateSocial = (id: string, patch: Partial<SocialLink>) => {
    const latest = configRef.current;
    scheduleCloudAutoSave({
      ...latest,
      socials: latest.socials.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const handleDeleteSocial = (id: string) => {
    const latest = configRef.current;
    void persistConfigToCloudNow(
      {
        ...latest,
        socials: latest.socials.filter((s) => s.id !== id),
      },
      'Removed social icon'
    );
  };

  // Blog Post handlers
  const handleAddPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostTitle.trim()) return;
    const slug = newPostTitle
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const paragraphs = newPostBody
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    const today = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const newPost: BlogPost = {
      slug: slug || `post-${Date.now()}`,
      title: newPostTitle.trim(),
      category: newPostCategory.trim() || 'Notes',
      readTime: newPostReadTime.trim() || '2 min read',
      date: today,
      excerpt:
        newPostExcerpt.trim() ||
        paragraphs[0]?.slice(0, 140) ||
        'Thoughts and notes from the studio.',
      content: paragraphs.length > 0 ? paragraphs : ['Drafted from the Link Hub Admin Studio.'],
    };

    const nextConfig: SiteConfigState = {
      ...configRef.current,
      posts: [newPost, ...configRef.current.posts],
    };
    setNewPostTitle('');
    setNewPostExcerpt('');
    setNewPostBody('');
    setShowAddPostForm(false);
    setExpandedPostSlugs((prev) => ({ ...prev, [newPost.slug]: true }));
    void persistConfigToCloudNow(nextConfig, 'Published new blog post');
  };

  const handleUpdatePost = (slug: string, patch: Partial<BlogPost>) => {
    const latest = configRef.current;
    scheduleCloudAutoSave({
      ...latest,
      posts: latest.posts.map((p) => (p.slug === slug ? { ...p, ...patch } : p)),
    });
  };

  const handleDeletePost = (slug: string) => {
    const latest = configRef.current;
    void persistConfigToCloudNow(
      {
        ...latest,
        posts: latest.posts.filter((p) => p.slug !== slug),
      },
      'Deleted blog post'
    );
  };

  const handleResetToSavedSystem = async () => {
    if (cloudAutoSaveTimerRef.current) {
      window.clearTimeout(cloudAutoSaveTimerRef.current);
      cloudAutoSaveTimerRef.current = null;
    }
    configRef.current = DEFAULT_SITE_CONFIG;
    commitLocalConfig(DEFAULT_SITE_CONFIG);
    setPantoneInputHex(SAVED_DESIGN_SYSTEM.customSeedHex || SAVED_DESIGN_SYSTEM.canvasBg);
    if (!ownerUid) {
      triggerSavedBanner('Reset workspace to clean production defaults');
      return;
    }
    setSavingToCloud(true);
    try {
      const nextCloudIds = await persistFullHubToFirestore({
        siteConfig: DEFAULT_SITE_CONFIG,
        ownerUid,
        knownCloudLinkIds: knownCloudLinkIdsRef.current,
      });
      knownCloudLinkIdsRef.current = nextCloudIds;
      onUpdateKnownCloudLinkIds(nextCloudIds);
      setCloudSyncError(null);
      triggerSavedBanner('Reset workspace & cleared cloud hub data');
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : 'Cloud sync failed during reset';
      setCloudSyncError(errMsg);
      triggerSavedBanner(`Local reset applied; cloud sync failed: ${errMsg}`);
    } finally {
      setSavingToCloud(false);
    }
  };

  const handleExportJson = () => {
    triggerBrowserDownload(
      'link-hub-config.json',
      JSON.stringify(config, null, 2),
      'application/json'
    );
    triggerSavedBanner('Exported link-hub-config.json');
  };

  const purposeColorFields: {
    key:
      | 'primaryText'
      | 'secondarySurface'
      | 'accentPrimary'
      | 'accentSecondary'
      | 'borderColor'
      | 'canvasBg'
      | 'cardBg'
      | 'innerCardBg';
    label: string;
    purpose: string;
  }[] = [
    {
      key: 'primaryText',
      label: 'Primary ink',
      purpose: 'Headings, body text & Send button',
    },
    {
      key: 'secondarySurface',
      label: 'Secondary surface',
      purpose: 'Cover banner, social buttons & active tabs',
    },
    {
      key: 'accentPrimary',
      label: 'Accent primary',
      purpose: 'Key links, highlights & heatmap intensity',
    },
    {
      key: 'accentSecondary',
      label: 'Accent secondary',
      purpose: 'Banner stitch, accents & secondary highlights',
    },
    {
      key: 'borderColor',
      label: 'For subtle accents and badges',
      purpose: 'Pill badges, subtle borders & dividers',
    },
    {
      key: 'canvasBg',
      label: 'Outer textured backdrop',
      purpose: 'Page background outside the hub card',
    },
    {
      key: 'cardBg',
      label: 'Primary card container',
      purpose: 'Main central Link Hub card surface',
    },
    {
      key: 'innerCardBg',
      label: 'Inner bento cards & inputs',
      purpose: 'Link cards, GitHub box & form fields',
    },
  ];

  const analyticsReport = computeLinkAnalyticsReport(config.links);
  const healthAudit = auditDeveloperLinkHealth(config.links, config.profile);

  const tabs: { id: AdminTab; label: string; shortLabel: string; icon: React.ReactNode; badge?: number | string }[] = [
    { id: 'profile', label: 'Identity & Media', shortLabel: 'Identity', icon: <User className="w-3.5 h-3.5" /> },
    {
      id: 'links',
      label: 'Projects & Thumbnails',
      shortLabel: 'Links',
      icon: <Link2 className="w-3.5 h-3.5" />,
      badge: config.links.length,
    },
    {
      id: 'socials',
      label: 'Social Icons',
      shortLabel: 'Socials',
      icon: <Share2 className="w-3.5 h-3.5" />,
      badge: config.socials.length,
    },
    {
      id: 'posts',
      label: 'Blog Posts',
      shortLabel: 'Posts',
      icon: <FileText className="w-3.5 h-3.5" />,
      badge: config.posts.length,
    },
    { id: 'github', label: 'GitHub Activity', shortLabel: 'GitHub', icon: <GitBranch className="w-3.5 h-3.5" /> },
    {
      id: 'design',
      label: 'System Design & Pantone',
      shortLabel: 'Design',
      icon: <Palette className="w-3.5 h-3.5" />,
      badge: 'PANTONE',
    },
    {
      id: 'analytics',
      label: 'Analytics',
      shortLabel: 'Analytics',
      icon: <BarChart3 className="w-3.5 h-3.5" />,
      badge: analyticsReport.totalClicks,
    },
    {
      id: 'messages',
      label: 'Messages',
      shortLabel: 'Inbox',
      icon: <Inbox className="w-3.5 h-3.5" />,
      badge: messages.length,
    },
    {
      id: 'devtools',
      label: 'Dev Tools',
      shortLabel: 'Dev Tools',
      icon: <Wrench className="w-3.5 h-3.5" />,
      badge: `${healthAudit.score}%`,
    },
    {
      id: 'security',
      label: 'Biometrics & Security',
      shortLabel: 'Security',
      icon: <Fingerprint className="w-3.5 h-3.5" />,
      badge: passkeys.length,
    },
  ];

  const activeWorkspaceGroup = getWorkspaceGroupForTab(activeTab);
  const unreadMessagesCount = messages.filter((m) => !m.read).length;
  const workspaceBadges = computeWorkspaceGroupBadges({
    linksCount: config.links.length,
    messagesCount: messages.length,
    unreadMessagesCount,
    passkeysCount: passkeys.length,
    pantoneCode: config.designSystem.pantoneCode,
  });

  const handleSelectWorkspaceGroup = (groupId: AdminWorkspaceGroupId) => {
    const group = ADMIN_WORKSPACE_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    if (!group.tabs.includes(activeTab)) {
      setActiveTab(group.defaultTab);
    }
    setShowMobileMoreMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderWorkspaceIcon = (groupId: AdminWorkspaceGroupId, className = 'w-4 h-4') => {
    switch (groupId) {
      case 'content':
        return <Layers className={className} />;
      case 'appearance':
        return <Palette className={className} />;
      case 'insights':
        return <BarChart3 className={className} />;
      case 'security':
        return <ShieldCheck className={className} />;
    }
  };

  const workspaceSubTabs = tabs.filter((t) => activeWorkspaceGroup.tabs.includes(t.id));

  return (
    <div className="relative z-10 min-h-screen pt-2 sm:pt-10 pb-24 sm:pb-14 px-2 sm:px-4 flex flex-col items-center font-manrope">
      <div className="w-full max-w-[960px] rounded-[20px] sm:rounded-[28px] bg-card-paper border border-[#D5C4AE] shadow-[0_24px_60px_-15px_rgba(26,18,14,0.48)] p-3.5 sm:p-7 space-y-4 sm:space-y-6">
        {/* TOP ADMIN STUDIO HEADER */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3.5 pb-3.5 sm:pb-5 border-b border-[#D5C4AE]">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center justify-between gap-2 sm:justify-start">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={onBackToHub}
                  className="inline-flex items-center gap-1.5 min-h-[36px] sm:min-h-0 px-3 py-1.5 rounded-xl bg-[#FAF6F0] hover:bg-[#D5C4AE] text-[#1A120E] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="sm:hidden">Live Hub</span>
                  <span className="hidden sm:inline">Back to Live Hub</span>
                </button>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#3A2418] text-[#FAF6F0] font-ibm-mono text-[10px] uppercase tracking-wider font-semibold">
                  <Lock className="w-3 h-3" />
                  <span>Solo Owner · {ownerEmail}</span>
                </span>
              </div>

              {/* Mobile Overflow Actions Toggle */}
              <button
                type="button"
                onClick={() => setShowMobileMoreMenu((prev) => !prev)}
                aria-expanded={showMobileMoreMenu}
                aria-label="Open Studio Actions menu"
                className="sm:hidden inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl bg-[#FAF6F0] hover:bg-[#D5C4AE] text-[#1A120E] border border-[#B89B7E] text-[11.5px] font-semibold cursor-pointer shrink-0"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
                <span>Actions</span>
              </button>
            </div>

            {saveNotice && (
              <div
                role="status"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF6F0] border border-[#3A2418] text-[#1A120E] font-ibm-mono text-[10.5px] font-bold"
              >
                <Check className="w-3 h-3 text-[#3A2418] shrink-0" />
                <span>{saveNotice}</span>
              </div>
            )}

            {cloudSyncError && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-300 text-red-900 font-ibm-mono text-[10.5px]"
              >
                <span className="break-words">
                  <strong>Cloud sync failed:</strong> {cloudSyncError}
                </span>
                <button
                  type="button"
                  onClick={() => void persistConfigToCloudNow(configRef.current, 'Synced live to Cloud Firestore')}
                  className="px-2.5 py-1 rounded-lg bg-red-800 text-white font-bold hover:bg-red-900 cursor-pointer shrink-0"
                >
                  Retry Sync
                </button>
              </div>
            )}

            <div className="flex items-baseline justify-between gap-2 pt-0.5 sm:block">
              <h1 className="text-[15px] sm:text-xl font-bold text-[#1A120E] tracking-tight">
                Link Hub Studio
              </h1>
              <p className="text-[11px] sm:text-xs font-medium text-[#3A2418] truncate">
                {activeWorkspaceGroup.label} · UID Lock
              </p>
            </div>
          </div>

          {/* Mobile Quick Actions Drawer (Hidden unless expanded) */}
          {showMobileMoreMenu && (
            <div className="sm:hidden grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-[#FAF6F0] border border-[#B89B7E]">
              <button
                type="button"
                onClick={() => {
                  handleExportJson();
                  setShowMobileMoreMenu(false);
                }}
                className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[#1A120E] text-[11.5px] font-semibold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleResetToSavedSystem();
                  setShowMobileMoreMenu(false);
                }}
                className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[#3A2418] text-[11.5px] font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
              {passkeys.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileMoreMenu(false);
                    onLockStudio();
                  }}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[#1A120E] text-[11.5px] font-semibold cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Lock Studio</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowMobileMoreMenu(false);
                  onSignOut().catch(() => {});
                }}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#3A2418] text-[#FAF6F0] text-[11.5px] font-semibold cursor-pointer ${
                  passkeys.length === 0 ? 'col-span-2' : ''
                }`}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          )}

          {/* Desktop Action Cluster */}
          <div className="hidden sm:flex flex-wrap items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl bg-[#FAF6F0] hover:bg-[#D5C4AE] text-[#1A120E] border border-[#B89B7E] text-xs font-semibold transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={handleResetToSavedSystem}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl bg-[#FAF6F0] hover:bg-[#D5C4AE] text-[#3A2418] border border-[#B89B7E] text-xs font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
            <button
              type="button"
              onClick={handleExplicitSave}
              disabled={savingToCloud}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-[#1A120E] hover:bg-[#3A2418] disabled:opacity-60 text-[#FAF6F0] text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingToCloud ? 'Syncing...' : 'Save Changes'}</span>
            </button>
            {passkeys.length > 0 && (
              <button
                type="button"
                onClick={onLockStudio}
                aria-label="Lock Admin Studio with Biometrics"
                title="Lock Studio (unlock quickly with Fingerprint / Face ID / Windows Hello)"
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl bg-[#FAF6F0] hover:bg-[#D5C4AE] text-[#1A120E] border border-[#B89B7E] text-xs font-semibold transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Lock</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onSignOut().catch(() => {});
              }}
              aria-label="Sign out of Admin Studio"
              title="Sign out"
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl bg-[#FAF6F0] hover:bg-[#D5C4AE] text-[#3A2418] border border-[#B89B7E] text-xs font-semibold transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        {/* WORKSPACE GROUPS NAVIGATION (Desktop 4-column switcher; mobile uses fixed bottom thumb dock) */}
        <nav aria-label="Studio Workspaces" className="hidden sm:grid sm:grid-cols-4 gap-2">
          {ADMIN_WORKSPACE_GROUPS.map((group) => {
            const isActiveGroup = activeWorkspaceGroup.id === group.id;
            const badge = workspaceBadges[group.id];
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => handleSelectWorkspaceGroup(group.id)}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  isActiveGroup
                    ? 'bg-[#3A2418] text-[#FAF6F0] border-[#1A120E] shadow-xs'
                    : 'bg-[#FAF6F0] text-[#1A120E] border-[#B89B7E] hover:bg-[#F4EDE2]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isActiveGroup
                        ? 'bg-[#6B4A2E] text-[#FAF6F0]'
                        : 'bg-[#F4EDE2] text-[#3A2418] border border-[#D5C4AE]'
                    }`}
                  >
                    {renderWorkspaceIcon(group.id)}
                  </span>
                  <div className="min-w-0">
                    <span className="block text-xs font-bold truncate">{group.label}</span>
                    <span
                      className={`block font-ibm-mono text-[10px] truncate ${
                        isActiveGroup ? 'text-[#D5C4AE]' : 'text-[#5C3D24]'
                      }`}
                    >
                      {group.tabs.length > 1 ? `${group.tabs.length} sections` : group.shortLabel}
                    </span>
                  </div>
                </div>
                {badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md font-ibm-mono text-[10px] font-bold shrink-0 ${
                      isActiveGroup
                        ? 'bg-[#6B4A2E] text-[#FAF6F0]'
                        : 'bg-[#EAE0D3] text-[#1A120E]'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* WORKSPACE SUB-TAB STRIP (Responsive grid on mobile — zero right-edge clipping) */}
        {workspaceSubTabs.length > 1 && (
          <div
            role="tablist"
            aria-label={`${activeWorkspaceGroup.label} sections`}
            className={`grid gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2 p-1.5 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] ${
              workspaceSubTabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
            }`}
          >
            {workspaceSubTabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center justify-between sm:justify-start gap-1.5 min-h-[34px] sm:min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-semibold transition-all cursor-pointer whitespace-nowrap min-w-0 ${
                    active
                      ? 'bg-[#3A2418] text-[#FAF6F0] shadow-xs'
                      : 'text-[#3A2418] hover:text-[#1A120E] hover:bg-[#F4EDE2]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                    {tab.icon}
                    <span className="sm:hidden truncate">{tab.shortLabel}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </span>
                  {tab.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded font-ibm-mono text-[9.5px] sm:text-[10px] font-bold shrink-0 ${
                        active
                          ? 'bg-[#6B4A2E] text-[#FAF6F0]'
                          : 'bg-[#EAE0D3] text-[#1A120E]'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* TAB 1: IDENTITY, AVATAR & COVER BANNER */}
        {activeTab === 'profile' && (
          <section aria-label="Identity and Bio settings" className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
              <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-3">
                <h2 className="font-ibm-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                  Core Profile Identity &amp; Media
                </h2>

                {/* Avatar Uploader + Preview (Stacked buttons on mobile so nothing overlaps text) */}
                <div className="p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={config.profile.avatarUrl}
                      alt={config.profile.name}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border border-[#3A2418] shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-[#1A120E]">Profile Avatar</p>
                      <p className="font-ibm-mono text-[10px] text-[#5C3D24] truncate">
                        {config.profile.avatarPath || '320×320 WebP auto-compressed'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 w-full sm:w-auto shrink-0">
                    <label className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#3A2418] hover:bg-[#1A120E] text-[#FAF6F0] text-[11px] font-semibold cursor-pointer whitespace-nowrap">
                      <Upload className="w-3 h-3 shrink-0" />
                      <span>
                        {uploadingSlot === 'avatar' ? 'Uploading...' : 'Upload'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const selected = e.target.files?.[0];
                          e.target.value = '';
                          if (!selected) return;
                          openCropperForSlot({
                            slotId: 'avatar',
                            category: 'avatar',
                            title: 'Crop & Resize Profile Avatar',
                            file: selected,
                            previousStoragePath: config.profile.avatarPath,
                            onComplete: (publicUrl, staticPath) => {
                              onUpdateConfig({
                                ...config,
                                profile: {
                                  ...config.profile,
                                  avatarUrl: publicUrl,
                                  avatarPath: staticPath,
                                },
                              });
                            },
                          });
                        }}
                        className="sr-only"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        openCropperForSlot({
                          slotId: 'avatar',
                          category: 'avatar',
                          title: 'Crop & Resize Profile Avatar',
                          sourceUrl: config.profile.avatarUrl,
                          previousStoragePath: config.profile.avatarPath,
                          onComplete: (publicUrl, staticPath) => {
                            onUpdateConfig({
                              ...config,
                              profile: {
                                ...config.profile,
                                avatarUrl: publicUrl,
                                avatarPath: staticPath,
                              },
                            });
                          },
                        })
                      }
                      aria-label="Crop or resize current profile avatar"
                      className="inline-flex items-center justify-center gap-1 min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] hover:bg-[#EAE0D3] border border-[#B89B7E] text-[11px] font-semibold text-[#1A120E] cursor-pointer whitespace-nowrap"
                    >
                      <Crop className="w-3 h-3 shrink-0" />
                      <span>Crop</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const oldAvatarPath = config.profile.avatarPath;
                        onUpdateConfig({
                          ...config,
                          profile: {
                            ...config.profile,
                            avatarUrl: DEFAULT_AVATAR_DATA_URI,
                            avatarPath: '',
                          },
                        });
                        if (oldAvatarPath) {
                          deleteMediaFromFirebaseStorage({
                            storagePath: oldAvatarPath,
                            ownerUid,
                          }).catch(() => {});
                        }
                      }}
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] hover:bg-[#EAE0D3] border border-[#B89B7E] text-[11px] font-semibold text-[#3A2418] cursor-pointer whitespace-nowrap"
                    >
                      Default SVG
                    </button>
                  </div>
                </div>

                {/* Cover Banner Mode & Uploader */}
                <div className="p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-[12px] font-bold text-[#1A120E]">
                      Cover Banner Style
                    </span>
                    <div className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto p-0.5 rounded-lg bg-[#FAF6F0] border border-[#B89B7E]">
                      <button
                        type="button"
                        onClick={() => updateProfileField('bannerMode', 'svg')}
                        className={`px-2.5 py-1.5 sm:py-1 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap text-center ${
                          (config.profile.bannerMode || 'svg') === 'svg'
                            ? 'bg-[#3A2418] text-[#FAF6F0]'
                            : 'text-[#3A2418]'
                        }`}
                      >
                        Stitched SVG
                      </button>
                      <button
                        type="button"
                        onClick={() => updateProfileField('bannerMode', 'image')}
                        className={`px-2.5 py-1.5 sm:py-1 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap text-center ${
                          config.profile.bannerMode === 'image'
                            ? 'bg-[#3A2418] text-[#FAF6F0]'
                            : 'text-[#3A2418]'
                        }`}
                      >
                        Custom Image
                      </button>
                    </div>
                  </div>

                  {config.profile.bannerMode === 'image' ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        type="text"
                        value={config.profile.bannerImageUrl || ''}
                        onChange={(e) =>
                          updateProfileField('bannerImageUrl', e.target.value)
                        }
                        placeholder="Paste Banner Image URL or upload"
                        aria-label="Cover banner image URL"
                        className="flex-1 min-w-0 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#B89B7E] font-ibm-mono text-[11.5px] sm:text-[11px] text-[#1A120E]"
                      />
                      <div className="flex items-center gap-1.5 shrink-0">
                        <label className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg bg-[#3A2418] hover:bg-[#1A120E] text-[#FAF6F0] text-[11px] font-semibold shrink-0 cursor-pointer whitespace-nowrap">
                          <Upload className="w-3 h-3" />
                          <span>
                            {uploadingSlot === 'banner' ? 'Uploading...' : 'Upload Banner'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const selected = e.target.files?.[0];
                              e.target.value = '';
                              if (!selected) return;
                              openCropperForSlot({
                                slotId: 'banner',
                                category: 'banner',
                                title: 'Crop & Resize Cover Banner',
                                file: selected,
                                previousStoragePath: config.profile.bannerImagePath,
                                onComplete: (publicUrl, staticPath) => {
                                  onUpdateConfig({
                                    ...config,
                                    profile: {
                                      ...config.profile,
                                      bannerMode: 'image',
                                      bannerImageUrl: publicUrl,
                                      bannerImagePath: staticPath,
                                    },
                                  });
                                },
                              });
                            }}
                            className="sr-only"
                          />
                        </label>
                        {config.profile.bannerImageUrl?.trim() && (
                          <button
                            type="button"
                            onClick={() =>
                              openCropperForSlot({
                                slotId: 'banner',
                                category: 'banner',
                                title: 'Crop & Resize Cover Banner',
                                sourceUrl: config.profile.bannerImageUrl,
                                previousStoragePath: config.profile.bannerImagePath,
                                onComplete: (publicUrl, staticPath) => {
                                  onUpdateConfig({
                                    ...config,
                                    profile: {
                                      ...config.profile,
                                      bannerMode: 'image',
                                      bannerImageUrl: publicUrl,
                                      bannerImagePath: staticPath,
                                    },
                                  });
                                },
                              })
                            }
                            aria-label="Crop or resize cover banner"
                            className="inline-flex items-center justify-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] hover:bg-[#EAE0D3] border border-[#B89B7E] text-[11px] font-semibold text-[#1A120E] cursor-pointer whitespace-nowrap"
                          >
                            <Crop className="w-3 h-3" />
                            <span>Crop</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label
                        htmlFor="admin-banner"
                        className="block text-[11.5px] font-bold text-[#1A120E]"
                      >
                        Cover Banner Emblem Text
                      </label>
                      <input
                        id="admin-banner"
                        type="text"
                        value={config.profile.bannerText}
                        onChange={(e) => updateProfileField('bannerText', e.target.value)}
                        className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="space-y-1">
                    <label htmlFor="admin-name" className="block text-[12px] font-bold text-[#1A120E]">
                      Display Name
                    </label>
                    <input
                      id="admin-name"
                      type="text"
                      value={config.profile.name}
                      onChange={(e) => updateProfileField('name', e.target.value)}
                      className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="admin-fullname" className="block text-[12px] font-bold text-[#1A120E]">
                      Full Name (Pass)
                    </label>
                    <input
                      id="admin-fullname"
                      type="text"
                      value={config.profile.fullName}
                      onChange={(e) => updateProfileField('fullName', e.target.value)}
                      className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="space-y-1">
                    <label htmlFor="admin-handle" className="block text-[12px] font-bold text-[#1A120E]">
                      Handle
                    </label>
                    <input
                      id="admin-handle"
                      type="text"
                      value={config.profile.handle}
                      onChange={(e) => updateProfileField('handle', e.target.value)}
                      className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="admin-role" className="block text-[12px] font-bold text-[#1A120E]">
                      Role / Headline
                    </label>
                    <input
                      id="admin-role"
                      type="text"
                      value={config.profile.role}
                      onChange={(e) => updateProfileField('role', e.target.value)}
                      className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="space-y-1">
                    <label htmlFor="admin-email" className="block text-[12px] font-bold text-[#1A120E]">
                      Public Contact Email
                    </label>
                    <input
                      id="admin-email"
                      type="email"
                      value={config.profile.email}
                      onChange={(e) => updateProfileField('email', e.target.value)}
                      className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="admin-coffee-url" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#1A120E]">
                      <Coffee className="w-3.5 h-3.5 text-[#6B4A2E]" />
                      <span>Buy Me a Coffee URL (Footer)</span>
                    </label>
                    <input
                      id="admin-coffee-url"
                      type="url"
                      value={config.profile.buyMeACoffeeUrl || ''}
                      onChange={(e) => updateProfileField('buyMeACoffeeUrl', e.target.value)}
                      placeholder="https://buymeacoffee.com/yourname"
                      className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                    />
                  </div>
                </div>
              </div>

              {/* Bio Builder */}
              <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-3">
                <h2 className="font-ibm-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                  Interactive Bio &amp; Inline Badges
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="space-y-1">
                    <label htmlFor="admin-bio-prefix" className="block text-[12px] font-bold text-[#1A120E]">
                      Bio Opening Text
                    </label>
                    <input
                      id="admin-bio-prefix"
                      type="text"
                      value={config.profile.bioPrefix}
                      onChange={(e) => updateProfileField('bioPrefix', e.target.value)}
                      className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="admin-bio-code" className="block text-[12px] font-bold text-[#1A120E]">
                      Inline Code Chip
                    </label>
                    <input
                      id="admin-bio-code"
                      type="text"
                      value={config.profile.bioCode}
                      onChange={(e) => updateProfileField('bioCode', e.target.value)}
                      className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="admin-bio-middle" className="block text-[12px] font-bold text-[#1A120E]">
                    Bio Middle Sentence
                  </label>
                  <textarea
                    id="admin-bio-middle"
                    rows={2}
                    value={config.profile.bioMiddle}
                    onChange={(e) => updateProfileField('bioMiddle', e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E] resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="space-y-1">
                    <label htmlFor="admin-bio-link-text" className="block text-[12px] font-bold text-[#1A120E]">
                      Highlighted Link Label
                    </label>
                    <input
                      id="admin-bio-link-text"
                      type="text"
                      value={config.profile.bioLinkText}
                      onChange={(e) => updateProfileField('bioLinkText', e.target.value)}
                      className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="admin-bio-link-url" className="block text-[12px] font-bold text-[#1A120E]">
                      Highlighted Link URL
                    </label>
                    <input
                      id="admin-bio-link-url"
                      type="url"
                      value={config.profile.bioLinkUrl}
                      onChange={(e) => updateProfileField('bioLinkUrl', e.target.value)}
                      className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="admin-bio-suffix" className="block text-[12px] font-bold text-[#1A120E]">
                    Bio Closing Callout
                  </label>
                  <input
                    id="admin-bio-suffix"
                    type="text"
                    value={config.profile.bioSuffix}
                    onChange={(e) => updateProfileField('bioSuffix', e.target.value)}
                    className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
                  />
                </div>

                {/* Live Bio Preview */}
                <div className="p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] space-y-1">
                  <span className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#3A2418]">
                    Live Bio Preview
                  </span>
                  {config.profile.bioPrefix ||
                  config.profile.bioCode ||
                  config.profile.bioMiddle ||
                  config.profile.bioLinkText ||
                  config.profile.bioSuffix ? (
                    <p className="text-[11.5px] sm:text-xs text-[#1A120E] font-medium leading-relaxed">
                      {config.profile.bioPrefix}
                      {config.profile.bioCode ? (
                        <code className="px-1.5 py-0.5 rounded-md bg-[#FAF6F0] border border-[#B89B7E] text-[#3A2418] text-[11px] font-mono font-bold">
                          {config.profile.bioCode}
                        </code>
                      ) : null}
                      {config.profile.bioMiddle}
                      {config.profile.bioLinkText ? (
                        <strong className="font-bold text-[#1A120E] underline decoration-[#6B4A2E] underline-offset-2">
                          {config.profile.bioLinkText}
                        </strong>
                      ) : null}
                      {config.profile.bioSuffix}
                    </p>
                  ) : (
                    <p className="text-[11.5px] sm:text-xs text-[#5C3D24] italic">
                      Enter your bio segments above to preview how your bio reads on the live card.
                    </p>
                  )}
                </div>
              </div>

              {/* SEO & AI Search Discovery (GEO) */}
              <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-3">
                <div className="space-y-0.5">
                  <h2 className="font-ibm-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                    SEO &amp; AI Search Discovery (GEO · Background Only)
                  </h2>
                  <p className="text-[11px] font-medium text-[#3A2418]">
                    Embedded invisibly in background <code className="font-ibm-mono font-bold">&lt;head&gt;</code> meta tags, Schema.org JSON-LD, OpenGraph cards, <code className="font-ibm-mono font-bold">/llms.txt</code>, and <code className="font-ibm-mono font-bold">/.well-known/ai-profile.json</code> for search engines &amp; LLMs (never displayed visibly on the live page).
                  </p>
                </div>

                <div className="space-y-1">
                  <label htmlFor="admin-availability" className="block text-[12px] font-bold text-[#1A120E]">
                    Availability Status (Optional)
                  </label>
                  <input
                    id="admin-availability"
                    type="text"
                    value={config.profile.availabilityStatus || ''}
                    onChange={(e) => updateProfileField('availabilityStatus', e.target.value)}
                    placeholder="e.g. Open to senior full-stack roles & advisory"
                    className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="admin-seo-keywords" className="block text-[12px] font-bold text-[#1A120E]">
                    Skills &amp; Tech Stack (Comma-separated <span className="font-ibm-mono text-[10.5px] text-[#6B4A2E]">knowsAbout</span>)
                  </label>
                  <input
                    id="admin-seo-keywords"
                    type="text"
                    value={config.profile.seoKeywords || ''}
                    onChange={(e) => updateProfileField('seoKeywords', e.target.value)}
                    placeholder="TypeScript, React, Next.js, Node.js, Firebase, System Design"
                    className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="admin-seo-title" className="block text-[12px] font-bold text-[#1A120E]">
                      Custom SEO Page Title
                    </label>
                    <span className="font-ibm-mono text-[10px] font-semibold text-[#3A2418]">
                      {(config.profile.seoTitle || '').trim().length}/65 chars (30–60 ideal)
                    </span>
                  </div>
                  <input
                    id="admin-seo-title"
                    type="text"
                    value={config.profile.seoTitle || ''}
                    onChange={(e) => updateProfileField('seoTitle', e.target.value)}
                    placeholder="Auto-generated from Name & Role if left blank"
                    className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="admin-seo-desc" className="block text-[12px] font-bold text-[#1A120E]">
                      Custom Meta Description
                    </label>
                    <span className="font-ibm-mono text-[10px] font-semibold text-[#3A2418]">
                      {(config.profile.seoDescription || '').trim().length}/160 chars (120–160 ideal)
                    </span>
                  </div>
                  <textarea
                    id="admin-seo-desc"
                    rows={2}
                    value={config.profile.seoDescription || ''}
                    onChange={(e) => updateProfileField('seoDescription', e.target.value)}
                    placeholder="Auto-generated from Role, Location, Skills & Projects if left blank"
                    className="w-full px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E] resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Location & Google Map Showcase Editor */}
            {renderLocationMapEditor('profile')}

            {/* Section Visibility Toggles */}
            <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 className="text-[12px] font-bold text-[#1A120E]">Hub Section Visibility</h3>
                <p className="text-[11px] font-medium text-[#3A2418]">
                  Toggle modules across the main Link Hub.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                <label className="inline-flex items-center gap-1.5 min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#1A120E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showGithubSection}
                    onChange={(e) =>
                      onUpdateConfig({ ...config, showGithubSection: e.target.checked })
                    }
                    className="accent-[#3A2418]"
                  />
                  <span className="truncate">GitHub Map</span>
                </label>

                <label className="inline-flex items-center gap-1.5 min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#1A120E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showSongCard}
                    onChange={(e) =>
                      onUpdateConfig({ ...config, showSongCard: e.target.checked })
                    }
                    className="accent-[#3A2418]"
                  />
                  <span className="truncate">Music Card</span>
                </label>

                <label className="inline-flex items-center gap-1.5 min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#1A120E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showMapCard}
                    onChange={(e) =>
                      onUpdateConfig({ ...config, showMapCard: e.target.checked })
                    }
                    className="accent-[#3A2418]"
                  />
                  <span className="truncate">Location Map</span>
                </label>

                <label className="inline-flex items-center gap-1.5 min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#1A120E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showContactSection}
                    onChange={(e) =>
                      onUpdateConfig({ ...config, showContactSection: e.target.checked })
                    }
                    className="accent-[#3A2418]"
                  />
                  <span className="truncate">Contact Form</span>
                </label>
              </div>
            </div>
          </section>
        )}

        {/* TAB 2: GITHUB ACTIVITY */}
        {activeTab === 'github' && (
          <section aria-label="GitHub Activity configuration" className="space-y-4">
            <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <h2 className="font-ibm-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                    Live GitHub Repository &amp; Heatmap
                  </h2>
                  <p className="text-[11.5px] sm:text-xs font-medium text-[#3A2418]">
                    Paste any GitHub repository URL, <code className="font-ibm-mono font-bold">owner/repo</code>, or username.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 min-h-[34px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#1A120E] cursor-pointer self-start sm:self-auto">
                  <input
                    type="checkbox"
                    checked={config.showGithubSection}
                    onChange={(e) =>
                      onUpdateConfig({ ...config, showGithubSection: e.target.checked })
                    }
                    className="accent-[#3A2418]"
                  />
                  <span>Show Heatmap on Hub</span>
                </label>
              </div>

              {/* Smart GitHub Repo / URL Quick-Sync Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const parsed = parseGitHubRepoOrUserInput(githubSourceInput);
                  if (!parsed.username) return;
                  onUpdateConfig({
                    ...config,
                    showGithubSection: true,
                    profile: {
                      ...config.profile,
                      githubUsername: parsed.username,
                      githubRepo: parsed.repo,
                      githubProfileUrl: parsed.profileUrl,
                    },
                  });
                  triggerSavedBanner(
                    parsed.repo
                      ? `Switched GitHub heatmap to @${parsed.username}/${parsed.repo}`
                      : `Switched GitHub heatmap to @${parsed.username}`
                  );
                }}
                className="p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] space-y-2"
              >
                <label
                  htmlFor="admin-gh-repo-sync"
                  className="block text-[12px] font-bold text-[#1A120E]"
                >
                  Change GitHub Repo or Profile URL
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="admin-gh-repo-sync"
                    type="text"
                    value={githubSourceInput}
                    onChange={(e) => setGithubSourceInput(e.target.value)}
                    placeholder="e.g. vercel/next.js or https://github.com/owner/repo"
                    className="flex-1 min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#FAF6F0] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E] placeholder-[#5C3D24]"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3.5 py-1.5 rounded-lg sm:rounded-xl bg-[#3A2418] hover:bg-[#1A120E] text-[#FAF6F0] text-[11.5px] sm:text-xs font-semibold transition-colors cursor-pointer shrink-0"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>Connect Repo Heatmap</span>
                  </button>
                </div>
                <p className="text-[11px] font-medium text-[#3A2418]">
                  Active source:{' '}
                  <strong className="font-ibm-mono text-[#1A120E]">
                    {config.profile.githubUsername.trim()
                      ? `@${config.profile.githubUsername.trim()}${
                          config.profile.githubRepo ? `/${config.profile.githubRepo}` : ''
                        }`
                      : 'Not connected'}
                  </strong>
                </p>
              </form>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                <div className="space-y-1">
                  <label htmlFor="admin-gh-user" className="block text-[12px] font-bold text-[#1A120E]">
                    GitHub Username (API Owner)
                  </label>
                  <input
                    id="admin-gh-user"
                    type="text"
                    value={config.profile.githubUsername}
                    onChange={(e) => {
                      const parsed = parseGitHubRepoOrUserInput(e.target.value);
                      const cleanUser = parsed.username || e.target.value.replace(/^@/, '');
                      const nextRepo = parsed.repo || config.profile.githubRepo || '';
                      onUpdateConfig({
                        ...config,
                        profile: {
                          ...config.profile,
                          githubUsername: cleanUser,
                          githubRepo: nextRepo,
                          githubProfileUrl: nextRepo
                            ? `https://github.com/${cleanUser}/${nextRepo}`
                            : `https://github.com/${cleanUser}`,
                        },
                      });
                    }}
                    className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="admin-gh-repo" className="block text-[12px] font-bold text-[#1A120E]">
                    GitHub Repository Name (Optional)
                  </label>
                  <input
                    id="admin-gh-repo"
                    type="text"
                    value={config.profile.githubRepo || ''}
                    onChange={(e) => {
                      const cleanRepo = e.target.value.trim().replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
                      const owner = config.profile.githubUsername.trim();
                      onUpdateConfig({
                        ...config,
                        profile: {
                          ...config.profile,
                          githubRepo: cleanRepo,
                          githubProfileUrl: cleanRepo && owner
                            ? `https://github.com/${owner}/${cleanRepo}`
                            : `https://github.com/${owner}`,
                        },
                      });
                    }}
                    placeholder="e.g. link-hub"
                    className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="admin-gh-url" className="block text-[12px] font-bold text-[#1A120E]">
                    GitHub Button URL
                  </label>
                  <input
                    id="admin-gh-url"
                    type="url"
                    value={config.profile.githubProfileUrl}
                    onChange={(e) => updateProfileField('githubProfileUrl', e.target.value)}
                    className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="admin-gh-title" className="block text-[12px] font-bold text-[#1A120E]">
                    Section Heading (IBM Plex Mono)
                  </label>
                  <input
                    id="admin-gh-title"
                    type="text"
                    value={config.profile.githubSectionTitle}
                    onChange={(e) => updateProfileField('githubSectionTitle', e.target.value)}
                    className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label htmlFor="admin-gh-subtitle" className="block text-[12px] font-bold text-[#1A120E]">
                    Section Subtitle (Manrope)
                  </label>
                  <input
                    id="admin-gh-subtitle"
                    type="text"
                    value={config.profile.githubSectionSubtitle}
                    onChange={(e) => updateProfileField('githubSectionSubtitle', e.target.value)}
                    className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
                  />
                </div>
              </div>
            </div>

            {/* Live GitHub Heatmap Preview Inside Admin */}
            <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-ibm-mono text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-[#3A2418]">
                  Live Heatmap Preview
                </span>
                <span className="font-ibm-mono text-[10px] font-semibold text-[#3A2418] truncate">
                  Live Link Hub preview
                </span>
              </div>
              <div
                className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border"
                style={{
                  backgroundColor: config.designSystem.cardBg,
                  borderColor: config.designSystem.borderColor,
                }}
              >
                <GitHubActivity
                  username={config.profile.githubUsername}
                  repo={config.profile.githubRepo}
                  profileUrl={config.profile.githubProfileUrl}
                  title={config.profile.githubSectionTitle}
                  subtitle={config.profile.githubSectionSubtitle}
                  themeColors={[
                    config.designSystem.innerCardBg,
                    config.designSystem.borderColor,
                    config.designSystem.accentSecondary,
                    config.designSystem.accentPrimary,
                    config.designSystem.secondarySurface,
                  ]}
                />
              </div>
            </div>
          </section>
        )}

        {/* TAB 3: PROJECTS, LINKS, THUMBNAILS, MUSIC & MAP */}
        {activeTab === 'links' && (
          <section aria-label="Links, Music and Map settings" className="space-y-4 sm:space-y-6">
            {/* Link Categories Manager (all built-in & custom categories can be added or deleted) */}
            <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5 sm:space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#3A2418]" />
                  <h2 className="font-ibm-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                    Link Categories
                  </h2>
                </div>
                <span className="font-ibm-mono text-[10px] font-semibold text-[#3A2418]">
                  {availableCategories.length}{' '}
                  {availableCategories.length === 1 ? 'category' : 'categories'} live
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {availableCategories.map((cat) => (
                  <span
                    key={cat.id}
                    className={`inline-flex items-center gap-1 min-h-[30px] pl-2.5 pr-1.5 py-0.5 rounded-lg border text-[11.5px] sm:text-xs font-semibold ${
                      cat.isCustom
                        ? 'bg-[#3A2418] border-[#6B4A2E] text-[#FAF6F0]'
                        : 'bg-[#F4EDE2] border-[#B89B7E] text-[#1A120E]'
                    }`}
                  >
                    <span>{cat.singularLabel}</span>
                    {availableCategories.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id)}
                        aria-label={`Delete category ${cat.singularLabel}`}
                        title={`Delete ${cat.singularLabel}`}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          cat.isCustom
                            ? 'hover:bg-[#6B4A2E] text-[#FAF6F0]'
                            : 'hover:bg-[#E5D8C5] text-[#5C3D24] hover:text-[#1A120E]'
                        }`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={customCategoryDraft}
                  onChange={(e) => setCustomCategoryDraft(e.target.value)}
                  placeholder="Add category (e.g. AI Tools, SaaS, Portfolio, Game)"
                  aria-label="Create custom category name"
                  className="flex-1 min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12px] sm:text-xs text-[#1A120E] placeholder-[#5C3D24]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const createdId = registerCustomCategory(customCategoryDraft);
                    if (!createdId) return;
                    setNewLinkCategory(createdId);
                    setCreatingNewLinkCategory(false);
                    setCustomCategoryDraft('');
                    triggerSavedBanner(
                      `Added category "${formatCategorySingularLabel(createdId)}"`
                    );
                  }}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3.5 py-1.5 rounded-lg sm:rounded-xl bg-[#3A2418] hover:bg-[#6B4A2E] text-[#FAF6F0] text-[11.5px] sm:text-xs font-semibold transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Category</span>
                </button>
              </div>
            </div>

            {/* Add New Link Card Toggle & Collapsible Drawer */}
            <div className="rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAddLinkForm((prev) => !prev)}
                aria-expanded={showAddLinkForm}
                className="w-full min-h-[46px] px-3.5 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2.5 bg-[#FAF6F0] hover:bg-[#F4EDE2] text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-[#3A2418] text-[#FAF6F0] flex items-center justify-center shrink-0">
                    <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </span>
                  <div className="min-w-0">
                    <span className="block font-ibm-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#1A120E] truncate">
                      Add New Link / Project Card
                    </span>
                    <span className="block text-[10.5px] sm:text-[11px] text-[#5C3D24] truncate">
                      Paste link, pick category, upload thumbnail
                    </span>
                  </div>
                </div>
                {showAddLinkForm ? (
                  <ChevronUp className="w-4 h-4 text-[#3A2418] shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#3A2418] shrink-0" />
                )}
              </button>

              {showAddLinkForm && (
                <form
                  onSubmit={handleAddLink}
                  className="p-3.5 sm:p-4 pt-3 border-t border-[#D5C4AE] space-y-2.5 sm:space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[#5C3D24]">
                      New Card Details
                    </span>
                    <label className="inline-flex items-center gap-1.5 min-h-[30px] px-2.5 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#3A2418] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newLinkPinned}
                        onChange={(e) => setNewLinkPinned(e.target.checked)}
                        className="accent-[#3A2418] w-3.5 h-3.5"
                      />
                      <span>Pin to top</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
                    <input
                      type="text"
                      value={newLinkTitle}
                      onChange={(e) => setNewLinkTitle(e.target.value)}
                      placeholder="Card title (e.g. My SaaS App)"
                      aria-label="New link title"
                      className="min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E] placeholder-[#5C3D24]"
                    />
                    <input
                      type="text"
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      placeholder="Full URL (https://...)"
                      aria-label="New link URL"
                      className="min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E] placeholder-[#5C3D24]"
                    />
                    <input
                      type="text"
                      value={newLinkDisplayUrl}
                      onChange={(e) => setNewLinkDisplayUrl(e.target.value)}
                      placeholder="Display URL (optional)"
                      aria-label="New link display URL"
                      className="min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E] placeholder-[#5C3D24]"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                    <input
                      type="text"
                      value={newLinkDesc}
                      onChange={(e) => setNewLinkDesc(e.target.value)}
                      placeholder="Short description shown on card"
                      aria-label="New link description"
                      className="col-span-2 min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E] placeholder-[#5C3D24]"
                    />
                    <select
                      value={
                        creatingNewLinkCategory
                          ? '__create_new__'
                          : availableCategories.some((c) => c.id === newLinkCategory)
                          ? newLinkCategory
                          : availableCategories[0]?.id || 'project'
                      }
                      onChange={(e) => {
                        if (e.target.value === '__create_new__') {
                          setCreatingNewLinkCategory(true);
                        } else {
                          setCreatingNewLinkCategory(false);
                          setNewLinkCategory(e.target.value);
                        }
                      }}
                      aria-label="New link category"
                      className="min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12px] sm:text-xs font-medium text-[#1A120E]"
                    >
                      {availableCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          Cat: {cat.singularLabel}
                        </option>
                      ))}
                      <option value="__create_new__">+ Create custom...</option>
                    </select>
                    <select
                      value={newLinkPreview}
                      onChange={(e) =>
                        setNewLinkPreview(e.target.value as LinkPreviewType)
                      }
                      aria-label="New link preview artwork"
                      className="min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12px] sm:text-xs font-medium text-[#1A120E]"
                    >
                      <option value="auto">Art: Auto Preview</option>
                      <option value="chat">Art: Profile Card</option>
                      <option value="linkhub">Art: Showcase</option>
                      <option value="flib">Art: Editorial Card</option>
                      <option value="chess">Art: Board Grid</option>
                      <option value="image">Art: Image</option>
                    </select>
                  </div>

                  {creatingNewLinkCategory && (
                    <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-[#F4EDE2] border border-[#B89B7E]">
                      <input
                        type="text"
                        value={newLinkCustomCategoryInput}
                        onChange={(e) => setNewLinkCustomCategoryInput(e.target.value)}
                        placeholder="Category name (e.g. SaaS, AI Tool)"
                        aria-label="Inline custom category name"
                        className="flex-1 min-w-[160px] min-h-[34px] px-2.5 py-1 rounded-lg bg-[#FAF6F0] border border-[#B89B7E] text-[12px] sm:text-xs text-[#1A120E]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const createdId = registerCustomCategory(newLinkCustomCategoryInput);
                          if (!createdId) return;
                          setNewLinkCategory(createdId);
                          setCreatingNewLinkCategory(false);
                          setNewLinkCustomCategoryInput('');
                          triggerSavedBanner(
                            `Created & selected category "${formatCategorySingularLabel(createdId)}"`
                          );
                        }}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-[#3A2418] text-[#FAF6F0] text-[11.5px] sm:text-xs font-semibold cursor-pointer"
                      >
                        Create &amp; Select
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCreatingNewLinkCategory(false);
                          setNewLinkCustomCategoryInput('');
                        }}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#FAF6F0] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#3A2418] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Live Card Preview Before Saving */}
                  <div
                    className="p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] space-y-2"
                    data-testid="new-link-live-preview"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#3A2418]">
                        Live Card Preview
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-[#FAF6F0] border border-[#D5C4AE] font-ibm-mono text-[10px] font-semibold text-[#6B4A2E]">
                          {newLinkPreviewFetching
                            ? 'Fetching...'
                            : resolveCardPreviewDisplay({
                                previewType: newLinkPreview,
                                thumbnailUrl: newLinkThumbnailUrl,
                                autoThumbnailUrl: newLinkAutoThumbnailUrl,
                              }).sourceLabel}
                        </span>
                        <button
                          type="button"
                          onClick={handleManualRefreshNewPreview}
                          disabled={newLinkPreviewFetching || !newLinkUrl.trim()}
                          aria-label="Fetch website preview"
                          className="inline-flex items-center gap-1 min-h-[26px] px-2 rounded-md bg-[#FAF6F0] hover:bg-[#EAE0D3] border border-[#B89B7E] font-ibm-mono text-[10px] font-semibold text-[#3A2418] disabled:opacity-45 cursor-pointer"
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${newLinkPreviewFetching ? 'animate-spin' : ''}`}
                          />
                          <span>Fetch</span>
                        </button>
                      </div>
                    </div>

                    <div className="max-w-[300px] p-2 rounded-2xl bg-[#FAF6F0] border border-[#D5C4AE] shadow-2xs space-y-2">
                      <CardPreviewGraphic
                        type={newLinkPreview}
                        thumbnailUrl={newLinkThumbnailUrl}
                        autoThumbnailUrl={newLinkAutoThumbnailUrl}
                        title={
                          newLinkTitle.trim() ||
                          (newLinkUrl.trim()
                            ? deriveLinkTitleFromUrl(newLinkUrl, newLinkFetchedMetaRef.current?.title)
                            : 'New link preview')
                        }
                        isLoading={newLinkPreviewFetching}
                      />
                      <div className="px-1 space-y-0.5">
                        <p className="text-xs font-bold text-[#1A120E] truncate">
                          {newLinkTitle.trim() ||
                            (newLinkUrl.trim()
                              ? deriveLinkTitleFromUrl(newLinkUrl, newLinkFetchedMetaRef.current?.title)
                              : 'Your card title')}
                        </p>
                        <p className="text-[10.5px] font-mono font-semibold text-[#3A2418] truncate">
                          {newLinkDisplayUrl.trim() ||
                            newLinkUrl.trim().replace(/^https?:\/\//, '') ||
                            'example.com'}
                        </p>
                        <p className="text-[10.5px] text-[#3A2418]/85 line-clamp-1">
                          {newLinkDesc.trim() || 'Short description shown on live card'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0">
                      <ImageIcon className="w-4 h-4 text-[#3A2418] shrink-0 hidden sm:block" />
                      <input
                        type="text"
                        value={newLinkThumbnailUrl}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewLinkThumbnailUrl(val);
                          if (val.trim() && newLinkPreview === 'auto') {
                            setNewLinkPreview('image');
                          }
                        }}
                        placeholder="Custom thumbnail URL (overrides auto preview)"
                        aria-label="New link thumbnail URL"
                        className="flex-1 min-w-0 min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E] placeholder-[#5C3D24]"
                      />
                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
                        <label className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#EAE0D3] hover:bg-[#D5C4AE] text-[#1A120E] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold cursor-pointer whitespace-nowrap">
                          <Upload className="w-3.5 h-3.5" />
                          <span>
                            {uploadingSlot === 'new-link-thumb'
                              ? 'Uploading...'
                              : 'Upload Thumb'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const selected = e.target.files?.[0];
                              e.target.value = '';
                              if (!selected) return;
                              openCropperForSlot({
                                slotId: 'new-link-thumb',
                                category: 'thumbnail',
                                title: 'Crop & Resize Link Thumbnail',
                                file: selected,
                                previousStoragePath: newLinkThumbnailPath,
                                onComplete: (publicUrl, staticPath) => {
                                  setNewLinkThumbnailUrl(publicUrl);
                                  setNewLinkThumbnailPath(staticPath);
                                  setNewLinkPreview('image');
                                },
                              });
                            }}
                            className="sr-only"
                          />
                        </label>

                        {(newLinkThumbnailUrl.trim() || newLinkAutoThumbnailUrl.trim()) && (
                          <button
                            type="button"
                            onClick={() =>
                              openCropperForSlot({
                                slotId: 'new-link-thumb',
                                category: 'thumbnail',
                                title: 'Crop & Resize Link Thumbnail',
                                sourceUrl:
                                  newLinkThumbnailUrl.trim() ||
                                  newLinkAutoThumbnailUrl.trim(),
                                previousStoragePath: newLinkThumbnailPath,
                                onComplete: (publicUrl, staticPath) => {
                                  setNewLinkThumbnailUrl(publicUrl);
                                  setNewLinkThumbnailPath(staticPath);
                                  setNewLinkPreview('image');
                                },
                              })
                            }
                            aria-label="Crop or resize new link thumbnail"
                            className="inline-flex items-center justify-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#FAF6F0] hover:bg-[#EAE0D3] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#1A120E] cursor-pointer whitespace-nowrap"
                          >
                            <Crop className="w-3.5 h-3.5" />
                            <span>Crop</span>
                          </button>
                        )}

                        {newLinkThumbnailUrl.trim() && (
                          <button
                            type="button"
                            onClick={() => {
                              const oldPath = newLinkThumbnailPath;
                              setNewLinkThumbnailUrl('');
                              setNewLinkThumbnailPath('');
                              if (newLinkPreview === 'image') {
                                setNewLinkPreview('auto');
                              }
                              if (oldPath) {
                                deleteMediaFromFirebaseStorage({
                                  storagePath: oldPath,
                                  ownerUid,
                                }).catch(() => {});
                              }
                            }}
                            className="inline-flex items-center justify-center min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#3A2418] cursor-pointer whitespace-nowrap"
                          >
                            Clear
                          </button>
                        )}

                        <button
                          type="submit"
                          className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3.5 py-1.5 rounded-lg sm:rounded-xl bg-[#3A2418] hover:bg-[#6B4A2E] text-[#FAF6F0] text-[11.5px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Card</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              )}
            </div>

            {/* Existing Link Cards (Organized Collapsible Accordions for Mobile Simplicity) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-ibm-mono text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-[#3A2418]">
                  Saved Links ({config.links.length}) · Tap card to edit
                </h3>
              </div>
              {config.links.length === 0 && (
                <div className="p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-dashed border-[#B89B7E] text-center text-xs font-medium text-[#3A2418]">
                  No link cards saved yet. Use the form above to add your first project, product, or external link.
                </div>
              )}
              {config.links.map((item, idx) => {
                const isExpanded = Boolean(expandedLinkIds[item.id]);
                return (
                  <div
                    key={item.id}
                    className="rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] overflow-hidden"
                  >
                    {/* Compact Accordion Summary Row */}
                    <div className="p-2.5 sm:p-3.5 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedLinkIds((prev) => ({
                            ...prev,
                            [item.id]: !prev[item.id],
                          }))
                        }
                        aria-expanded={isExpanded}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer py-0.5"
                      >
                        <span className="px-1.5 py-0.5 rounded-md bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[10px] font-bold text-[#3A2418] shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-[12.5px] sm:text-sm font-bold text-[#1A120E] truncate">
                              {item.title}
                            </span>
                            {item.pinned && (
                              <Pin className="w-3 h-3 text-[#6B4A2E] shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 font-ibm-mono text-[10px] text-[#5C3D24] truncate">
                            <span>{formatCategorySingularLabel(item.category)}</span>
                            <span>·</span>
                            <span>{item.clicks} clicks</span>
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleUpdateLink(item.id, { pinned: !item.pinned })}
                          aria-label={item.pinned ? `Unpin ${item.title}` : `Pin ${item.title}`}
                          className={`inline-flex items-center justify-center min-h-[34px] min-w-[34px] px-2 rounded-lg text-[11px] font-semibold cursor-pointer ${
                            item.pinned
                              ? 'bg-[#3A2418] text-[#FAF6F0]'
                              : 'bg-[#F4EDE2] text-[#3A2418] border border-[#B89B7E]'
                          }`}
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedLinkIds((prev) => ({
                              ...prev,
                              [item.id]: !prev[item.id],
                            }))
                          }
                          aria-label={isExpanded ? `Collapse ${item.title}` : `Edit ${item.title}`}
                          className="inline-flex items-center justify-center gap-1 min-h-[34px] px-2.5 rounded-lg bg-[#F4EDE2] hover:bg-[#EAE0D3] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#1A120E] cursor-pointer"
                        >
                          <span>{isExpanded ? 'Done' : 'Edit'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Link Details & Controls */}
                    {isExpanded && (
                      <div className="px-2.5 pb-3 sm:px-4 sm:pb-4 pt-2.5 border-t border-[#D5C4AE] space-y-2.5 bg-[#FAF6F0]">
                        {/* Live Card Preview inside Expanded Editor */}
                        <div className="p-2.5 rounded-xl bg-[#F4EDE2] border border-[#D5C4AE] space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#3A2418]">
                              Card Preview
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-[#FAF6F0] border border-[#D5C4AE] font-ibm-mono text-[10px] font-semibold text-[#6B4A2E]">
                                {fetchingLinkIds[item.id]
                                  ? 'Fetching...'
                                  : resolveCardPreviewDisplay({
                                      previewType: item.previewType,
                                      thumbnailUrl: item.thumbnailUrl,
                                      autoThumbnailUrl: item.autoThumbnailUrl,
                                    }).sourceLabel}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (item.previewType !== 'auto') {
                                    handleUpdateLink(item.id, { previewType: 'auto' });
                                  }
                                  fetchPreviewForSavedLink(item.id, item.url);
                                }}
                                disabled={Boolean(fetchingLinkIds[item.id])}
                                aria-label={`Refresh preview for ${item.title}`}
                                className="inline-flex items-center gap-1 min-h-[26px] px-2 rounded-md bg-[#FAF6F0] hover:bg-[#EAE0D3] border border-[#B89B7E] font-ibm-mono text-[10px] font-semibold text-[#3A2418] disabled:opacity-45 cursor-pointer"
                              >
                                <RefreshCw
                                  className={`w-3 h-3 ${
                                    fetchingLinkIds[item.id] ? 'animate-spin' : ''
                                  }`}
                                />
                                <span>Refresh</span>
                              </button>
                            </div>
                          </div>
                          <div className="max-w-[280px]">
                            <CardPreviewGraphic
                              type={item.previewType}
                              thumbnailUrl={item.thumbnailUrl}
                              autoThumbnailUrl={item.autoThumbnailUrl}
                              title={item.title}
                              isLoading={Boolean(fetchingLinkIds[item.id])}
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <select
                              value={
                                editingCategoryLinkId === item.id
                                  ? '__create_new__'
                                  : normalizeCategoryId(item.category) || 'project'
                              }
                              onChange={(e) => {
                                if (e.target.value === '__create_new__') {
                                  setEditingCategoryLinkId(item.id);
                                  setEditingCategoryDraft('');
                                } else {
                                  setEditingCategoryLinkId(null);
                                  handleUpdateLink(item.id, { category: e.target.value });
                                  triggerSavedBanner(
                                    `Updated "${item.title}" to ${formatCategorySingularLabel(
                                      e.target.value
                                    )}`
                                  );
                                }
                              }}
                              aria-label={`Category for ${item.title}`}
                              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[12px] font-semibold text-[#1A120E] cursor-pointer"
                            >
                              {availableCategories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.singularLabel}
                                </option>
                              ))}
                              <option value="__create_new__">+ New category...</option>
                            </select>

                            <select
                              value={item.previewType}
                              onChange={(e) => {
                                const nextArt = e.target.value as LinkPreviewType;
                                handleUpdateLink(item.id, { previewType: nextArt });
                                if (nextArt === 'auto' && !item.autoThumbnailUrl && !item.thumbnailUrl) {
                                  fetchPreviewForSavedLink(item.id, item.url);
                                }
                              }}
                              aria-label={`Artwork for ${item.title}`}
                              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[12px] font-semibold text-[#1A120E] cursor-pointer"
                            >
                              <option value="auto">Art: Auto Preview</option>
                              <option value="chat">Art: Profile Card</option>
                              <option value="linkhub">Art: Showcase</option>
                              <option value="flib">Art: Editorial Card</option>
                              <option value="chess">Art: Board Grid</option>
                              <option value="image">Art: Image</option>
                            </select>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <label className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-[#F4EDE2] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[11.5px] font-semibold text-[#1A120E] cursor-pointer">
                              <Upload className="w-3 h-3" />
                              <span>
                                {uploadingSlot === item.id ? 'Uploading...' : 'Thumbnail'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const selected = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!selected) return;
                                  openCropperForSlot({
                                    slotId: item.id,
                                    category: 'thumbnail',
                                    title: `Crop Thumbnail · ${item.title}`,
                                    file: selected,
                                    previousStoragePath: item.thumbnailPath,
                                    onComplete: (publicUrl, staticPath) => {
                                      const latest = configRef.current;
                                      const nextConfig: SiteConfigState = {
                                        ...latest,
                                        links: latest.links.map((lnk) =>
                                          lnk.id === item.id
                                            ? {
                                                ...lnk,
                                                previewType: 'image',
                                                thumbnailUrl: publicUrl,
                                                thumbnailPath: staticPath,
                                              }
                                            : lnk
                                        ),
                                      };
                                      void persistConfigToCloudNow(nextConfig);
                                    },
                                  });
                                }}
                                className="sr-only"
                              />
                            </label>
                            {(item.thumbnailUrl?.trim() || item.autoThumbnailUrl?.trim()) && (
                              <button
                                type="button"
                                onClick={() =>
                                  openCropperForSlot({
                                    slotId: item.id,
                                    category: 'thumbnail',
                                    title: `Crop Thumbnail · ${item.title}`,
                                    sourceUrl:
                                      item.thumbnailUrl?.trim() ||
                                      item.autoThumbnailUrl?.trim(),
                                    previousStoragePath: item.thumbnailPath,
                                    onComplete: (publicUrl, staticPath) => {
                                      const latest = configRef.current;
                                      const nextConfig: SiteConfigState = {
                                        ...latest,
                                        links: latest.links.map((lnk) =>
                                          lnk.id === item.id
                                            ? {
                                                ...lnk,
                                                previewType: 'image',
                                                thumbnailUrl: publicUrl,
                                                thumbnailPath: staticPath,
                                              }
                                            : lnk
                                        ),
                                      };
                                      void persistConfigToCloudNow(nextConfig);
                                    },
                                  })
                                }
                                aria-label={`Crop thumbnail for ${item.title}`}
                                className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-[#FAF6F0] hover:bg-[#EAE0D3] border border-[#B89B7E] text-[11px] font-semibold text-[#1A120E] cursor-pointer"
                              >
                                <Crop className="w-3 h-3" />
                                <span>Crop</span>
                              </button>
                            )}
                            {item.thumbnailUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  const oldThumbPath = item.thumbnailPath;
                                  const nextType: LinkPreviewType =
                                    item.previewType === 'image' ? 'auto' : item.previewType;
                                  const latest = configRef.current;
                                  const nextConfig: SiteConfigState = {
                                    ...latest,
                                    links: latest.links.map((lnk) =>
                                      lnk.id === item.id
                                        ? {
                                            ...lnk,
                                            previewType: nextType,
                                            thumbnailUrl: '',
                                            thumbnailPath: '',
                                          }
                                        : lnk
                                    ),
                                  };
                                  void persistConfigToCloudNow(nextConfig);
                                  if (nextType === 'auto' && !item.autoThumbnailUrl) {
                                    fetchPreviewForSavedLink(item.id, item.url);
                                  }
                                  if (oldThumbPath) {
                                    deleteMediaFromFirebaseStorage({
                                      storagePath: oldThumbPath,
                                      ownerUid,
                                    }).catch(() => {});
                                  }
                                }}
                                className="min-h-[34px] px-2 py-1 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[11px] font-semibold text-[#3A2418] cursor-pointer"
                              >
                                Clear Image
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleMoveLink(idx, -1)}
                              disabled={idx === 0}
                              aria-label={`Move ${item.title} up`}
                              className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[#1A120E] disabled:opacity-40 cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLink(idx, 1)}
                              disabled={idx === config.links.length - 1}
                              aria-label={`Move ${item.title} down`}
                              className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[#1A120E] disabled:opacity-40 cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLink(item.id)}
                              aria-label={`Delete ${item.title}`}
                              className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg bg-[#F4EDE2] hover:bg-[#3A2418] hover:text-[#FAF6F0] border border-[#B89B7E] text-[#3A2418] transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => handleUpdateLink(item.id, { title: e.target.value })}
                            aria-label="Link title"
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs font-semibold text-[#1A120E]"
                          />
                          <input
                            type="text"
                            value={item.url}
                            onChange={(e) => {
                              const nextUrl = e.target.value;
                              handleUpdateLink(item.id, { url: nextUrl });
                              if (item.previewType === 'auto') {
                                scheduleSavedLinkPreviewFetch(item.id, nextUrl);
                              }
                            }}
                            aria-label="Link URL"
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                          />
                          <input
                            type="text"
                            value={item.displayUrl}
                            onChange={(e) =>
                              handleUpdateLink(item.id, { displayUrl: e.target.value })
                            }
                            aria-label="Display URL"
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#3A2418]"
                          />
                        </div>

                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) =>
                            handleUpdateLink(item.id, { description: e.target.value })
                          }
                          aria-label="Link description"
                          className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
                        />

                        {(item.previewType === 'image' || Boolean(item.thumbnailUrl)) && (
                          <input
                            type="text"
                            value={item.thumbnailUrl || ''}
                            onChange={(e) =>
                              handleUpdateLink(item.id, { thumbnailUrl: e.target.value })
                            }
                            placeholder="Custom thumbnail image URL (overrides auto preview)"
                            aria-label={`Custom thumbnail URL for ${item.title}`}
                            className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[11.5px] sm:text-xs text-[#1A120E]"
                          />
                        )}

                        {editingCategoryLinkId === item.id && (
                          <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-[#F4EDE2] border border-[#B89B7E]">
                            <input
                              type="text"
                              value={editingCategoryDraft}
                              onChange={(e) => setEditingCategoryDraft(e.target.value)}
                              placeholder="Custom category name (e.g. Portfolio, SaaS)"
                              aria-label={`New custom category for ${item.title}`}
                              className="flex-1 min-w-[160px] min-h-[34px] px-2.5 py-1 rounded-lg bg-[#FAF6F0] border border-[#B89B7E] text-[12px] sm:text-xs text-[#1A120E]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const added = addOrRestoreCategoryEntry(
                                  config.customCategories || [],
                                  editingCategoryDraft
                                );
                                if (!added.categoryId) return;
                                const createdId = added.categoryId;
                                onUpdateConfig({
                                  ...config,
                                  customCategories: added.nextCustomCategories,
                                  links: config.links.map((lnk) =>
                                    lnk.id === item.id ? { ...lnk, category: createdId } : lnk
                                  ),
                                });
                                setEditingCategoryLinkId(null);
                                setEditingCategoryDraft('');
                                triggerSavedBanner(
                                  `Applied category "${formatCategorySingularLabel(
                                    createdId
                                  )}"`
                                );
                              }}
                              className="min-h-[34px] px-3 py-1 rounded-lg bg-[#3A2418] text-[#FAF6F0] text-[11.5px] sm:text-xs font-semibold cursor-pointer"
                            >
                              Apply Category
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategoryLinkId(null);
                                setEditingCategoryDraft('');
                              }}
                              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#FAF6F0] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#3A2418] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Featured Song & Map Editor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
              {/* Music Card Config */}
              <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Music className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#3A2418]" />
                    <h3 className="font-ibm-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                      Featured Song Card
                    </h3>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.showSongCard}
                    onChange={(e) =>
                      onUpdateConfig({ ...config, showSongCard: e.target.checked })
                    }
                    aria-label="Toggle Featured Song card"
                    className="accent-[#3A2418]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[12px] font-bold text-[#1A120E]">
                      Track Title
                    </label>
                    <input
                      type="text"
                      value={config.featuredSong.title}
                      onChange={(e) =>
                        onUpdateConfig({
                          ...config,
                          featuredSong: { ...config.featuredSong, title: e.target.value },
                        })
                      }
                      className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12px] sm:text-xs text-[#1A120E]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[12px] font-bold text-[#1A120E]">
                      Artist Name
                    </label>
                    <input
                      type="text"
                      value={config.featuredSong.artist}
                      onChange={(e) =>
                        onUpdateConfig({
                          ...config,
                          featuredSong: { ...config.featuredSong, artist: e.target.value },
                        })
                      }
                      className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12px] sm:text-xs text-[#1A120E]"
                    />
                  </div>
                </div>

                {(
                  [
                    { id: 'spotify', name: 'Spotify', placeholder: 'https://open.spotify.com/track/...' },
                    { id: 'apple', name: 'Apple Music', placeholder: 'https://music.apple.com/...' },
                    { id: 'deezer', name: 'Deezer', placeholder: 'https://www.deezer.com/track/...' },
                  ] as const
                ).map((slot) => {
                  const existing = config.featuredSong.platforms.find(
                    (p) => p.id === slot.id || p.name.toLowerCase() === slot.name.toLowerCase()
                  );
                  return (
                    <div key={slot.id} className="space-y-1">
                      <label className="block text-[11.5px] font-ibm-mono font-bold text-[#3A2418]">
                        {slot.name} URL
                      </label>
                      <input
                        type="url"
                        value={existing?.url || ''}
                        placeholder={slot.placeholder}
                        onChange={(e) => {
                          const nextUrl = e.target.value;
                          const rest = config.featuredSong.platforms.filter(
                            (p) =>
                              p.id !== slot.id &&
                              p.name.toLowerCase() !== slot.name.toLowerCase()
                          );
                          const nextPlatforms = nextUrl.trim()
                            ? [
                                ...rest,
                                {
                                  id: slot.id,
                                  name: slot.name,
                                  url: nextUrl,
                                  duration: existing?.duration || '',
                                },
                              ]
                            : rest;
                          onUpdateConfig({
                            ...config,
                            featuredSong: {
                              ...config.featuredSong,
                              platforms: nextPlatforms,
                            },
                          });
                        }}
                        className="w-full min-h-[34px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[11.5px] sm:text-[11px] text-[#1A120E]"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Location Map Card Config */}
              {renderLocationMapEditor('links')}
            </div>
          </section>
        )}

        {/* TAB 4: SOCIAL ICONS */}
        {activeTab === 'socials' && (
          <section aria-label="Social Links editor" className="space-y-4">
            <form
              onSubmit={handleAddSocial}
              className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5"
            >
              <h2 className="font-ibm-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                Add Social Profile Button
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                <select
                  value={newSocialPlatform}
                  onChange={(e) => setNewSocialPlatform(e.target.value as SocialPlatform)}
                  aria-label="Social platform"
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12px] sm:text-xs font-medium text-[#1A120E]"
                >
                  {SOCIAL_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p.toUpperCase()}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newSocialLabel}
                  onChange={(e) => setNewSocialLabel(e.target.value)}
                  placeholder="Label (e.g. GitHub)"
                  aria-label="Social label"
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12px] sm:text-xs text-[#1A120E]"
                />
                <input
                  type="text"
                  value={newSocialHandle}
                  onChange={(e) => setNewSocialHandle(e.target.value)}
                  placeholder="Handle (e.g. @username)"
                  aria-label="Social handle"
                  className="col-span-2 sm:col-span-1 min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                />
                <input
                  type="text"
                  value={newSocialUrl}
                  onChange={(e) => setNewSocialUrl(e.target.value)}
                  placeholder="https://..."
                  aria-label="Social URL"
                  className="col-span-2 sm:col-span-1 min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs text-[#1A120E]"
                />
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 min-h-[36px] px-4 py-1.5 rounded-lg sm:rounded-xl bg-[#3A2418] hover:bg-[#6B4A2E] text-[#FAF6F0] text-[11.5px] sm:text-xs font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Social Icon</span>
              </button>
            </form>

            {config.socials.length === 0 ? (
              <div className="p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-dashed border-[#B89B7E] text-center text-xs font-medium text-[#3A2418]">
                No social links added yet. Add your profiles above to show them under your bio.
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              {config.socials.map((soc) => (
                <div
                  key={soc.id}
                  className="p-3 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#3A2418] text-[#FAF6F0] flex items-center justify-center shrink-0">
                        <BrandIcon platform={soc.platform} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </span>
                      <span className="text-[12.5px] sm:text-xs font-bold text-[#1A120E] truncate">{soc.label}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteSocial(soc.id)}
                      aria-label={`Remove ${soc.label}`}
                      className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-lg bg-[#F4EDE2] hover:bg-[#3A2418] hover:text-[#FAF6F0] text-[#3A2418] border border-[#D5C4AE] transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={soc.handle}
                      onChange={(e) =>
                        handleUpdateSocial(soc.id, { handle: e.target.value })
                      }
                      aria-label={`${soc.label} handle`}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[11.5px] sm:text-[11px] text-[#1A120E]"
                    />
                    <input
                      type="text"
                      value={soc.url}
                      onChange={(e) => handleUpdateSocial(soc.id, { url: e.target.value })}
                      aria-label={`${soc.label} URL`}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[11.5px] sm:text-[11px] text-[#1A120E]"
                    />
                  </div>
                </div>
              ))}
            </div>
            )}
          </section>
        )}

        {/* TAB 5: BLOG POSTS */}
        {activeTab === 'posts' && (
          <section aria-label="Blog posts manager" className="space-y-4">
            <div className="rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAddPostForm((prev) => !prev)}
                aria-expanded={showAddPostForm}
                className="w-full min-h-[46px] sm:min-h-[52px] px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-2.5 bg-[#FAF6F0] hover:bg-[#F4EDE2] text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-[#3A2418] text-[#FAF6F0] flex items-center justify-center shrink-0">
                    <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </span>
                  <div className="min-w-0">
                    <span className="block font-ibm-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#1A120E] truncate">
                      Publish New Article / Post
                    </span>
                    <span className="block text-[10.5px] sm:text-[11px] text-[#5C3D24] truncate">
                      Write a note or essay for your Posts page
                    </span>
                  </div>
                </div>
                {showAddPostForm ? (
                  <ChevronUp className="w-4 h-4 text-[#3A2418] shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#3A2418] shrink-0" />
                )}
              </button>

              {showAddPostForm && (
                <form
                  onSubmit={handleAddPost}
                  className="p-3.5 sm:p-4 pt-2.5 border-t border-[#D5C4AE] space-y-2.5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      value={newPostTitle}
                      onChange={(e) => setNewPostTitle(e.target.value)}
                      placeholder="Article title"
                      aria-label="New post title"
                      className="sm:col-span-2 min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
                    />
                    <input
                      type="text"
                      value={newPostCategory}
                      onChange={(e) => setNewPostCategory(e.target.value)}
                      placeholder="Category (e.g. Engineering)"
                      aria-label="New post category"
                      className="min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
                    />
                  </div>
                  <input
                    type="text"
                    value={newPostExcerpt}
                    onChange={(e) => setNewPostExcerpt(e.target.value)}
                    placeholder="Short summary excerpt..."
                    aria-label="New post excerpt"
                    className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E]"
                  />
                  <textarea
                    rows={4}
                    value={newPostBody}
                    onChange={(e) => setNewPostBody(e.target.value)}
                    placeholder="Write article paragraphs (separate paragraphs with a blank line)..."
                    aria-label="New post content"
                    className="w-full px-3 py-2 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E] resize-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1.5 min-h-[38px] sm:min-h-[36px] w-full sm:w-auto px-4 py-1.5 rounded-lg sm:rounded-xl bg-[#3A2418] hover:bg-[#6B4A2E] text-[#FAF6F0] text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Publish Post</span>
                  </button>
                </form>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-ibm-mono text-[11px] font-bold uppercase tracking-wider text-[#3A2418]">
                  Published Posts ({config.posts.length}) · Tap post to edit
                </h3>
              </div>
              {config.posts.length === 0 && (
                <div className="p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-dashed border-[#B89B7E] text-center text-xs font-medium text-[#3A2418]">
                  No posts published yet. Write your first note or essay above.
                </div>
              )}
              {config.posts.map((post) => {
                const isExpanded = Boolean(expandedPostSlugs[post.slug]);
                return (
                  <div
                    key={post.slug}
                    className="rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] overflow-hidden"
                  >
                    <div className="p-2.5 sm:p-4 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPostSlugs((prev) => ({
                            ...prev,
                            [post.slug]: !prev[post.slug],
                          }))
                        }
                        aria-expanded={isExpanded}
                        className="flex-1 min-w-0 text-left cursor-pointer py-0.5"
                      >
                        <span className="block text-[12.5px] sm:text-sm font-bold text-[#1A120E] truncate">
                          {post.title}
                        </span>
                        <span className="block font-ibm-mono text-[10px] text-[#5C3D24] truncate">
                          {post.category} · {post.date} · {post.readTime}
                        </span>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPostSlugs((prev) => ({
                              ...prev,
                              [post.slug]: !prev[post.slug],
                            }))
                          }
                          aria-label={isExpanded ? `Collapse ${post.title}` : `Edit ${post.title}`}
                          className="inline-flex items-center gap-1 min-h-[34px] px-2.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] hover:bg-[#EAE0D3] border border-[#B89B7E] text-[11.5px] sm:text-xs font-semibold text-[#1A120E] cursor-pointer"
                        >
                          <span>{isExpanded ? 'Done' : 'Edit'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePost(post.slug)}
                          aria-label={`Delete post ${post.title}`}
                          className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg sm:rounded-xl bg-[#F4EDE2] hover:bg-[#3A2418] hover:text-[#FAF6F0] border border-[#B89B7E] text-[#3A2418] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-2.5 pb-3 sm:px-4 sm:pb-4 pt-2.5 border-t border-[#D5C4AE] space-y-2">
                        <input
                          type="text"
                          value={post.title}
                          onChange={(e) =>
                            handleUpdatePost(post.slug, { title: e.target.value })
                          }
                          aria-label="Post title"
                          className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs font-bold text-[#1A120E]"
                        />
                        <textarea
                          rows={3}
                          value={post.excerpt}
                          onChange={(e) =>
                            handleUpdatePost(post.slug, { excerpt: e.target.value })
                          }
                          aria-label="Post excerpt"
                          className="w-full px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs text-[#1A120E] resize-none"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 6: SIMPLE SYSTEM DESIGN & PANTONE® CUSTOM COLOR PICKER */}
        {activeTab === 'design' && (
          <section aria-label="System Design color settings" className="space-y-4">
            {/* Compact Active Theme Bar */}
            <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#3A2418] text-[#FAF6F0] border border-[#6B4A2E] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-9 h-9 rounded-lg sm:rounded-xl border border-[#FAF6F0]/70 shrink-0"
                  style={{ backgroundColor: config.designSystem.canvasBg }}
                />
                <div className="min-w-0">
                  <p className="font-ibm-mono text-[10px] uppercase tracking-wider text-[#D5C4AE] truncate">
                    {config.designSystem.pantoneCode || 'PANTONE 19-1118 TCX'} · Active System
                  </p>
                  <h2 className="text-[13px] sm:text-sm font-bold text-[#FAF6F0] truncate">
                    {config.designSystem.name}
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
                <label className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#6B4A2E]/60 border border-[#A88462]/50 text-[11.5px] sm:text-xs font-semibold text-[#FAF6F0] cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={config.designSystem.textureEnabled}
                    onChange={(e) =>
                      updateDesignField('textureEnabled', e.target.checked)
                    }
                    className="accent-[#FAF6F0]"
                  />
                  <span>Textured BG</span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    onUpdateConfig({ ...config, designSystem: SAVED_DESIGN_SYSTEM });
                    setPantoneInputHex(
                      SAVED_DESIGN_SYSTEM.customSeedHex || SAVED_DESIGN_SYSTEM.canvasBg
                    );
                    triggerSavedBanner(
                      'Restored Default System Design (PANTONE 19-1118 TCX)'
                    );
                  }}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#FAF6F0] hover:bg-[#D5C4AE] text-[#1A120E] text-[11.5px] sm:text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore Default</span>
                </button>
              </div>
            </div>

            {/* Quick Pantone® Theme Switcher */}
            <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <h3 className="font-ibm-mono text-[11.5px] sm:text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                    Pantone® Quick Theme Switcher
                  </h3>
                  <p className="text-[11px] sm:text-xs text-[#3A2418]">
                    Enter any hex or Pantone code, or click a swatch to switch all colors together.
                  </p>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto shrink-0">
                  <input
                    type="color"
                    aria-label="Pick theme seed color"
                    value={normalizeHexColorCode(pantoneInputHex) || '#4A3324'}
                    onChange={(e) => setPantoneInputHex(e.target.value.toUpperCase())}
                    className="w-9 h-9 rounded-lg border border-[#B89B7E] cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={pantoneInputHex}
                    onChange={(e) => setPantoneInputHex(e.target.value)}
                    placeholder="#0F4C81"
                    aria-label="Custom hex color code or Pantone code"
                    className="flex-1 min-w-[100px] sm:w-32 sm:flex-none min-h-[36px] px-2.5 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] font-ibm-mono text-[12px] sm:text-xs font-bold text-[#1A120E]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const matched = resolvePantoneFromColorCode(
                        pantoneInputHex,
                        'warm-paper',
                        config.designSystem.textureEnabled
                      );
                      onUpdateConfig({
                        ...config,
                        designSystem: matched.designSystem,
                      });
                      triggerSavedBanner(
                        `Switched website to ${matched.code} · ${matched.name}`
                      );
                    }}
                    className="w-full sm:w-auto min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg sm:rounded-xl bg-[#1A120E] hover:bg-[#3A2418] text-[#FAF6F0] text-xs font-semibold cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Apply Pantone System</span>
                  </button>
                </div>
              </div>

              {/* Compact Pantone Swatch Chips */}
              <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-0.5">
                {PANTONE_INSTITUTE_CATALOG.map((swatch) => {
                  const isActive =
                    config.designSystem.pantoneCode === swatch.code ||
                    config.designSystem.name === swatch.designSystem.name;
                  return (
                    <button
                      key={swatch.code}
                      type="button"
                      onClick={() => {
                        setPantoneInputHex(swatch.hex);
                        onUpdateConfig({
                          ...config,
                          designSystem: {
                            ...swatch.designSystem,
                            textureEnabled: config.designSystem.textureEnabled,
                          },
                        });
                        triggerSavedBanner(`Applied ${swatch.code} · ${swatch.name}`);
                      }}
                      title={`${swatch.code} · ${swatch.name} (${swatch.hex})`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg sm:rounded-xl border text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#3A2418] text-[#FAF6F0] border-[#1A120E]'
                          : 'bg-[#F4EDE2] text-[#1A120E] border-[#B89B7E] hover:border-[#3A2418]'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-black/20 shrink-0"
                        style={{ backgroundColor: swatch.hex }}
                      />
                      <span>{swatch.isDefault ? 'Default Espresso' : swatch.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Direct Custom Color Pickers by Purpose */}
            <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-3">
              <div>
                <h3 className="font-ibm-mono text-[11.5px] sm:text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                  Custom Color by Purpose
                </h3>
                <p className="text-[11px] sm:text-xs text-[#3A2418]">
                  Pick a custom color for any part of your Link Hub below — updates apply live and show the matching Pantone® TCX code.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                {purposeColorFields.map((field) => {
                  const currentVal = config.designSystem[field.key];
                  const safeHex = normalizeHexColorCode(currentVal) || '#4A3324';
                  const matchedPantone = resolvePantoneFromColorCode(safeHex);
                  return (
                    <div
                      key={field.key}
                      className="p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="color"
                          aria-label={`Choose color for ${field.label}`}
                          value={safeHex}
                          onChange={(e) => {
                            const nextHex = e.target.value.toUpperCase();
                            onUpdateConfig({
                              ...config,
                              designSystem: {
                                ...config.designSystem,
                                [field.key]: nextHex,
                                pantoneCode: 'CUSTOM PANTONE®',
                                name: 'Custom Purpose Palette',
                              },
                            });
                          }}
                          className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-[#B89B7E] cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <label
                            htmlFor={`purpose-hex-${field.key}`}
                            className="block text-[12px] font-bold text-[#1A120E] truncate"
                          >
                            {field.label}
                          </label>
                          <p className="text-[10.5px] sm:text-[11px] text-[#3A2418] truncate">
                            {field.purpose}
                          </p>
                          <span className="block font-ibm-mono text-[9.5px] sm:text-[10px] font-semibold text-[#6B4A2E] truncate">
                            {matchedPantone.code}
                          </span>
                        </div>
                      </div>

                      <input
                        id={`purpose-hex-${field.key}`}
                        type="text"
                        value={currentVal}
                        onChange={(e) => {
                          const raw = e.target.value;
                          onUpdateConfig({
                            ...config,
                            designSystem: {
                              ...config.designSystem,
                              [field.key]: raw,
                              pantoneCode: 'CUSTOM PANTONE®',
                              name: 'Custom Purpose Palette',
                            },
                          });
                        }}
                        aria-label={`${field.label} hex code`}
                        className="w-20 sm:w-24 min-h-[34px] px-2 py-1 rounded-lg bg-[#FAF6F0] border border-[#B89B7E] font-ibm-mono text-[11px] sm:text-xs font-bold text-[#1A120E] text-center shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* TAB 7: VISUAL ANALYTICS */}
        {activeTab === 'analytics' && (
          <AdminAnalyticsTab
            config={config}
            analyticsEvents={analyticsEvents}
            onUpdateLink={handleUpdateLink}
          />
        )}

        {/* TAB 8: DEVELOPER TOOLS */}
        {activeTab === 'devtools' && (
          <AdminDevToolsTab
            config={config}
            onUpdateLink={handleUpdateLink}
            onExportJson={handleExportJson}
            onNotify={triggerSavedBanner}
          />
        )}

        {/* TAB 9: UNIFIED MESSAGES INBOX */}
        {activeTab === 'messages' && (
          <AdminMessagesTab
            messages={messages}
            subscribers={subscribers}
            onDeleteMessage={onDeleteMessage}
            onToggleMessageRead={onToggleMessageRead}
          />
        )}

        {/* TAB 10: BIOMETRICS & SECURITY PASSKEYS + WORKSPACE MAINTENANCE */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            <BiometricSecurityTab
              ownerUid={ownerUid}
              ownerEmail={ownerEmail}
              displayName={config.profile.name}
              passkeys={passkeys}
              biometricLockEnabled={biometricLockEnabled}
              onToggleBiometricLock={onToggleBiometricLock}
              onLockStudioNow={onLockStudio}
              onNotify={triggerSavedBanner}
            />

            <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2.5">
              <div>
                <h3 className="font-ibm-mono text-[11.5px] sm:text-xs font-bold uppercase tracking-wider text-[#1A120E]">
                  Workspace Maintenance &amp; Backups
                </h3>
                <p className="text-[11px] sm:text-xs text-[#3A2418]">
                  Download a full JSON backup of your Link Hub configuration, restore factory Pantone defaults, or sign out of Google Auth.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-lg sm:rounded-xl bg-[#F4EDE2] hover:bg-[#D5C4AE] text-[#1A120E] border border-[#B89B7E] text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Config JSON</span>
                </button>
                <button
                  type="button"
                  disabled={savingToCloud}
                  onClick={() => {
                    handleResetToSavedSystem().catch(() => {});
                  }}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-lg sm:rounded-xl bg-[#F4EDE2] hover:bg-[#D5C4AE] disabled:opacity-60 text-[#3A2418] border border-[#B89B7E] text-xs font-semibold cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore Default System</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSignOut().catch(() => {});
                  }}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-lg sm:rounded-xl bg-[#3A2418] hover:bg-[#1A120E] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out of Studio</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MOBILE STICKY ADMIN BOTTOM THUMB DOCK (<640px) */}
      <nav
        aria-label="Mobile Studio Workspaces"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[#B89B7E] bg-[#FAF6F0]/95 backdrop-blur-md shadow-[0_-10px_28px_rgba(26,18,14,0.28)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="h-[58px] px-1.5 grid grid-cols-5 items-center gap-1">
          {ADMIN_WORKSPACE_GROUPS.map((group) => {
            const isActiveGroup = activeWorkspaceGroup.id === group.id;
            const badge = workspaceBadges[group.id];
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => handleSelectWorkspaceGroup(group.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl px-1 transition-all cursor-pointer ${
                  isActiveGroup
                    ? 'bg-[#3A2418] text-[#FAF6F0] shadow-xs'
                    : 'text-[#3A2418] hover:bg-[#F4EDE2]'
                }`}
              >
                {renderWorkspaceIcon(group.id, 'w-4 h-4')}
                <span className="text-[10px] font-bold tracking-tight leading-none">
                  {group.shortLabel}
                </span>
                {badge !== undefined && typeof badge === 'number' && badge > 0 && (
                  <span
                    className={`absolute top-0.5 right-1 min-w-[15px] h-[15px] px-1 rounded-full font-ibm-mono text-[8.5px] font-bold flex items-center justify-center ${
                      isActiveGroup
                        ? 'bg-[#A88462] text-[#FAF6F0]'
                        : 'bg-[#3A2418] text-[#FAF6F0]'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={handleExplicitSave}
            disabled={savingToCloud}
            aria-label="Save changes to live site"
            className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl px-1 bg-[#1A120E] hover:bg-[#3A2418] disabled:opacity-60 text-[#FAF6F0] transition-colors cursor-pointer"
          >
            {savingToCloud ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span className="text-[10px] font-bold tracking-tight leading-none">
              {savingToCloud ? 'Sync' : 'Save'}
            </span>
          </button>
        </div>
      </nav>
      {cropSession && (
        <ImageCropModal
          session={cropSession}
          onClose={() => setCropSession(null)}
        />
      )}
    </div>
  );
};

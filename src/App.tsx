import React, { useState, useEffect, useRef } from 'react';
import {
  Briefcase,
  Bell,
  FileText,
  CreditCard,
  Share2,
  Mail,
  Check,
  Send,
  ArrowUp,
  Coffee,
  ExternalLink,
  MapPin,
  Home,
} from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  DEFAULT_SITE_CONFIG,
  isHubConfigured,
  isUntouchedLegacyDemoHub,
  loadSavedSiteConfig,
  saveSiteConfigToStorage,
  type SiteConfigState,
} from './data/profileData';
import {
  DEFAULT_FAVICON_SVG_PATH,
  DEFAULT_OG_LOGO_PATH,
  DEFAULT_PUBLIC_URL_PATH,
  buildLandingSeoMetadata,
  buildStructuredDataJsonLd,
} from './utils/seoAndGeo';
import {
  validateContactSubmission,
  evaluateSubmissionSecurityGuard,
  type ValidationResult,
} from './utils/hubLogic';
import {
  auth,
  OWNER_ADMIN_EMAIL,
  evaluateAdminAccessGuard,
  initFirebaseAnalytics,
  testConnection,
  type AdminGuardEvaluation,
} from './services/firebase';
import {
  signInOwnerWithGoogle,
  signOutOwner,
  verifyAndLockSoloOwner,
  subscribePublicHubAndLinks,
  submitVisitorMessageToFirestore,
  submitSubscriberToFirestore,
  trackPublicLinkClick,
  trackPublicProfileView,
  subscribeAdminInboxAndTelemetry,
  subscribeAdminPasskeys,
  touchAdminPasskeyUsage,
  deleteAdminMessageFromFirestore,
  toggleAdminMessageRead,
  type FirestoreAnalyticsRecord,
  type AdminSubscriberRecord,
} from './services/firebaseHubService';
import {
  isBiometricLockPreferred,
  loadPairedDevicePasskeys,
  setBiometricLockPreferred,
  type AdminPasskeyRecord,
} from './utils/biometricAuth';
import { BrandIcon, VerifiedBadge, BuilderBadge } from './components/SocialIcons';
import { GitHubActivity } from './components/GitHubActivity';
import { LinkBentoSection } from './components/LinkBentoSection';
import { PassView } from './components/PassView';
import { AdminPage } from './components/AdminPage';
import { AdminAuthGate } from './components/AdminAuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PortraitLoadingScreen } from './components/PortraitLoadingScreen';
import {
  DEFAULT_LOADING_SCREEN_DURATION_MS,
  shouldSkipLoadingScreen,
} from './utils/loadingScreenLogic';
import {
  WorkWithMeView,
  PostsView,
  GetUpdatesModal,
  ShareModal,
  type StoredMessage,
} from './components/SubViewsAndModals';
import {
  buildGoogleMapsExternalUrl,
  hasAnyMapLocationData,
} from './utils/mapLocation';

type ActiveRoute = 'hub' | 'work' | 'posts' | 'pass' | 'admin';

function getRouteFromLocation(): ActiveRoute {
  if (typeof window === 'undefined') return 'hub';
  const hash = window.location.hash.toLowerCase();
  if (hash === '#admin' || window.location.pathname.toLowerCase() === '/admin') {
    return 'admin';
  }
  if (hash === '#pass') return 'pass';
  if (hash === '#work') return 'work';
  if (hash === '#posts') return 'posts';
  return 'hub';
}

function AppContent() {
  const [activeRoute, setActiveRoute] = useState<ActiveRoute>(() =>
    getRouteFromLocation()
  );
  const [siteConfig, setSiteConfig] = useState<SiteConfigState>(() =>
    loadSavedSiteConfig()
  );
  const [showLoadingScreen, setShowLoadingScreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !shouldSkipLoadingScreen(window.location.search);
  });

  // Cloud Firestore & Auth states (Solo Owner + UID Lock)
  const [knownCloudLinkIds, setKnownCloudLinkIds] = useState<string[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [guardEvaluation, setGuardEvaluation] = useState<AdminGuardEvaluation>(() =>
    evaluateAdminAccessGuard({ user: null })
  );

  // Admin-only streams (populated ONLY when solo owner passes Google Auth + UID lock)
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [subscribers, setSubscribers] = useState<AdminSubscriberRecord[]>([]);
  const [analyticsEvents, setAnalyticsEvents] = useState<FirestoreAnalyticsRecord[]>([]);
  const [passkeys, setPasskeys] = useState<AdminPasskeyRecord[]>([]);
  const [biometricLockEnabled, setBiometricLockEnabled] = useState<boolean>(() =>
    isBiometricLockPreferred()
  );
  const [biometricUnlocked, setBiometricUnlocked] = useState(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  // Listen globally for Case A Demo Key quota / auth limits
  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
    };
  }, []);

  // Sync direct URL hash (#admin, #pass, #work, #posts) with route state
  useEffect(() => {
    const onHashOrPop = () => {
      setActiveRoute(getRouteFromLocation());
    };
    window.addEventListener('hashchange', onHashOrPop);
    window.addEventListener('popstate', onHashOrPop);
    return () => {
      window.removeEventListener('hashchange', onHashOrPop);
      window.removeEventListener('popstate', onHashOrPop);
    };
  }, []);

  // Sync browser URL path to /RajdeepBhattacharyya-LinkHub on public routes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeRoute === 'admin') return;
    const currentPath = window.location.pathname;
    if (currentPath === '/' || currentPath === '/index.html') {
      const nextUrl = `${DEFAULT_PUBLIC_URL_PATH}${window.location.search}${window.location.hash}`;
      window.history.replaceState(null, '', nextUrl);
    }
  }, [activeRoute]);

  // Sync live document title, meta tags, canonical URL, OpenGraph, Twitter, and JSON-LD structured data
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const origin = window.location.origin;
    const meta = buildLandingSeoMetadata(siteConfig, origin, activeRoute);
    const jsonLd = buildStructuredDataJsonLd(siteConfig, origin);

    document.title = meta.title;

    const upsertMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!content) {
        if (el) el.remove();
        return;
      }
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    upsertMeta('name', 'description', meta.description);
    upsertMeta('name', 'keywords', meta.keywords.join(', '));
    upsertMeta('name', 'author', meta.authorName);
    upsertMeta('name', 'robots', meta.robots);
    upsertMeta('property', 'og:type', meta.ogType);
    upsertMeta('property', 'og:site_name', meta.siteName);
    upsertMeta('property', 'og:title', meta.title);
    upsertMeta('property', 'og:description', meta.description);
    upsertMeta('property', 'og:url', meta.canonicalUrl);
    upsertMeta('property', 'og:image', meta.ogImage);
    upsertMeta('property', 'og:image:secure_url', meta.ogImage);
    upsertMeta('property', 'og:image:type', 'image/jpeg');
    upsertMeta('property', 'og:image:alt', `${meta.siteName} — Brand Logo`);
    upsertMeta('name', 'twitter:card', meta.twitterCard);
    upsertMeta('name', 'twitter:title', meta.title);
    upsertMeta('name', 'twitter:description', meta.description);
    upsertMeta('name', 'twitter:image', meta.ogImage);
    upsertMeta('name', 'twitter:image:alt', `${meta.siteName} — Brand Logo`);

    const upsertLink = (selector: string, attrs: Record<string, string>) => {
      let linkEl = document.head.querySelector(selector) as HTMLLinkElement | null;
      if (!linkEl) {
        linkEl = document.createElement('link');
        document.head.appendChild(linkEl);
      }
      for (const [k, v] of Object.entries(attrs)) {
        linkEl.setAttribute(k, v);
      }
    };

    upsertLink('link[rel="icon"][type="image/svg+xml"]', {
      rel: 'icon',
      type: 'image/svg+xml',
      href: DEFAULT_FAVICON_SVG_PATH,
    });
    upsertLink('link[rel="apple-touch-icon"]', {
      rel: 'apple-touch-icon',
      href: DEFAULT_OG_LOGO_PATH,
    });
    upsertLink('link[rel="canonical"]', {
      rel: 'canonical',
      href: meta.canonicalUrl,
    });

    let ldScript = document.head.querySelector('#lh-jsonld-schema') as HTMLScriptElement | null;
    if (!ldScript) {
      ldScript = document.createElement('script');
      ldScript.id = 'lh-jsonld-schema';
      ldScript.type = 'application/ld+json';
      document.head.appendChild(ldScript);
    }
    ldScript.textContent = JSON.stringify(jsonLd);
  }, [siteConfig, activeRoute]);

  // Track real session-deduped profile view telemetry
  useEffect(() => {
    if (activeRoute !== 'hub' && activeRoute !== 'pass') return;
    if (typeof window === 'undefined') return;
    const sessionKey =
      activeRoute === 'pass' ? 'lh_session_viewed_pass' : 'lh_session_viewed_hub';
    try {
      if (window.sessionStorage.getItem(sessionKey)) return;
      window.sessionStorage.setItem(sessionKey, '1');
    } catch {
      // Ignore storage restriction and still track view
    }
    trackPublicProfileView({ source: activeRoute }).catch(() => {});
  }, [activeRoute]);

  // Initialize Firebase connection probe, Analytics, and Public Hub real-time listener
  useEffect(() => {
    testConnection().catch(() => {});
    initFirebaseAnalytics().catch(() => {});

    const unsubPublic = subscribePublicHubAndLinks({
      onConfigUpdate: (cloudConfig, meta) => {
        setKnownCloudLinkIds(meta.cloudLinkIds);
        if (meta.cloudSeeded) {
          setSiteConfig(cloudConfig);
          saveSiteConfigToStorage(cloudConfig);
        } else if (meta.legacyDemoDetected) {
          setSiteConfig((prev) =>
            isUntouchedLegacyDemoHub(prev) ? DEFAULT_SITE_CONFIG : prev
          );
        }
      },
    });

    return () => {
      unsubPublic();
    };
  }, []);

  // Strict Solo Owner Google Auth + UID Lock listener
  useEffect(() => {
    let unsubAdminData: (() => void) | null = null;
    let unsubPasskeys: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubAdminData) {
        unsubAdminData();
        unsubAdminData = null;
      }
      if (unsubPasskeys) {
        unsubPasskeys();
        unsubPasskeys = null;
      }

      setCurrentUser(firebaseUser);

      if (!firebaseUser) {
        setGuardEvaluation(evaluateAdminAccessGuard({ user: null }));
        setMessages([]);
        setSubscribers([]);
        setAnalyticsEvents([]);
        setPasskeys([]);
        setBiometricUnlocked(false);
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);
      try {
        const { evaluation } = await verifyAndLockSoloOwner(firebaseUser);
        setGuardEvaluation(evaluation);

        if (evaluation.authorized) {
          unsubAdminData = subscribeAdminInboxAndTelemetry({
            onMessages: setMessages,
            onSubscribers: setSubscribers,
            onAnalyticsEvents: setAnalyticsEvents,
          });
          unsubPasskeys = subscribeAdminPasskeys(firebaseUser.uid, setPasskeys);
        } else {
          setMessages([]);
          setSubscribers([]);
          setAnalyticsEvents([]);
          setPasskeys([]);
          setBiometricUnlocked(false);
        }
      } catch (err) {
        setGuardEvaluation({
          authorized: false,
          status: 'uid_lock_mismatch',
          reason:
            err instanceof Error
              ? err.message
              : 'Unable to verify solo owner lock against Firestore.',
        });
      } finally {
        setAuthLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubAdminData) unsubAdminData();
      if (unsubPasskeys) unsubPasskeys();
    };
  }, []);

  // Persist preview draft locally for instant reload smoothness
  useEffect(() => {
    saveSiteConfigToStorage(siteConfig);
  }, [siteConfig]);

  const navigateBackToHub = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState(
        null,
        '',
        `${DEFAULT_PUBLIC_URL_PATH}${window.location.search}`
      );
    }
    setActiveRoute('hub');
  };

  // Modals state
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Email copy state
  const [emailCopied, setEmailCopied] = useState(false);

  // Contact form state on main Hub (with Honeypot & Rate-Limiting Guard)
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactHoneypot, setContactHoneypot] = useState('');
  const [contactErrors, setContactErrors] = useState<ValidationResult['errors']>({});
  const [contactGuardError, setContactGuardError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState(false);
  const formMountedAtRef = useRef<number>(0);
  const recentSubmitTimestampsRef = useRef<number[]>([]);

  useEffect(() => {
    formMountedAtRef.current = Date.now();
  }, []);

  const { profile, socials, links, featuredSong, posts, designSystem } = siteConfig;
  const hubConfigured = isHubConfigured(siteConfig);
  const hasBioContent = Boolean(
    profile.bioPrefix.trim() ||
      profile.bioCode.trim() ||
      profile.bioMiddle.trim() ||
      profile.bioLinkText.trim() ||
      profile.bioSuffix.trim()
  );
  const footerGoogleMapsUrl = buildGoogleMapsExternalUrl(profile);
  const hasAnyRelevantFooterLink = Boolean(
    profile.githubUsername.trim() ||
      hasAnyMapLocationData(profile) ||
      profile.email.trim() ||
      links.length > 0
  );

  const handleCopyEmail = () => {
    navigator.clipboard?.writeText(profile.email).catch(() => {});
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const handleRecordLinkClick = (id: string) => {
    const targetLink = links.find((l) => l.id === id);
    setSiteConfig((prev) => ({
      ...prev,
      links: prev.links.map((item) =>
        item.id === id ? { ...item, clicks: item.clicks + 1 } : item
      ),
    }));
    if (targetLink) {
      trackPublicLinkClick({
        link: targetLink,
        cloudLinkExists: knownCloudLinkIds.includes(targetLink.id),
        source: 'bento',
      }).catch(() => {});
    }
  };

  const handleAddMessage = (msg: Omit<StoredMessage, 'id' | 'timestamp'>) => {
    submitVisitorMessageToFirestore(msg).catch(() => {});
  };

  const handleDeleteMessage = (id: string) => {
    deleteAdminMessageFromFirestore(id).catch(() => {});
  };

  const handleToggleMessageRead = (id: string, nextRead: boolean) => {
    toggleAdminMessageRead(id, nextRead).catch(() => {});
  };

  const handleHubContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactGuardError(null);

    const guard = evaluateSubmissionSecurityGuard({
      honeypotValue: contactHoneypot,
      mountedAtMs: formMountedAtRef.current,
      nowMs: Date.now(),
      recentSubmissionTimestampsMs: recentSubmitTimestampsRef.current,
      maxPerMinute: 5,
      minDwellMs: 100,
    });

    if (!guard.allowed) {
      setContactGuardError(guard.reason || 'Submission blocked by rate limit.');
      return;
    }

    const check = validateContactSubmission({
      name: contactName,
      email: contactEmail,
      message: contactMessage,
    });

    if (!check.valid) {
      setContactErrors(check.errors);
      return;
    }

    recentSubmitTimestampsRef.current.push(Date.now());
    setContactErrors({});
    handleAddMessage({
      name: contactName.trim(),
      email: contactEmail.trim(),
      message: contactMessage.trim(),
      source: 'hub',
    });
    setContactSuccess(true);
    setContactName('');
    setContactEmail('');
    setContactMessage('');
  };

  const handleSubscribe = (name: string, email: string) => {
    submitSubscriberToFirestore(name, email).catch(() => {});
  };

  const rootThemeStyle = {
    '--lh-canvas-bg': designSystem.canvasBg,
    '--lh-card-bg': designSystem.cardBg,
    '--lh-inner-card-bg': designSystem.innerCardBg,
    '--lh-primary-text': designSystem.primaryText,
    '--lh-secondary-surface': designSystem.secondarySurface,
    '--lh-accent-primary': designSystem.accentPrimary,
    '--lh-accent-secondary': designSystem.accentSecondary,
    '--lh-border-color': designSystem.borderColor,
    backgroundColor: designSystem.canvasBg,
    color: designSystem.primaryText,
  } as React.CSSProperties;

  return (
    <div
      className={`min-h-screen relative selection:bg-[#A88462] selection:text-[#FAF6F0] ${
        designSystem.textureEnabled ? 'bg-espresso-canvas' : ''
      }`}
      style={rootThemeStyle}
    >
      {showLoadingScreen && (
        <PortraitLoadingScreen
          profile={profile}
          designSystem={designSystem}
          durationMs={DEFAULT_LOADING_SCREEN_DURATION_MS}
          onComplete={() => setShowLoadingScreen(false)}
        />
      )}
      {gmpQuotaExceeded && (
        <div
          role="status"
          className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm"
        >
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      {/* DESKTOP TOP-RIGHT ACTION BAR ANCHORED TO TOP (hidden on mobile in favor of bottom thumb dock & on Admin/Pass views) */}
      {activeRoute !== 'pass' && activeRoute !== 'admin' && (
        <>
          <nav
            aria-label="Page actions"
            className="hidden sm:flex absolute top-4 right-4 z-30 flex-wrap items-center justify-end gap-2"
          >
            <button
              type="button"
              onClick={() => setActiveRoute(activeRoute === 'work' ? 'hub' : 'work')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-md transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                activeRoute === 'work'
                  ? 'bg-[#3A2418] text-[#FAF6F0]'
                  : 'bg-[#FAF6F0] text-[#1A120E] hover:bg-[#D5C4AE]'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Work with me</span>
            </button>

            <button
              type="button"
              onClick={() => setShowUpdatesModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#FAF6F0] text-[#1A120E] hover:bg-[#D5C4AE] text-xs font-semibold shadow-md transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Get updates</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveRoute(activeRoute === 'posts' ? 'hub' : 'posts')}
              aria-label="Read posts"
              title="Read posts"
              className={`w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-all shrink-0 cursor-pointer ${
                activeRoute === 'posts'
                  ? 'bg-[#3A2418] text-[#FAF6F0]'
                  : 'bg-[#FAF6F0] text-[#1A120E] hover:bg-[#D5C4AE]'
              }`}
            >
              <FileText className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setActiveRoute('pass')}
              aria-label="View as a pass"
              title="View as a pass"
              className="w-9 h-9 rounded-full bg-[#FAF6F0] text-[#1A120E] hover:bg-[#D5C4AE] flex items-center justify-center shadow-md transition-all shrink-0 cursor-pointer"
            >
              <CreditCard className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              aria-label="Share profile"
              title="Share profile"
              className="w-9 h-9 rounded-full bg-[#FAF6F0] text-[#1A120E] hover:bg-[#D5C4AE] flex items-center justify-center shadow-md transition-all shrink-0 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </nav>

          {/* COMPACT NON-STICKY MOBILE TOP UTILITY BAR */}
          <div className="sm:hidden relative z-20 w-full max-w-[540px] mx-auto px-3.5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setActiveRoute('hub')}
              className="inline-flex items-center gap-2 px-3 py-1.5 min-h-[40px] rounded-full border shadow-sm text-xs font-bold cursor-pointer"
              style={{
                backgroundColor: designSystem.cardBg,
                borderColor: designSystem.borderColor,
                color: designSystem.primaryText,
              }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: designSystem.accentPrimary }}
              />
              <span className="font-ibm-mono">
                {profile.handle.trim() || profile.name.trim() || 'Link Hub'}
              </span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowUpdatesModal(true)}
                aria-label="Get updates"
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border shadow-sm text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: designSystem.innerCardBg,
                  borderColor: designSystem.borderColor,
                  color: designSystem.primaryText,
                }}
              >
                <Bell className="w-3.5 h-3.5" style={{ color: designSystem.accentPrimary }} />
                <span>Updates</span>
              </button>
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                aria-label="Share profile"
                title="Share profile"
                className="w-11 h-11 rounded-full border shadow-sm flex items-center justify-center cursor-pointer"
                style={{
                  backgroundColor: designSystem.innerCardBg,
                  borderColor: designSystem.borderColor,
                  color: designSystem.primaryText,
                }}
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ERGONOMIC MOBILE BOTTOM THUMB DOCK (<10% viewport height, 44px+ hitboxes) */}
          <nav
            aria-label="Mobile quick navigation"
            className="sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md shadow-[0_-10px_28px_-8px_rgba(26,18,14,0.38)]"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--lh-card-bg, #F4EDE2) 94%, transparent)',
              borderColor: designSystem.borderColor,
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            <div className="grid grid-cols-5 items-center h-16 max-w-[540px] mx-auto px-1">
              {[
                {
                  id: 'hub' as const,
                  label: 'Hub',
                  icon: <Home className="w-[18px] h-[18px]" />,
                  active: activeRoute === 'hub',
                  onClick: () => setActiveRoute('hub'),
                },
                {
                  id: 'work' as const,
                  label: 'Work',
                  icon: <Briefcase className="w-[18px] h-[18px]" />,
                  active: activeRoute === 'work',
                  onClick: () => setActiveRoute(activeRoute === 'work' ? 'hub' : 'work'),
                },
                {
                  id: 'posts' as const,
                  label: 'Posts',
                  icon: <FileText className="w-[18px] h-[18px]" />,
                  active: activeRoute === 'posts',
                  onClick: () => setActiveRoute(activeRoute === 'posts' ? 'hub' : 'posts'),
                },
                {
                  id: 'pass' as const,
                  label: 'Pass',
                  icon: <CreditCard className="w-[18px] h-[18px]" />,
                  active: false,
                  onClick: () => setActiveRoute('pass'),
                },
                {
                  id: 'updates' as const,
                  label: 'Updates',
                  icon: <Bell className="w-[18px] h-[18px]" />,
                  active: showUpdatesModal,
                  onClick: () => setShowUpdatesModal(true),
                },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  aria-current={item.active ? 'page' : undefined}
                  className="min-h-[46px] mx-0.5 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all active:scale-95 cursor-pointer"
                  style={
                    item.active
                      ? {
                          backgroundColor: designSystem.secondarySurface,
                          color: '#FAF6F0',
                        }
                      : {
                          color: designSystem.primaryText,
                        }
                  }
                >
                  {item.icon}
                  <span className="text-[10px] font-bold tracking-tight leading-none">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </nav>
        </>
      )}

      {/* ROUTE SWITCHING */}
      {activeRoute === 'admin' && (
        <AdminAuthGate
          authLoading={authLoading}
          currentUser={currentUser}
          guardEvaluation={guardEvaluation}
          ownerEmail={OWNER_ADMIN_EMAIL}
          passkeys={passkeys}
          biometricLockRequired={
            guardEvaluation.authorized &&
            biometricLockEnabled &&
            !biometricUnlocked &&
            (passkeys.length > 0 ||
              loadPairedDevicePasskeys(OWNER_ADMIN_EMAIL).length > 0)
          }
          onBiometricUnlockSuccess={async ({ credentialId, nextSignCount, deviceLabel }) => {
            setBiometricUnlocked(true);
            touchAdminPasskeyUsage({
              credentialId,
              nextSignCount,
              deviceLabel,
            }).catch(() => {});
          }}
          onSignInWithGoogle={async () => {
            await signInOwnerWithGoogle();
            setBiometricUnlocked(true);
          }}
          onSignOut={async () => {
            setBiometricUnlocked(false);
            await signOutOwner();
          }}
          onBackToHub={navigateBackToHub}
        >
          <AdminPage
            config={siteConfig}
            ownerUid={currentUser?.uid || ''}
            ownerEmail={currentUser?.email || OWNER_ADMIN_EMAIL}
            knownCloudLinkIds={knownCloudLinkIds}
            analyticsEvents={analyticsEvents}
            messages={messages}
            subscribers={subscribers}
            passkeys={passkeys}
            biometricLockEnabled={biometricLockEnabled}
            gmpQuotaExceeded={gmpQuotaExceeded}
            onToggleBiometricLock={(enabled) => {
              setBiometricLockPreferred(enabled);
              setBiometricLockEnabled(enabled);
            }}
            onLockStudio={() => setBiometricUnlocked(false)}
            onUpdateConfig={setSiteConfig}
            onUpdateKnownCloudLinkIds={setKnownCloudLinkIds}
            onDeleteMessage={handleDeleteMessage}
            onToggleMessageRead={handleToggleMessageRead}
            onSignOut={async () => {
              setBiometricUnlocked(false);
              await signOutOwner();
            }}
            onBackToHub={navigateBackToHub}
          />
        </AdminAuthGate>
      )}

      {activeRoute === 'work' && (
        <WorkWithMeView
          profile={profile}
          avatarUrl={profile.avatarUrl}
          onBack={() => setActiveRoute('hub')}
          onSubmitMessage={handleAddMessage}
        />
      )}

      {activeRoute === 'posts' && (
        <PostsView
          profile={profile}
          posts={posts}
          avatarUrl={profile.avatarUrl}
          onBack={() => setActiveRoute('hub')}
        />
      )}

      {activeRoute === 'pass' && (
        <PassView
          profile={profile}
          socials={socials}
          links={links}
          designSystem={designSystem}
          avatarUrl={profile.avatarUrl}
          onBackToProfile={() => setActiveRoute('hub')}
          onOpenShare={() => setShowShareModal(true)}
        />
      )}

      {activeRoute === 'hub' && (
        <div className="relative z-10 pt-2 sm:pt-16 pb-28 sm:pb-14 px-3 sm:px-4 flex flex-col items-center">
          {/* CENTRAL PERSONAL LINK HUB CARD */}
          <main
            className="w-full max-w-[540px] rounded-[24px] sm:rounded-[28px] bg-card-paper border shadow-[0_24px_60px_-15px_rgba(26,18,14,0.48)] p-4 sm:p-6 space-y-5 sm:space-y-6"
            style={{
              backgroundColor: designSystem.cardBg,
              borderColor: designSystem.borderColor,
              color: designSystem.primaryText,
            }}
          >
            {/* 1. HERO BANNER + OVERLAPPING AVATAR + BIO */}
            <header className="space-y-4">
              <div className="relative">
                {/* Cover Banner: Custom Uploaded Image OR Stitched Leather SVG Emblem */}
                <div
                  className="h-32 sm:h-36 w-full rounded-2xl border overflow-hidden relative shadow-xs"
                  style={{
                    backgroundColor: designSystem.secondarySurface,
                    borderColor: designSystem.borderColor,
                  }}
                >
                  {profile.bannerMode === 'image' && profile.bannerImageUrl ? (
                    <>
                      <img
                        src={profile.bannerImageUrl}
                        alt={profile.name.trim() ? `${profile.name} cover banner` : 'Cover banner'}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1A120E]/45 via-transparent to-transparent pointer-events-none" />
                    </>
                  ) : (
                    <svg
                      viewBox="0 0 600 160"
                      className="w-full h-full object-cover"
                      role="img"
                      aria-label="Cover banner"
                    >
                      <defs>
                        <linearGradient id="leatherGrad" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={designSystem.primaryText} />
                          <stop offset="55%" stopColor={designSystem.secondarySurface} />
                          <stop offset="100%" stopColor={designSystem.canvasBg} />
                        </linearGradient>
                        <radialGradient id="copperGlow" cx="0.72" cy="0.3" r="0.55">
                          <stop offset="0%" stopColor={designSystem.accentSecondary} stopOpacity="0.45" />
                          <stop offset="100%" stopColor={designSystem.primaryText} stopOpacity="0" />
                        </radialGradient>
                      </defs>
                      <rect width="600" height="160" fill="url(#leatherGrad)" />
                      <rect width="600" height="160" fill="url(#copperGlow)" />
                      <path
                        d="M140 160 C230 85, 360 35, 520 0"
                        stroke={designSystem.accentSecondary}
                        strokeWidth="1.5"
                        fill="none"
                        opacity="0.65"
                      />
                      <path
                        d="M152 160 C242 90, 372 40, 532 0"
                        stroke="#D5C4AE"
                        strokeWidth="0.8"
                        strokeDasharray="4 4"
                        fill="none"
                        opacity="0.5"
                      />
                      {profile.bannerText.trim() && (
                        <g transform="translate(275, 118) rotate(-32)">
                          <text
                            x="0"
                            y="0"
                            fill="#FAF6F0"
                            opacity="0.75"
                            fontFamily="Plus Jakarta Sans, sans-serif"
                            fontSize="11"
                            fontWeight="700"
                            letterSpacing="0.28em"
                          >
                            {profile.bannerText}
                          </text>
                        </g>
                      )}
                    </svg>
                  )}
                </div>

                {/* Overlapping Circular Avatar */}
                <div
                  className="-mt-10 ml-3 relative z-10 w-20 h-20 rounded-full p-1 border shadow-sm"
                  style={{
                    backgroundColor: designSystem.cardBg,
                    borderColor: designSystem.borderColor,
                  }}
                >
                  <img
                    src={profile.avatarUrl}
                    alt={profile.name.trim() || 'Profile avatar'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
              </div>

              {!hubConfigured ? (
                <div
                  className="p-4 rounded-2xl border space-y-2.5"
                  style={{
                    backgroundColor: designSystem.innerCardBg,
                    borderColor: designSystem.borderColor,
                  }}
                >
                  <div className="space-y-1">
                    <h1
                      className="text-base sm:text-lg font-bold tracking-tight"
                      style={{ color: designSystem.primaryText }}
                    >
                      Ready to publish your Link Hub
                    </h1>
                    <p
                      className="text-xs font-medium leading-relaxed"
                      style={{ color: designSystem.secondarySurface }}
                    >
                      Open Studio to set up your profile identity, featured links, digital pass, GitHub activity, and Pantone color system.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.location.hash = '#admin';
                      }
                      setActiveRoute('admin');
                    }}
                    style={{ backgroundColor: designSystem.primaryText }}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-semibold text-[#FAF6F0] hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <span>Open Studio</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Identity, Verified Badges & Copyable Email */}
                  {(profile.name.trim() || profile.role.trim() || profile.email.trim()) && (
                    <div className="space-y-1 px-1">
                      {profile.name.trim() && (
                        <h1
                          className="flex items-center gap-1.5 text-lg font-bold tracking-tight"
                          style={{ color: designSystem.primaryText }}
                        >
                          <span>{profile.name}</span>
                          <VerifiedBadge className="w-4 h-4" />
                          <BuilderBadge className="w-4 h-4" />
                        </h1>
                      )}

                      {(profile.role.trim() || profile.email.trim()) && (
                        <div
                          className="flex items-center gap-2 text-xs font-semibold"
                          style={{ color: designSystem.secondarySurface }}
                        >
                          {profile.role.trim() && <span>{profile.role}</span>}
                          {profile.role.trim() && profile.email.trim() && (
                            <span
                              aria-hidden="true"
                              className="font-bold"
                              style={{ color: designSystem.accentPrimary }}
                            >
                              ·
                            </span>
                          )}
                          {profile.email.trim() && (
                            <button
                              type="button"
                              onClick={handleCopyEmail}
                              aria-label={`Copy ${profile.email}`}
                              title={`Copy ${profile.email}`}
                              className="inline-flex items-center gap-1 min-h-[40px] sm:min-h-0 px-2 -my-1.5 rounded-lg text-[#3A2418] hover:text-[#1A120E] transition-colors cursor-pointer"
                            >
                              {emailCopied ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-[#1A120E]" />
                                  <span className="text-[11px] font-mono font-semibold text-[#1A120E]">
                                    Copied email
                                  </span>
                                </>
                              ) : (
                                <Mail className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bio paragraph with inline code & link */}
                  {hasBioContent && (
                    <p
                      className="text-xs sm:text-[13px] font-medium leading-relaxed px-1"
                      style={{ color: designSystem.primaryText }}
                    >
                      {profile.bioPrefix}
                      {profile.bioCode.trim() && (
                        <code
                          className="px-1.5 py-0.5 rounded-md border text-[11px] font-mono font-bold"
                          style={{
                            backgroundColor: designSystem.innerCardBg,
                            borderColor: designSystem.borderColor,
                            color: designSystem.secondarySurface,
                          }}
                        >
                          {profile.bioCode}
                        </code>
                      )}
                      {profile.bioMiddle}
                      {profile.bioLinkText.trim() &&
                        (profile.bioLinkUrl.trim() ? (
                          <a
                            href={profile.bioLinkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold underline decoration-2 underline-offset-2 transition-colors hover:opacity-80"
                            style={{
                              color: designSystem.primaryText,
                              textDecorationColor: designSystem.accentPrimary,
                            }}
                          >
                            <strong>{profile.bioLinkText}</strong>
                          </a>
                        ) : (
                          <strong className="font-bold">{profile.bioLinkText}</strong>
                        ))}
                      {profile.bioSuffix}
                    </p>
                  )}
                </>
              )}
            </header>

            {/* 2. SOCIAL LINKS ROW */}
            {socials.length > 0 && (
              <div className="flex flex-wrap items-center gap-2.5 px-1">
                {socials.map((social) => (
                  <a
                    key={social.id}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    title={`${social.label} (${social.handle})`}
                    style={{
                      backgroundColor: designSystem.secondarySurface,
                      borderColor: designSystem.accentPrimary,
                    }}
                    className="w-11 h-11 sm:w-9 sm:h-9 rounded-full border hover:opacity-90 active:scale-95 text-[#FAF6F0] flex items-center justify-center shadow-xs transition-all duration-150 hover:-translate-y-0.5"
                  >
                    <BrandIcon platform={social.platform} className="w-[18px] h-[18px] sm:w-4 sm:h-4" />
                  </a>
                ))}
              </div>
            )}

            {/* Hairline Dashed Divider */}
            {(hubConfigured || siteConfig.showGithubSection) && (
              <div className="border-t border-dashed" style={{ borderColor: designSystem.borderColor }} />
            )}

            {/* 3. REAL INTERACTIVE GITHUB CONTRIBUTION HEATMAP */}
            {siteConfig.showGithubSection && (
              <GitHubActivity
                username={profile.githubUsername}
                repo={profile.githubRepo}
                profileUrl={profile.githubProfileUrl}
                title={profile.githubSectionTitle}
                subtitle={profile.githubSectionSubtitle}
                themeColors={[
                  '#EFE6DA',
                  designSystem.borderColor,
                  designSystem.accentSecondary,
                  designSystem.accentPrimary,
                  designSystem.secondarySurface,
                ]}
              />
            )}

            {/* 4. MY LINKS BENTO + SONG CARD + LOCATION MAP */}
            {(hubConfigured || links.length > 0 || siteConfig.showSongCard || siteConfig.showMapCard) && (
              <LinkBentoSection
                links={links}
                customCategories={siteConfig.customCategories}
                featuredSong={featuredSong}
                location={profile.location}
                mapLabel={profile.mapLabel}
                coordinates={profile.coordinates}
                googleMapsUrl={profile.googleMapsUrl}
                mapLat={profile.mapLat}
                mapLng={profile.mapLng}
                mapZoom={profile.mapZoom}
                gmpQuotaExceeded={gmpQuotaExceeded}
                showSongCard={siteConfig.showSongCard}
                showMapCard={siteConfig.showMapCard}
                onRecordClick={handleRecordLinkClick}
              />
            )}

            {/* 5. CONTACT ME EMBEDDED FORM */}
            {siteConfig.showContactSection && (
              <>
                <div
                  className="border-t border-dashed"
                  style={{ borderColor: designSystem.borderColor }}
                />

                <section aria-labelledby="contact-heading" className="space-y-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2
                      id="contact-heading"
                      className="text-[15px] sm:text-sm font-bold"
                      style={{ color: designSystem.primaryText }}
                    >
                      Contact me
                    </h2>
                    <p
                      className="text-xs font-medium"
                      style={{ color: designSystem.secondarySurface }}
                    >
                      Send me a message
                    </p>
                  </div>

                  {contactSuccess && (
                    <div
                      role="status"
                      className="p-2.5 rounded-xl bg-[#FAF6F0] border border-[#6B4A2E] text-xs font-semibold text-[#1A120E] flex items-center justify-between"
                    >
                      <span>Thanks for reaching out! Your message has been sent.</span>
                    </div>
                  )}

                  {contactGuardError && (
                    <div
                      role="alert"
                      className="p-2.5 rounded-xl bg-[#FAF6F0] border border-[#3A2418] text-xs font-semibold text-[#3A2418]"
                    >
                      {contactGuardError}
                    </div>
                  )}

                  <form onSubmit={handleHubContactSubmit} noValidate className="space-y-2.5">
                    {/* Hidden anti-spam honeypot field */}
                    <div className="sr-only" aria-hidden="true">
                      <label htmlFor="hub-website-hp">Website</label>
                      <input
                        id="hub-website-hp"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={contactHoneypot}
                        onChange={(e) => setContactHoneypot(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label
                          htmlFor="hub-name"
                          className="block text-[13px] sm:text-xs font-bold"
                          style={{ color: designSystem.primaryText }}
                        >
                          Your name <span style={{ color: designSystem.accentPrimary }}>*</span>
                        </label>
                        <input
                          id="hub-name"
                          type="text"
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          placeholder="Your full name"
                          style={{
                            backgroundColor: designSystem.innerCardBg,
                            borderColor: designSystem.borderColor,
                            color: designSystem.primaryText,
                          }}
                          className="w-full h-10 sm:h-9 px-3 py-1.5 rounded-xl border focus:outline-none text-[12.5px] sm:text-xs font-medium placeholder-[#5C3D24] transition-all"
                        />
                        {contactErrors.name && (
                          <p
                            className="text-[11px] font-semibold"
                            style={{ color: designSystem.secondarySurface }}
                          >
                            {contactErrors.name}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor="hub-email"
                          className="block text-[13px] sm:text-xs font-bold"
                          style={{ color: designSystem.primaryText }}
                        >
                          Your email <span style={{ color: designSystem.accentPrimary }}>*</span>
                        </label>
                        <input
                          id="hub-email"
                          type="email"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          placeholder="name@example.com"
                          style={{
                            backgroundColor: designSystem.innerCardBg,
                            borderColor: designSystem.borderColor,
                            color: designSystem.primaryText,
                          }}
                          className="w-full h-10 sm:h-9 px-3 py-1.5 rounded-xl border focus:outline-none text-[12.5px] sm:text-xs font-medium placeholder-[#5C3D24] transition-all"
                        />
                        {contactErrors.email && (
                          <p
                            className="text-[11px] font-semibold"
                            style={{ color: designSystem.secondarySurface }}
                          >
                            {contactErrors.email}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="hub-message"
                        className="block text-[13px] sm:text-xs font-bold"
                        style={{ color: designSystem.primaryText }}
                      >
                        Message <span style={{ color: designSystem.accentPrimary }}>*</span>
                      </label>
                      <textarea
                        id="hub-message"
                        rows={2}
                        value={contactMessage}
                        onChange={(e) => setContactMessage(e.target.value)}
                        placeholder="What's on your mind?"
                        style={{
                          backgroundColor: designSystem.innerCardBg,
                          borderColor: designSystem.borderColor,
                          color: designSystem.primaryText,
                        }}
                        className="w-full px-3 py-2 rounded-xl border focus:outline-none text-[12.5px] sm:text-xs font-medium placeholder-[#5C3D24] transition-all resize-none"
                      />
                      {contactErrors.message && (
                        <p
                          className="text-[11px] font-semibold"
                          style={{ color: designSystem.secondarySurface }}
                        >
                          {contactErrors.message}
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      style={{ backgroundColor: designSystem.primaryText }}
                      className="w-full sm:w-auto h-10 sm:h-9 inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl hover:opacity-90 text-[#FAF6F0] text-xs font-semibold shadow-xs transition-all cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </form>
                </section>
              </>
            )}

            {/* 6. COMPACT FOOTER SECTION (Distinct Exterior Shade + Relevant Links & Google Maps) */}
            <footer
              aria-label="Footer navigation and links"
              className="rounded-2xl border p-3.5 sm:p-4 space-y-3 shadow-xs text-[#FAF6F0]"
              style={{
                backgroundColor: designSystem.secondarySurface,
                borderColor: designSystem.accentPrimary,
              }}
            >
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#D5C4AE]">
                    Quick Options
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveRoute('work')}
                      className="px-2.5 py-1 rounded-lg border border-[#FAF6F0]/25 bg-[#FAF6F0]/10 hover:bg-[#FAF6F0]/20 text-[11px] font-semibold text-[#FAF6F0] transition-colors cursor-pointer"
                    >
                      Work with me
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRoute('posts')}
                      className="px-2.5 py-1 rounded-lg border border-[#FAF6F0]/25 bg-[#FAF6F0]/10 hover:bg-[#FAF6F0]/20 text-[11px] font-semibold text-[#FAF6F0] transition-colors cursor-pointer"
                    >
                      Read posts
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRoute('pass')}
                      className="px-2.5 py-1 rounded-lg border border-[#FAF6F0]/25 bg-[#FAF6F0]/10 hover:bg-[#FAF6F0]/20 text-[11px] font-semibold text-[#FAF6F0] transition-colors cursor-pointer"
                    >
                      Digital pass
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowUpdatesModal(true)}
                      className="px-2.5 py-1 rounded-lg border border-[#FAF6F0]/25 bg-[#FAF6F0]/10 hover:bg-[#FAF6F0]/20 text-[11px] font-semibold text-[#FAF6F0] transition-colors cursor-pointer"
                    >
                      Get updates
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowShareModal(true)}
                      className="px-2.5 py-1 rounded-lg border border-[#FAF6F0]/25 bg-[#FAF6F0]/10 hover:bg-[#FAF6F0]/20 text-[11px] font-semibold text-[#FAF6F0] transition-colors cursor-pointer"
                    >
                      Share hub
                    </button>
                  </div>
                </div>

                {hasAnyRelevantFooterLink && (
                  <div className="space-y-1.5">
                    <p className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#D5C4AE]">
                      Relevant Links
                    </p>
                    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-semibold text-[#FAF6F0]">
                      {profile.githubUsername.trim() && (
                        <li className="min-w-0">
                          <a
                            href={
                              profile.githubRepo
                                ? `https://github.com/${profile.githubUsername}/${profile.githubRepo}`
                                : profile.githubProfileUrl ||
                                  `https://github.com/${profile.githubUsername}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 py-0.5 text-[#FAF6F0] hover:text-[#D5C4AE] hover:underline max-w-full"
                          >
                            <span className="truncate">
                              GitHub (@{profile.githubUsername}
                              {profile.githubRepo ? `/${profile.githubRepo}` : ''})
                            </span>
                            <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
                          </a>
                        </li>
                      )}
                      {footerGoogleMapsUrl && (
                        <li className="min-w-0">
                          <a
                            href={footerGoogleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 py-0.5 text-[#FAF6F0] hover:text-[#D5C4AE] hover:underline max-w-full"
                          >
                            <MapPin className="w-3 h-3 opacity-85 shrink-0" />
                            <span className="truncate">
                              Google Maps{profile.location.trim() ? ` (${profile.location.trim()})` : ''}
                            </span>
                            <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
                          </a>
                        </li>
                      )}
                      {profile.email.trim() && (
                        <li className="min-w-0">
                          <a
                            href={`mailto:${profile.email}`}
                            className="inline-flex items-center gap-1 py-0.5 text-[#FAF6F0] hover:text-[#D5C4AE] hover:underline max-w-full"
                          >
                            <span className="truncate">{profile.email}</span>
                            <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
                          </a>
                        </li>
                      )}
                      {links.slice(0, 2).map((topLink, idx) => (
                        <li
                          key={`footer-${topLink.id}`}
                          className={`min-w-0 ${idx === 1 ? 'col-span-2' : ''}`}
                        >
                          <a
                            href={topLink.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 py-0.5 text-[#FAF6F0]/90 hover:text-[#FAF6F0] hover:underline max-w-full"
                          >
                            <span className="truncate">{topLink.title}</span>
                            <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="pt-2.5 border-t border-[#FAF6F0]/20 flex flex-wrap items-center justify-between gap-2 text-[10px] font-ibm-mono text-[#D5C4AE]">
                <span>
                  © {new Date().getFullYear()}{' '}
                  {[profile.name.trim() || 'Link Hub', profile.location.trim()]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="font-semibold text-[#FAF6F0]">
                  {designSystem.pantoneCode || 'PANTONE 19-1118 TCX'}
                </span>
              </div>
            </footer>
          </main>

          {/* END OF WEBSITE BAR: OPTIONAL BUY ME A COFFEE LINK + SCROLL TO TOP */}
          <div
            className={`mt-5 sm:mt-6 w-full max-w-[540px] flex flex-wrap items-center gap-3 px-1 ${
              profile.buyMeACoffeeUrl?.trim() ? 'justify-between' : 'justify-end'
            }`}
          >
            {profile.buyMeACoffeeUrl?.trim() && (
              <a
                href={profile.buyMeACoffeeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-full border text-xs font-bold shadow-lg transition-all duration-150 hover:-translate-y-0.5 hover:opacity-95"
                style={{
                  backgroundColor: designSystem.innerCardBg,
                  borderColor: designSystem.borderColor,
                  color: designSystem.primaryText,
                }}
              >
                <Coffee
                  className="w-4 h-4 shrink-0"
                  style={{ color: designSystem.accentPrimary }}
                />
                <span>{profile.buyMeACoffeeLabel || 'Buy me a coffee'}</span>
                <ExternalLink className="w-3 h-3 opacity-75 shrink-0" />
              </a>
            )}

            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label="Scroll to top"
              title="Scroll to top"
              style={{
                backgroundColor: designSystem.innerCardBg,
                borderColor: designSystem.borderColor,
                color: designSystem.primaryText,
              }}
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-full border hover:opacity-90 flex items-center justify-center shadow-lg transition-all duration-150 hover:-translate-y-0.5 cursor-pointer"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MODALS */}
      {showUpdatesModal && (
        <GetUpdatesModal
          profileName={profile.name}
          onClose={() => setShowUpdatesModal(false)}
          onSubscribe={handleSubscribe}
        />
      )}

      {showShareModal && (
        <ShareModal
          handle={profile.handle}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

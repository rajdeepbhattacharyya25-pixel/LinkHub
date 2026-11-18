import { useEffect, useState } from 'react';
import type { AdminTabId } from './hubLogic';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

const VALID_ADMIN_TABS = new Set<AdminTabId>([
  'profile',
  'links',
  'socials',
  'posts',
  'github',
  'design',
  'analytics',
  'devtools',
  'messages',
  'security',
]);

export function parseAdminInitialTabFromSearch(search: string): AdminTabId | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(search);
    const raw = (params.get('tab') || '').trim().toLowerCase() as AdminTabId;
    return VALID_ADMIN_TABS.has(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function isRunningAsInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false;
  const displayStandalone =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches);
  const iosStandalone = Boolean(
    (window.navigator as { standalone?: boolean }).standalone
  );
  return displayStandalone || iosStandalone;
}

export function isIosSafariBrowser(userAgent?: string): boolean {
  const ua =
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|chrome/i.test(ua);
  return isIos && isSafari;
}

let swRegistrationStarted = false;

export async function registerAdminServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  const cleanPath = (window.location.pathname || '/').toLowerCase();
  if (!cleanPath.startsWith('/admin')) {
    return null;
  }
  if (swRegistrationStarted) {
    try {
      const existing = await navigator.serviceWorker.getRegistration('/admin');
      return existing ?? null;
    } catch {
      return null;
    }
  }
  swRegistrationStarted = true;

  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/admin' });
  } catch {
    swRegistrationStarted = false;
    return null;
  }
}

export function useAdminPwaInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() =>
    isRunningAsInstalledPwa()
  );
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    void registerAdminServiceWorker();

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'manual'> => {
    if (!deferredPrompt) return 'manual';
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
      return choice.outcome;
    } finally {
      setInstalling(false);
    }
  };

  return {
    isInstalled,
    canNativePrompt: Boolean(deferredPrompt),
    installing,
    isIosSafari: isIosSafariBrowser(),
    promptInstall,
  };
}

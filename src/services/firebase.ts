import { initializeApp } from 'firebase/app';
import type { Auth, GoogleAuthProvider, User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import type { Analytics } from 'firebase/analytics';
import firebaseConfigFile from '../../firebase-applet-config.json';

const clientEnv: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' &&
  import.meta &&
  typeof (import.meta as { env?: Record<string, string | undefined> }).env === 'object'
    ? (import.meta as { env: Record<string, string | undefined> }).env
    : {};

const resolvedFirebaseConfig = {
  projectId: clientEnv.VITE_FIREBASE_PROJECT_ID || firebaseConfigFile.projectId,
  appId: clientEnv.VITE_FIREBASE_APP_ID || firebaseConfigFile.appId,
  apiKey: clientEnv.VITE_FIREBASE_API_KEY || firebaseConfigFile.apiKey,
  authDomain: clientEnv.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigFile.authDomain,
  firestoreDatabaseId:
    clientEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID || firebaseConfigFile.firestoreDatabaseId,
  storageBucket: clientEnv.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigFile.storageBucket,
  messagingSenderId:
    clientEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigFile.messagingSenderId,
  measurementId: clientEnv.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigFile.measurementId || '',
};

export const OWNER_ADMIN_EMAIL =
  (clientEnv.VITE_OWNER_ADMIN_EMAIL || '').trim() || 'rajdeep.bhattacharyya25@gmail.com';

const app = initializeApp(resolvedFirebaseConfig);

// CRITICAL: Pass explicit provisioned firestoreDatabaseId so Firestore connects to the named database
export const db = getFirestore(app, resolvedFirebaseConfig.firestoreDatabaseId);

let cachedAuthBundle: {
  auth: Auth;
  googleProvider: GoogleAuthProvider;
  authModule: typeof import('firebase/auth');
} | null = null;

export async function getFirebaseAuthBundle() {
  if (cachedAuthBundle) return cachedAuthBundle;
  const authModule = await import('firebase/auth');
  const authInstance = authModule.getAuth(app);
  if (typeof window !== 'undefined') {
    authModule
      .setPersistence(authInstance, authModule.browserLocalPersistence)
      .catch(() => {});
  }
  const provider = new authModule.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  cachedAuthBundle = {
    auth: authInstance,
    googleProvider: provider,
    authModule,
  };
  return cachedAuthBundle;
}

let cachedStorageBundle: {
  storage: FirebaseStorage;
  storageModule: typeof import('firebase/storage');
} | null = null;

export async function getFirebaseStorageBundle() {
  if (cachedStorageBundle) return cachedStorageBundle;
  const storageModule = await import('firebase/storage');
  const storageInstance = storageModule.getStorage(app);
  // Fail fast instead of stalling the crop/upload modal for the 10-minute SDK default
  storageInstance.maxUploadRetryTime = 5000;
  storageInstance.maxOperationRetryTime = 5000;
  cachedStorageBundle = {
    storage: storageInstance,
    storageModule,
  };
  return cachedStorageBundle;
}

let analyticsInstance: Analytics | null = null;
let analyticsLogEventFn: ((analytics: Analytics, eventName: string, params?: Record<string, unknown>) => void) | null = null;
let analyticsInitStarted = false;

export async function initFirebaseAnalytics(): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance;
  if (analyticsInitStarted) return analyticsInstance;
  analyticsInitStarted = true;

  if (typeof window === 'undefined' || !resolvedFirebaseConfig.measurementId) {
    return null;
  }

  try {
    const analyticsMod = await import('firebase/analytics');
    const supported = await analyticsMod.isSupported();
    if (!supported) return null;
    analyticsInstance = analyticsMod.getAnalytics(app);
    analyticsLogEventFn = analyticsMod.logEvent;
    return analyticsInstance;
  } catch {
    return null;
  }
}

export async function trackGa4Event(
  eventName: string,
  params?: Record<string, string | number | boolean>
): Promise<void> {
  try {
    const analytics = await initFirebaseAnalytics();
    if (!analytics || !analyticsLogEventFn) return;
    analyticsLogEventFn(analytics, eventName, params);
  } catch {
    // Non-fatal in ad-blocked or unsupported environments
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentAuthUser = cachedAuthBundle?.auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAuthUser?.uid,
      email: currentAuthUser?.email,
      emailVerified: currentAuthUser?.emailVerified,
      isAnonymous: currentAuthUser?.isAnonymous,
      tenantId: currentAuthUser?.tenantId,
      providerInfo:
        currentAuthUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return false;
  }
}

export type AdminGuardStatus =
  | 'loading'
  | 'unauthenticated'
  | 'unauthorized_email'
  | 'unverified_email'
  | 'uid_lock_mismatch'
  | 'authorized';

export interface AdminGuardEvaluation {
  authorized: boolean;
  status: AdminGuardStatus;
  reason?: string;
}

/**
 * Pure verification helper enforcing the Strict Single-Owner Email Allowlist + UID Lock.
 */
export function evaluateAdminAccessGuard(input: {
  user: Pick<User, 'uid' | 'email' | 'emailVerified'> | null;
  lockedUid?: string | null;
  ownerEmail?: string;
}): AdminGuardEvaluation {
  const allowEmail = (input.ownerEmail || OWNER_ADMIN_EMAIL).trim().toLowerCase();
  const { user, lockedUid } = input;

  if (!user) {
    return {
      authorized: false,
      status: 'unauthenticated',
      reason: 'Google Sign-In required to unlock Admin Studio.',
    };
  }

  if (!user.emailVerified) {
    return {
      authorized: false,
      status: 'unverified_email',
      reason: 'Google email verification is required before granting admin access.',
    };
  }

  if ((user.email || '').trim().toLowerCase() !== allowEmail) {
    return {
      authorized: false,
      status: 'unauthorized_email',
      reason: `Access denied for ${user.email || 'unknown account'}. Admin Studio is strictly locked to the site owner.`,
    };
  }

  if (lockedUid && lockedUid !== user.uid) {
    return {
      authorized: false,
      status: 'uid_lock_mismatch',
      reason: 'UID lock verification failed: this session UID does not match the registered solo owner lock.',
    };
  }

  return {
    authorized: true,
    status: 'authorized',
  };
}

export const FIREBASE_RUNTIME_INFO = {
  projectId: resolvedFirebaseConfig.projectId,
  firestoreDatabaseId: resolvedFirebaseConfig.firestoreDatabaseId,
  storageBucket: resolvedFirebaseConfig.storageBucket,
  analyticsConfigured: Boolean(resolvedFirebaseConfig.measurementId),
};

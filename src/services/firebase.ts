import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import {
  getAnalytics,
  isSupported as isAnalyticsSupported,
  logEvent,
  type Analytics,
} from 'firebase/analytics';
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
export const auth = getAuth(app);
export const storage = getStorage(app);
// Fail fast instead of stalling the crop/upload modal for the 10-minute SDK default
storage.maxUploadRetryTime = 5000;
storage.maxOperationRetryTime = 5000;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let analyticsInstance: Analytics | null = null;
let analyticsInitStarted = false;

export async function initFirebaseAnalytics(): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance;
  if (analyticsInitStarted) return analyticsInstance;
  analyticsInitStarted = true;

  if (typeof window === 'undefined' || !resolvedFirebaseConfig.measurementId) {
    return null;
  }

  try {
    const supported = await isAnalyticsSupported();
    if (!supported) return null;
    analyticsInstance = getAnalytics(app);
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
    if (!analytics) return;
    logEvent(analytics, eventName, params);
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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
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

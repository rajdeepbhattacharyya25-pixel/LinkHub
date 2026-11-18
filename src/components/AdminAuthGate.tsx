import React, { useEffect, useRef, useState } from 'react';
import {
  Lock,
  ShieldAlert,
  ArrowLeft,
  LogOut,
  CheckCircle2,
  Loader2,
  Fingerprint,
  ScanFace,
  ShieldCheck,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { AdminGuardEvaluation } from '../services/firebase';
import {
  authenticateWithBiometricPasskey,
  detectBiometricPlatform,
  loadPairedDevicePasskeys,
  savePairedDevicePasskey,
  selectPreferredPasskeysForDevice,
  type AdminPasskeyRecord,
} from '../utils/biometricAuth';
import { registerAdminServiceWorker } from '../utils/adminPwa';

export interface AdminAuthGateProps {
  authLoading: boolean;
  currentUser: User | null;
  guardEvaluation: AdminGuardEvaluation;
  ownerEmail: string;
  passkeys: AdminPasskeyRecord[];
  biometricLockRequired: boolean;
  onBiometricUnlockSuccess: (result: {
    credentialId: string;
    nextSignCount: number;
    deviceLabel: string;
    wasSignedOut: boolean;
  }) => Promise<void>;
  onSignInWithGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onBackToHub: () => void;
  children: React.ReactNode;
}

export const AdminAuthGate: React.FC<AdminAuthGateProps> = ({
  authLoading,
  currentUser,
  guardEvaluation,
  ownerEmail,
  passkeys,
  biometricLockRequired,
  onBiometricUnlockSuccess,
  onSignInWithGoogle,
  onSignOut,
  onBackToHub,
  children,
}) => {
  const [signingIn, setSigningIn] = useState(false);
  const [verifyingBiometric, setVerifyingBiometric] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const autoPromptAttemptedRef = useRef(false);

  useEffect(() => {
    void registerAdminServiceWorker();
  }, []);

  const platformInfo = detectBiometricPlatform();
  const localPairedPasskeys = loadPairedDevicePasskeys(ownerEmail);
  const effectivePasskeys = selectPreferredPasskeysForDevice(
    passkeys,
    localPairedPasskeys,
    platformInfo.platform
  );

  const handleBiometricUnlock = async (
    wasSignedOut: boolean,
    options?: { silentCancel?: boolean }
  ) => {
    setAuthError(null);
    setVerifyingBiometric(true);
    try {
      const candidateList = wasSignedOut
        ? localPairedPasskeys
        : effectivePasskeys;
      const verified = await authenticateWithBiometricPasskey({
        passkeys: candidateList,
      });

      // Keep local paired device cache fresh after verified unlock
      savePairedDevicePasskey({
        ...verified.matchedPasskey,
        signCount: verified.nextSignCount,
      });

      if (wasSignedOut) {
        await onSignInWithGoogle();
      }

      await onBiometricUnlockSuccess({
        credentialId: verified.credentialId,
        nextSignCount: verified.nextSignCount,
        deviceLabel: verified.matchedPasskey.deviceLabel,
        wasSignedOut,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : `${platformInfo.biometricName} verification failed.`;
      if (!options?.silentCancel) {
        setAuthError(msg);
      }
    } finally {
      setVerifyingBiometric(false);
    }
  };

  // Auto-prompt fingerprint / biometric unlock once when signed-in owner opens locked /admin
  useEffect(() => {
    if (!biometricLockRequired) {
      autoPromptAttemptedRef.current = false;
      return;
    }
    if (
      authLoading ||
      !guardEvaluation.authorized ||
      autoPromptAttemptedRef.current ||
      effectivePasskeys.length === 0
    ) {
      return;
    }
    autoPromptAttemptedRef.current = true;
    const timer = window.setTimeout(() => {
      void handleBiometricUnlock(false, { silentCancel: true });
    }, 220);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, guardEvaluation.authorized, biometricLockRequired, effectivePasskeys.length]);

  if (guardEvaluation.authorized && !biometricLockRequired && !authLoading) {
    return <>{children}</>;
  }

  const renderBiometricIcon = (className = 'w-4 h-4') => {
    if (platformInfo.platform === 'ios') {
      return <ScanFace className={className} />;
    }
    if (platformInfo.platform === 'windows') {
      return <ShieldCheck className={className} />;
    }
    return <Fingerprint className={className} />;
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await onSignInWithGoogle();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Google Sign-In was cancelled or failed.';
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="relative z-10 min-h-screen flex items-center justify-center px-3 sm:px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:py-16 font-manrope">
      <main
        aria-label="Protected Solo Admin Security Gate"
        className="w-full max-w-[460px] rounded-[24px] sm:rounded-[28px] bg-[#F4EDE2] border border-[#D5C4AE] text-[#1A120E] p-5 sm:p-8 shadow-[0_24px_60px_-15px_rgba(26,18,14,0.52)] space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBackToHub}
            className="min-h-[44px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 sm:px-3 sm:py-1.5 rounded-xl bg-[#FAF6F0] hover:bg-[#D5C4AE] border border-[#B89B7E] text-xs font-semibold text-[#1A120E] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Link Hub</span>
          </button>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-lg bg-[#3A2418] text-[#FAF6F0] font-ibm-mono text-[10px] font-bold uppercase tracking-wider">
            <Lock className="w-3 h-3" />
            <span>Solo Admin Lock</span>
          </span>
        </div>

        {authLoading ? (
          <div className="py-10 flex flex-col items-center text-center space-y-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#3A2418]" />
            <p className="text-xs font-semibold text-[#3A2418]">
              Verifying Google Identity &amp; Owner UID Lock...
            </p>
          </div>
        ) : currentUser && !guardEvaluation.authorized ? (
          /* EXPLICIT ACCESS DENIED FOR UNAUTHORIZED GOOGLE ACCOUNTS */
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#3A2418] text-[#FAF6F0] space-y-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[#E5B887] shrink-0" />
                <h1 className="text-base font-bold">Access Denied</h1>
              </div>
              <p className="text-xs text-[#FAF6F0]/90 leading-relaxed">
                {guardEvaluation.reason ||
                  'This Link Hub Admin Studio is strictly restricted to a single verified site owner.'}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-ibm-mono text-[10px] font-bold uppercase text-[#3A2418]">
                  Signed-in Account
                </span>
                <span className="font-ibm-mono text-[10px] font-bold text-[#9A2E2E]">
                  NOT OWNER
                </span>
              </div>
              <p className="font-ibm-mono font-bold text-[#1A120E] truncate">
                {currentUser.email || 'No email provided'}
              </p>
              <p className="text-[11px] text-[#3A2418]">
                Only the allowlisted owner account (<span className="font-ibm-mono">{ownerEmail}</span>) with matching UID lock may enter.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={onSignOut}
                className="flex-1 min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A120E] hover:bg-[#3A2418] text-[#FAF6F0] text-xs font-semibold transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out &amp; Switch Account</span>
              </button>
              <button
                type="button"
                onClick={onBackToHub}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FAF6F0] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[#1A120E] text-xs font-semibold transition-colors cursor-pointer"
              >
                <span>Return Home</span>
              </button>
            </div>
          </div>
        ) : guardEvaluation.authorized && biometricLockRequired ? (
          /* BIOMETRIC QUICK UNLOCK FOR SIGNED-IN SOLO OWNER */
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-[#6B4A2E]">
                {renderBiometricIcon('w-4 h-4')}
                <span>{platformInfo.biometricName} Ready</span>
              </div>
              <h1 className="text-xl font-bold text-[#1A120E] tracking-tight">
                Unlock Link Hub Studio
              </h1>
              <p className="text-xs font-medium text-[#3A2418] leading-relaxed">
                Signed in as <span className="font-ibm-mono font-bold">{currentUser?.email}</span>. Verify with {platformInfo.biometricName} for instant entry.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-1.5 text-xs">
              <p className="font-semibold text-[#1A120E]">
                Enrolled Device{effectivePasskeys.length > 1 ? 's' : ''}:{' '}
                <span className="font-ibm-mono text-[#3A2418]">
                  {effectivePasskeys.map((p) => p.deviceLabel).join(', ')}
                </span>
              </p>
              <p className="text-[11px] text-[#3A2418] leading-relaxed">
                {platformInfo.hint}
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[#FAF6F0] border border-[#9A2E2E] text-xs font-semibold text-[#9A2E2E]"
              >
                {authError}
              </div>
            )}

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => handleBiometricUnlock(false)}
                disabled={verifyingBiometric || signingIn}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-[#1A120E] hover:bg-[#3A2418] disabled:opacity-60 text-[#FAF6F0] text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                {verifyingBiometric ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  renderBiometricIcon('w-4 h-4')
                )}
                <span>
                  {verifyingBiometric
                    ? `Verifying ${platformInfo.biometricName}...`
                    : platformInfo.actionLabel}
                </span>
              </button>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={signingIn || verifyingBiometric}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#FAF6F0] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[#1A120E] text-xs font-semibold transition-colors cursor-pointer"
                >
                  <span>{signingIn ? 'Verifying Google...' : 'Verify with Google instead'}</span>
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#FAF6F0] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[#3A2418] text-xs font-semibold transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* UNAUTHENTICATED GOOGLE SIGN-IN + PAIRED BIOMETRIC FAST HANDOFF */
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h1 className="text-xl font-bold text-[#1A120E] tracking-tight">
                Sign in to Link Hub Studio
              </h1>
              <p className="text-xs font-medium text-[#3A2418] leading-relaxed">
                This workspace is private to the sole owner. Authenticate with Google to verify your email allowlist and owner UID lock, or use your paired device biometric passkey.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-2 text-xs">
              <div className="flex items-center gap-2 text-[#1A120E] font-semibold">
                <CheckCircle2 className="w-4 h-4 text-[#2E5E3E] shrink-0" />
                <span>Zero-Trust Firestore Rules &amp; Biometric Passkeys</span>
              </div>
              <p className="text-[11px] text-[#3A2418] leading-relaxed">
                Supports Android Fingerprint, iOS Face ID / Touch ID, and Windows Hello. Enroll your device once inside Security &amp; Biometrics for instant unlock.
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[#FAF6F0] border border-[#9A2E2E] text-xs font-semibold text-[#9A2E2E]"
              >
                {authError}
              </div>
            )}

            <div className="space-y-2.5">
              {localPairedPasskeys.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleBiometricUnlock(true)}
                  disabled={verifyingBiometric || signingIn}
                  className="w-full min-h-[48px] inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-[#3A2418] hover:bg-[#1A120E] disabled:opacity-60 text-[#FAF6F0] text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  {verifyingBiometric ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    renderBiometricIcon('w-4 h-4')
                  )}
                  <span>
                    {verifyingBiometric
                      ? `Verifying ${platformInfo.biometricName}...`
                      : `${platformInfo.actionLabel} (Fast Login)`}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={signingIn || verifyingBiometric}
                className={`w-full min-h-[48px] inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer ${
                  localPairedPasskeys.length > 0
                    ? 'bg-[#FAF6F0] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[#1A120E]'
                    : 'bg-[#1A120E] hover:bg-[#3A2418] text-[#FAF6F0]'
                } disabled:opacity-60`}
              >
                {signingIn ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"
                    />
                  </svg>
                )}
                <span>{signingIn ? 'Opening Google Sign-In...' : 'Continue with Google'}</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

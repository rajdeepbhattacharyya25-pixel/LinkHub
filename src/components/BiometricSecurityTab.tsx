import React, { useEffect, useState } from 'react';
import {
  Fingerprint,
  ScanFace,
  ShieldCheck,
  Laptop,
  Smartphone,
  Trash2,
  Lock,
  Plus,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import {
  checkBiometricSupport,
  detectBiometricPlatform,
  loadPairedDevicePasskeys,
  registerOwnerBiometricPasskey,
  type AdminPasskeyRecord,
  type BiometricPlatform,
  type BiometricSupportStatus,
} from '../utils/biometricAuth';
import {
  deleteAdminPasskeyFromFirestore,
  renameAdminPasskeyInFirestore,
  saveAdminPasskeyToFirestore,
} from '../services/firebaseHubService';

export interface BiometricSecurityTabProps {
  ownerUid: string;
  ownerEmail: string;
  displayName: string;
  passkeys: AdminPasskeyRecord[];
  biometricLockEnabled: boolean;
  onToggleBiometricLock: (enabled: boolean) => void;
  onLockStudioNow: () => void;
  onNotify: (msg: string) => void;
}

function getPlatformIcon(platform: BiometricPlatform) {
  switch (platform) {
    case 'android':
      return <Fingerprint className="w-4 h-4 shrink-0" />;
    case 'ios':
      return <ScanFace className="w-4 h-4 shrink-0" />;
    case 'windows':
      return <Laptop className="w-4 h-4 shrink-0" />;
    case 'macos':
      return <Laptop className="w-4 h-4 shrink-0" />;
    default:
      return <Smartphone className="w-4 h-4 shrink-0" />;
  }
}

function getPlatformHumanLabel(platform: BiometricPlatform): string {
  switch (platform) {
    case 'android':
      return 'Android Fingerprint';
    case 'ios':
      return 'iOS Face ID / Touch ID';
    case 'windows':
      return 'Windows Hello';
    case 'macos':
      return 'macOS Touch ID';
    default:
      return 'Device Passkey';
  }
}

export const BiometricSecurityTab: React.FC<BiometricSecurityTabProps> = ({
  ownerUid,
  ownerEmail,
  displayName,
  passkeys,
  biometricLockEnabled,
  onToggleBiometricLock,
  onLockStudioNow,
  onNotify,
}) => {
  const platformInfo = detectBiometricPlatform();
  const [support, setSupport] = useState<BiometricSupportStatus | null>(null);
  const [deviceLabel, setDeviceLabel] = useState(platformInfo.deviceDefaultName);
  const [enrolling, setEnrolling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  const localPairedIds = new Set(
    loadPairedDevicePasskeys(ownerEmail).map((p) => p.credentialId)
  );

  useEffect(() => {
    checkBiometricSupport()
      .then(setSupport)
      .catch(() => {});
  }, []);

  const handleEnrollDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setEnrolling(true);
    try {
      const record = await registerOwnerBiometricPasskey({
        ownerUid,
        ownerEmail,
        displayName,
        deviceLabel: deviceLabel.trim() || platformInfo.deviceDefaultName,
      });
      await saveAdminPasskeyToFirestore(record);
      onToggleBiometricLock(true);
      onNotify(`Registered ${record.deviceLabel} for instant biometric unlock`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not register biometric passkey on this device.'
      );
    } finally {
      setEnrolling(false);
    }
  };

  const handleSaveRename = async (pk: AdminPasskeyRecord) => {
    const clean = editingLabel.trim();
    if (!clean) return;
    try {
      await renameAdminPasskeyInFirestore({
        credentialId: pk.credentialId,
        deviceLabel: clean,
        signCount: pk.signCount,
      });
      setEditingId(null);
      setEditingLabel('');
      onNotify(`Renamed passkey to "${clean}"`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to rename biometric passkey.'
      );
    }
  };

  const handleRevoke = async (pk: AdminPasskeyRecord) => {
    setErrorMsg(null);
    try {
      await deleteAdminPasskeyFromFirestore(pk.credentialId);
      onNotify(`Revoked ${pk.deviceLabel}`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to revoke biometric passkey.'
      );
    }
  };

  return (
    <section aria-label="Security and Biometric Passkeys" className="space-y-4 sm:space-y-5">
      {/* Header & Quick Lock Row */}
      <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#3A2418] text-[#FAF6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-[#E5B887] shrink-0" />
            <h2 className="text-[13px] sm:text-base font-bold leading-snug">
              Biometric Fast Login
            </h2>
          </div>
          <p className="text-[11px] sm:text-xs text-[#FAF6F0]/85 leading-relaxed">
            Pair your phone or computer once after Google Sign-In. Returning to{' '}
            <code className="px-1.5 py-0.5 rounded bg-[#1A120E]/60 font-ibm-mono text-[10.5px]">
              #admin
            </code>{' '}
            unlocks directly with hardware WebAuthn biometrics verified against Firestore.
          </p>
        </div>

        <button
          type="button"
          onClick={onLockStudioNow}
          disabled={passkeys.length === 0}
          className="w-full sm:w-auto min-h-[38px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg sm:rounded-xl bg-[#FAF6F0] hover:bg-[#D5C4AE] disabled:opacity-50 text-[#1A120E] text-xs font-bold shrink-0 cursor-pointer transition-colors"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Lock Studio Now</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-5">
        {/* Left: Enroll Current Device */}
        <form
          onSubmit={handleEnrollDevice}
          className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-3.5"
        >
          <div className="space-y-1">
            <p className="font-ibm-mono text-[10px] font-bold uppercase tracking-wider text-[#6B4A2E]">
              Detected Environment · {platformInfo.biometricName}
            </p>
            <h3 className="text-[13px] sm:text-sm font-bold text-[#1A120E]">
              Register This Device for Biometric Login
            </h3>
            <p className="text-[11px] sm:text-xs text-[#3A2418] leading-relaxed">
              {platformInfo.hint} Only the public cryptographic key is saved in Cloud Firestore; your biometric template never leaves your device.
            </p>
          </div>

          {support?.inEmbeddedIframe && (
            <div className="p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[11px] text-[#3A2418] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#6B4A2E] shrink-0 mt-0.5" />
              <span>
                You appear to be viewing inside an embedded iframe. If your browser blocks passkey prompts here, open the direct app URL in its own browser tab to enroll biometrics.
              </span>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#9A2E2E] text-xs font-semibold text-[#9A2E2E]"
            >
              {errorMsg}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="biometric-device-label"
              className="block text-[12px] font-bold text-[#1A120E]"
            >
              Device Name
            </label>
            <input
              id="biometric-device-label"
              type="text"
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              maxLength={120}
              placeholder={platformInfo.deviceDefaultName}
              className="w-full min-h-[36px] px-3 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs font-medium text-[#1A120E]"
            />
          </div>

          <label className="flex items-center gap-2.5 min-h-[38px] p-2.5 sm:p-3 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12px] sm:text-xs font-semibold text-[#1A120E] cursor-pointer">
            <input
              type="checkbox"
              checked={biometricLockEnabled}
              onChange={(e) => onToggleBiometricLock(e.target.checked)}
              className="w-4 h-4 accent-[#3A2418] shrink-0"
            />
            <span>Require biometric unlock whenever returning to #admin</span>
          </label>

          <button
            type="submit"
            disabled={enrolling || support?.supported === false}
            className="w-full min-h-[42px] sm:min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg sm:rounded-xl bg-[#1A120E] hover:bg-[#3A2418] disabled:opacity-55 text-[#FAF6F0] text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            {enrolling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>{enrolling ? 'Waiting for Device Biometric...' : platformInfo.setupLabel}</span>
          </button>
        </form>

        {/* Right: Enrolled Devices List */}
        <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-[#FAF6F0] border border-[#B89B7E] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[13px] sm:text-sm font-bold text-[#1A120E]">
                Enrolled Owner Devices
              </h3>
              <p className="text-[11px] text-[#3A2418]">
                Synced to Firestore <span className="font-ibm-mono">/adminPasskeys</span> · Locked to {ownerEmail}
              </p>
            </div>
            <span className="font-ibm-mono text-xs font-bold text-[#3A2418] shrink-0">
              {passkeys.length} active
            </span>
          </div>

          {passkeys.length === 0 ? (
            <div className="p-5 sm:p-6 rounded-xl bg-[#F4EDE2] border border-dashed border-[#B89B7E] text-center space-y-1">
              <p className="text-xs font-bold text-[#1A120E]">
                No biometric devices enrolled yet
              </p>
              <p className="text-[11px] text-[#3A2418]">
                Click &ldquo;{platformInfo.setupLabel}&rdquo; to register your Android Fingerprint, iPhone Face ID, or Windows Hello.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {passkeys.map((pk) => {
                const isThisBrowser = localPairedIds.has(pk.credentialId);
                const isEditing = editingId === pk.credentialId;
                return (
                  <li
                    key={pk.credentialId}
                    className="p-3 sm:p-3.5 rounded-xl bg-[#F4EDE2] border border-[#B89B7E] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-[#3A2418] text-[#FAF6F0] flex items-center justify-center shrink-0">
                          {getPlatformIcon(pk.platform)}
                        </span>
                        <div className="min-w-0">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editingLabel}
                                onChange={(e) => setEditingLabel(e.target.value)}
                                aria-label="Edit device label"
                                className="min-h-[34px] px-2.5 py-1 rounded-md bg-[#FAF6F0] border border-[#B89B7E] text-[12.5px] sm:text-xs font-semibold text-[#1A120E]"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveRename(pk)}
                                aria-label="Save device name"
                                className="min-h-[34px] min-w-[34px] p-1.5 rounded-md bg-[#3A2418] text-[#FAF6F0] flex items-center justify-center cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(pk.credentialId);
                                setEditingLabel(pk.deviceLabel);
                              }}
                              title="Click to rename device"
                              className="text-left text-xs font-bold text-[#1A120E] hover:underline truncate block cursor-pointer py-0.5"
                            >
                              {pk.deviceLabel}
                            </button>
                          )}
                          <p className="text-[11px] text-[#3A2418]">
                            {getPlatformHumanLabel(pk.platform)}
                            {isThisBrowser ? ' · Paired on this browser' : ''}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRevoke(pk)}
                        aria-label={`Revoke ${pk.deviceLabel}`}
                        title="Revoke passkey"
                        className="min-h-[34px] sm:min-h-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] hover:bg-[#D5C4AE] border border-[#B89B7E] text-[11px] font-semibold text-[#9A2E2E] shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Revoke</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-[10.5px] sm:text-[11px] font-ibm-mono text-[#6B4A2E]">
                      <span>Alg: {pk.algorithm === -257 ? 'RS256' : 'ES256'}</span>
                      <span aria-hidden="true">·</span>
                      <span>Uses: {pk.signCount}</span>
                      {pk.lastUsedAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Last verified: {pk.lastUsedAt}</span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

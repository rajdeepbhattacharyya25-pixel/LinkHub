export type BiometricPlatform = 'android' | 'ios' | 'windows' | 'macos' | 'other';

export interface BiometricPlatformInfo {
  platform: BiometricPlatform;
  biometricName: string;
  actionLabel: string;
  setupLabel: string;
  deviceDefaultName: string;
  hint: string;
}

export interface AdminPasskeyRecord {
  credentialId: string;
  ownerUid: string;
  ownerEmail: string;
  deviceLabel: string;
  platform: BiometricPlatform;
  publicKeySpki: string;
  algorithm: -7 | -257;
  transports: string[];
  signCount: number;
  createdAt?: string;
  lastUsedAt?: string;
}

export interface BiometricSupportStatus {
  supported: boolean;
  platformAuthenticatorAvailable: boolean;
  inEmbeddedIframe: boolean;
  reason?: string;
}

const LOCAL_PAIRED_PASSKEYS_KEY = 'linkhub_biometric_device_v1';
const LOCAL_BIOMETRIC_LOCK_PREF_KEY = 'linkhub_biometric_lock_enabled_v1';

export function detectBiometricPlatform(
  userAgentInput?: string,
  platformInput?: string,
  maxTouchPointsInput?: number
): BiometricPlatformInfo {
  const ua =
    userAgentInput ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const plat =
    platformInput ??
    (typeof navigator !== 'undefined' ? navigator.platform || '' : '');
  const touchPoints =
    maxTouchPointsInput ??
    (typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0);

  if (/android/i.test(ua)) {
    return {
      platform: 'android',
      biometricName: 'Android Fingerprint',
      actionLabel: 'Unlock with Fingerprint',
      setupLabel: 'Enable Android Fingerprint',
      deviceDefaultName: 'Android · Fingerprint',
      hint: 'Uses your Android BiometricPrompt fingerprint sensor.',
    };
  }

  const isIPadOS = /macintosh/i.test(ua) && touchPoints > 1;
  if (/iphone|ipad|ipod/i.test(ua) || isIPadOS) {
    return {
      platform: 'ios',
      biometricName: 'Face ID / Touch ID',
      actionLabel: 'Unlock with Face ID',
      setupLabel: 'Enable Face ID / Touch ID',
      deviceDefaultName: 'iPhone / iPad · Face ID',
      hint: 'Uses Apple Face ID or Touch ID on your iOS device.',
    };
  }

  if (/windows|win32|win64/i.test(ua) || /win/i.test(plat)) {
    return {
      platform: 'windows',
      biometricName: 'Windows Hello',
      actionLabel: 'Unlock with Windows Hello',
      setupLabel: 'Enable Windows Hello',
      deviceDefaultName: 'Windows PC · Windows Hello',
      hint: 'Uses Windows Hello Fingerprint, Facial Recognition, or PIN.',
    };
  }

  if (/macintosh|mac os x/i.test(ua) || /mac/i.test(plat)) {
    return {
      platform: 'macos',
      biometricName: 'Touch ID (macOS)',
      actionLabel: 'Unlock with Touch ID',
      setupLabel: 'Enable Touch ID',
      deviceDefaultName: 'Mac · Touch ID',
      hint: 'Uses Apple Touch ID passkey verification on macOS.',
    };
  }

  return {
    platform: 'other',
    biometricName: 'Device Passkey',
    actionLabel: 'Unlock with Biometrics',
    setupLabel: 'Enable Biometric Passkey',
    deviceDefaultName: 'Trusted Device · Passkey',
    hint: 'Uses your platform biometric authenticator (WebAuthn passkey).',
  };
}

export async function checkBiometricSupport(): Promise<BiometricSupportStatus> {
  if (typeof window === 'undefined') {
    return {
      supported: false,
      platformAuthenticatorAvailable: false,
      inEmbeddedIframe: false,
      reason: 'Biometrics are only available in a browser session.',
    };
  }

  const inEmbeddedIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  if (!window.PublicKeyCredential || !navigator.credentials) {
    return {
      supported: false,
      platformAuthenticatorAvailable: false,
      inEmbeddedIframe,
      reason: 'This browser does not support WebAuthn platform biometrics.',
    };
  }

  let platformAvailable = false;
  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      platformAvailable =
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {
    platformAvailable = false;
  }

  return {
    supported: true,
    platformAuthenticatorAvailable: platformAvailable,
    inEmbeddedIframe,
    reason: platformAvailable
      ? undefined
      : 'No platform biometric sensor reported active (or embedded frame restricts passkeys).',
  };
}

export function bytesToBase64Url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(b64u: string): Uint8Array {
  const normalized = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

export function toStrictArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Converts ASN.1 DER-encoded ECDSA signature (`SEQUENCE { INTEGER r, INTEGER s }`)
 * returned by WebAuthn authenticators into raw 64-byte IEEE P1363 `(r || s)`
 * expected by Web Crypto `crypto.subtle.verify`.
 */
export function derEcdsaToP1363(der: Uint8Array): Uint8Array {
  if (der.length < 8 || der[0] !== 0x30) {
    throw new Error('Malformed ECDSA DER signature header.');
  }

  let offset = 2;
  if ((der[1] & 0x80) !== 0) {
    const lenBytes = der[1] & 0x7f;
    offset = 2 + lenBytes;
  }

  if (offset + 2 > der.length || der[offset] !== 0x02) {
    throw new Error('Malformed ECDSA DER integer R marker.');
  }
  const rLen = der[offset + 1];
  const rStart = offset + 2;
  const rEnd = rStart + rLen;
  if (rEnd + 2 > der.length || der[rEnd] !== 0x02) {
    throw new Error('Malformed ECDSA DER integer S marker.');
  }
  const sLen = der[rEnd + 1];
  const sStart = rEnd + 2;
  const sEnd = sStart + sLen;
  if (sEnd > der.length) {
    throw new Error('Truncated ECDSA DER signature.');
  }

  const normalizeCoord = (slice: Uint8Array): Uint8Array => {
    let start = 0;
    while (start < slice.length - 1 && slice[start] === 0x00) {
      start++;
    }
    const trimmed = slice.slice(start);
    if (trimmed.length > 32) {
      throw new Error('ECDSA coordinate exceeds P-256 32-byte width.');
    }
    const out = new Uint8Array(32);
    out.set(trimmed, 32 - trimmed.length);
    return out;
  };

  const r = normalizeCoord(der.slice(rStart, rEnd));
  const s = normalizeCoord(der.slice(sStart, sEnd));
  const combined = new Uint8Array(64);
  combined.set(r, 0);
  combined.set(s, 32);
  return combined;
}

export async function verifyWebAuthnAssertion(params: {
  passkey: Pick<AdminPasskeyRecord, 'credentialId' | 'publicKeySpki' | 'algorithm' | 'signCount'>;
  clientDataJSON: Uint8Array;
  authenticatorData: Uint8Array;
  signature: Uint8Array;
  expectedChallenge: Uint8Array;
  expectedOrigin: string;
  expectedRpId: string;
}): Promise<{ verified: boolean; nextSignCount: number; reason?: string }> {
  const {
    passkey,
    clientDataJSON,
    authenticatorData,
    signature,
    expectedChallenge,
    expectedOrigin,
    expectedRpId,
  } = params;

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return {
      verified: false,
      nextSignCount: passkey.signCount,
      reason: 'Web Crypto API unavailable in this environment.',
    };
  }

  let parsedClientData: { type?: string; challenge?: string; origin?: string };
  try {
    const text = new TextDecoder().decode(clientDataJSON);
    parsedClientData = JSON.parse(text);
  } catch {
    return {
      verified: false,
      nextSignCount: passkey.signCount,
      reason: 'Invalid WebAuthn clientDataJSON payload.',
    };
  }

  if (parsedClientData.type !== 'webauthn.get') {
    return {
      verified: false,
      nextSignCount: passkey.signCount,
      reason: 'Unexpected WebAuthn ceremony type.',
    };
  }

  if (parsedClientData.origin !== expectedOrigin) {
    return {
      verified: false,
      nextSignCount: passkey.signCount,
      reason: 'WebAuthn origin mismatch.',
    };
  }

  if (
    !parsedClientData.challenge ||
    !bytesEqual(base64UrlToBytes(parsedClientData.challenge), expectedChallenge)
  ) {
    return {
      verified: false,
      nextSignCount: passkey.signCount,
      reason: 'WebAuthn challenge mismatch.',
    };
  }

  if (authenticatorData.length < 37) {
    return {
      verified: false,
      nextSignCount: passkey.signCount,
      reason: 'Truncated authenticatorData.',
    };
  }

  // Verify RP ID SHA-256 hash matches expected domain
  const expectedRpHash = new Uint8Array(
    await subtle.digest('SHA-256', new TextEncoder().encode(expectedRpId))
  );
  const actualRpHash = authenticatorData.slice(0, 32);
  if (!bytesEqual(actualRpHash, expectedRpHash)) {
    return {
      verified: false,
      nextSignCount: passkey.signCount,
      reason: 'WebAuthn RP ID hash mismatch.',
    };
  }

  // Verify UP (0x01 = User Present) and UV (0x04 = Biometric/PIN User Verified)
  const flags = authenticatorData[32];
  if ((flags & 0x01) === 0 || (flags & 0x04) === 0) {
    return {
      verified: false,
      nextSignCount: passkey.signCount,
      reason: 'Biometric user verification flag (UV) was not asserted by device.',
    };
  }

  const nextSignCount = new DataView(
    authenticatorData.buffer,
    authenticatorData.byteOffset + 33,
    4
  ).getUint32(0, false);

  if (passkey.signCount > 0 && nextSignCount > 0 && nextSignCount <= passkey.signCount) {
    return {
      verified: false,
      nextSignCount: passkey.signCount,
      reason: 'Authenticator counter did not advance (possible cloned passkey).',
    };
  }

  const clientDataHash = new Uint8Array(
    await subtle.digest('SHA-256', toStrictArrayBuffer(clientDataJSON))
  );
  const signedPayload = new Uint8Array(authenticatorData.length + clientDataHash.length);
  signedPayload.set(authenticatorData, 0);
  signedPayload.set(clientDataHash, authenticatorData.length);
  const signedBuffer = toStrictArrayBuffer(signedPayload);

  try {
    const spkiBuffer = toStrictArrayBuffer(base64UrlToBytes(passkey.publicKeySpki));
    if (passkey.algorithm === -7) {
      const key = await subtle.importKey(
        'spki',
        spkiBuffer,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      const p1363Sig = derEcdsaToP1363(signature);
      const ok = await subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        toStrictArrayBuffer(p1363Sig),
        signedBuffer
      );
      return ok
        ? { verified: true, nextSignCount }
        : {
            verified: false,
            nextSignCount: passkey.signCount,
            reason: 'ECDSA biometric signature verification failed.',
          };
    }

    if (passkey.algorithm === -257) {
      const key = await subtle.importKey(
        'spki',
        spkiBuffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const ok = await subtle.verify(
        'RSASSA-PKCS1-v1_5',
        key,
        toStrictArrayBuffer(signature),
        signedBuffer
      );
      return ok
        ? { verified: true, nextSignCount }
        : {
            verified: false,
            nextSignCount: passkey.signCount,
            reason: 'RS256 biometric signature verification failed.',
          };
    }

    return {
      verified: false,
      nextSignCount: passkey.signCount,
      reason: `Unsupported COSE key algorithm: ${passkey.algorithm}`,
    };
  } catch (err) {
    return {
      verified: false,
      nextSignCount: passkey.signCount,
      reason: err instanceof Error ? err.message : 'Cryptographic signature verification failed.',
    };
  }
}

export function formatWebAuthnFriendlyError(err: unknown, platformInfo: BiometricPlatformInfo): string {
  const msg = err instanceof Error ? err.message : String(err || '');
  const name = err instanceof DOMException ? err.name : err instanceof Error ? err.name : '';

  if (
    name === 'SecurityError' ||
    /permissions policy|publickey-credentials|not enabled in this document/i.test(msg)
  ) {
    return `Embedded preview frames restrict ${platformInfo.biometricName}. Open your Link Hub URL in a dedicated browser tab to enroll or unlock with ${platformInfo.biometricName}.`;
  }
  if (name === 'NotAllowedError') {
    return `${platformInfo.biometricName} verification was cancelled or timed out.`;
  }
  if (name === 'InvalidStateError') {
    return `This device already has an active ${platformInfo.biometricName} passkey registered.`;
  }
  return msg || `${platformInfo.biometricName} verification failed.`;
}

export async function registerOwnerBiometricPasskey(params: {
  ownerUid: string;
  ownerEmail: string;
  displayName: string;
  deviceLabel?: string;
}): Promise<AdminPasskeyRecord> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) {
    throw new Error('WebAuthn platform biometrics are not supported in this browser.');
  }

  const platformInfo = detectBiometricPlatform();
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  const userIdBytes = new TextEncoder().encode(params.ownerUid);

  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        rp: {
          name: 'Link Hub Admin Studio',
          id: window.location.hostname,
        },
        user: {
          id: userIdBytes,
          name: params.ownerEmail,
          displayName: params.displayName || 'Link Hub Owner',
        },
        challenge,
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          requireResidentKey: false,
          userVerification: 'required',
        },
        attestation: 'none',
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) {
      throw new Error('No biometric passkey was returned by the device.');
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    const spkiBuf =
      typeof response.getPublicKey === 'function' ? response.getPublicKey() : null;
    if (!spkiBuf) {
      throw new Error(
        'Browser did not export SPKI public key metadata. Try Chrome, Edge, or Safari 15+.'
      );
    }

    const rawAlg =
      typeof response.getPublicKeyAlgorithm === 'function'
        ? response.getPublicKeyAlgorithm()
        : -7;
    const algorithm: -7 | -257 = rawAlg === -257 ? -257 : -7;
    const credentialId = bytesToBase64Url(credential.rawId);
    const transports =
      typeof response.getTransports === 'function'
        ? response.getTransports().slice(0, 6)
        : ['internal'];

    return {
      credentialId,
      ownerUid: params.ownerUid,
      ownerEmail: params.ownerEmail,
      deviceLabel:
        (params.deviceLabel || '').trim().slice(0, 120) || platformInfo.deviceDefaultName,
      platform: platformInfo.platform,
      publicKeySpki: bytesToBase64Url(spkiBuf),
      algorithm,
      transports: transports.length > 0 ? transports : ['internal'],
      signCount: 0,
    };
  } catch (err) {
    throw new Error(formatWebAuthnFriendlyError(err, platformInfo));
  }
}

export async function authenticateWithBiometricPasskey(params: {
  passkeys: AdminPasskeyRecord[];
}): Promise<{
  credentialId: string;
  nextSignCount: number;
  matchedPasskey: AdminPasskeyRecord;
}> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) {
    throw new Error('WebAuthn platform biometrics are not supported in this browser.');
  }

  if (params.passkeys.length === 0) {
    throw new Error('No biometric passkey is registered on this device yet.');
  }

  const platformInfo = detectBiometricPlatform();
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const allowCredentials: PublicKeyCredentialDescriptor[] = params.passkeys.map((pk) => ({
    id: toStrictArrayBuffer(base64UrlToBytes(pk.credentialId)),
    type: 'public-key',
    transports: (pk.transports.length > 0 ? pk.transports : ['internal']) as AuthenticatorTransport[],
  }));

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials,
        userVerification: 'required',
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error('Biometric verification did not return an assertion.');
    }

    const credentialId = bytesToBase64Url(assertion.rawId);
    const matchedPasskey = params.passkeys.find((p) => p.credentialId === credentialId);
    if (!matchedPasskey) {
      throw new Error('Authenticated passkey is not registered to the solo owner.');
    }

    const resp = assertion.response as AuthenticatorAssertionResponse;
    const verification = await verifyWebAuthnAssertion({
      passkey: matchedPasskey,
      clientDataJSON: new Uint8Array(resp.clientDataJSON),
      authenticatorData: new Uint8Array(resp.authenticatorData),
      signature: new Uint8Array(resp.signature),
      expectedChallenge: challenge,
      expectedOrigin: window.location.origin,
      expectedRpId: window.location.hostname,
    });

    if (!verification.verified) {
      throw new Error(verification.reason || 'Biometric signature verification failed.');
    }

    return {
      credentialId,
      nextSignCount: verification.nextSignCount,
      matchedPasskey,
    };
  } catch (err) {
    throw new Error(formatWebAuthnFriendlyError(err, platformInfo));
  }
}

/* ============================================================================
 * LOCAL DEVICE PAIRING CACHE (Public key handle only — zero secrets stored)
 * ========================================================================== */

export function loadPairedDevicePasskeys(ownerEmail?: string): AdminPasskeyRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_PAIRED_PASSKEYS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AdminPasskeyRecord => {
      if (!item || typeof item !== 'object') return false;
      if (
        ownerEmail &&
        String(item.ownerEmail || '').toLowerCase() !== ownerEmail.toLowerCase()
      ) {
        return false;
      }
      return Boolean(item.credentialId && item.publicKeySpki && item.ownerUid);
    });
  } catch {
    return [];
  }
}

export function savePairedDevicePasskey(record: AdminPasskeyRecord): void {
  if (typeof window === 'undefined') return;
  try {
    const current = loadPairedDevicePasskeys();
    const next = [record, ...current.filter((p) => p.credentialId !== record.credentialId)];
    window.localStorage.setItem(LOCAL_PAIRED_PASSKEYS_KEY, JSON.stringify(next));
    window.localStorage.setItem(LOCAL_BIOMETRIC_LOCK_PREF_KEY, 'true');
  } catch {
    // Ignore quota errors
  }
}

export function removePairedDevicePasskey(credentialId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const next = loadPairedDevicePasskeys().filter((p) => p.credentialId !== credentialId);
    window.localStorage.setItem(LOCAL_PAIRED_PASSKEYS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors
  }
}

export function isBiometricLockPreferred(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(LOCAL_BIOMETRIC_LOCK_PREF_KEY);
    return raw !== 'false';
  } catch {
    return true;
  }
}

export function setBiometricLockPreferred(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_BIOMETRIC_LOCK_PREF_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
}

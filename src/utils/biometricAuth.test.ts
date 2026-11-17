import test from 'node:test';
import assert from 'node:assert/strict';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  derEcdsaToP1363,
  detectBiometricPlatform,
  verifyWebAuthnAssertion,
} from './biometricAuth';

function p1363ToDer(sig: Uint8Array): Uint8Array {
  const encodeInt = (bytes: Uint8Array): Uint8Array => {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0x00) i++;
    let body = bytes.slice(i);
    if ((body[0] & 0x80) !== 0) {
      const prefixed = new Uint8Array(body.length + 1);
      prefixed[0] = 0x00;
      prefixed.set(body, 1);
      body = prefixed;
    }
    const out = new Uint8Array(2 + body.length);
    out[0] = 0x02;
    out[1] = body.length;
    out.set(body, 2);
    return out;
  };
  const r = encodeInt(sig.slice(0, 32));
  const s = encodeInt(sig.slice(32, 64));
  const out = new Uint8Array(2 + r.length + s.length);
  out[0] = 0x30;
  out[1] = r.length + s.length;
  out.set(r, 2);
  out.set(s, 2 + r.length);
  return out;
}

async function buildSignedAssertionFixture(opts?: {
  flags?: number;
  signCount?: number;
  origin?: string;
  rpId?: string;
  challengeOverride?: Uint8Array;
}) {
  const subtle = globalThis.crypto.subtle;
  const keyPair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const spki = await subtle.exportKey('spki', keyPair.publicKey);
  const challenge = new Uint8Array(32);
  globalThis.crypto.getRandomValues(challenge);

  const rpId = opts?.rpId ?? 'example.dev';
  const origin = opts?.origin ?? 'https://example.dev';
  const clientChallenge = opts?.challengeOverride ?? challenge;

  const clientDataJSON = new TextEncoder().encode(
    JSON.stringify({
      type: 'webauthn.get',
      challenge: bytesToBase64Url(clientChallenge),
      origin,
    })
  );

  const rpIdHash = new Uint8Array(
    await subtle.digest('SHA-256', new TextEncoder().encode(rpId))
  );
  const authData = new Uint8Array(37);
  authData.set(rpIdHash, 0);
  authData[32] = opts?.flags ?? 0x05; // UP (0x01) + UV (0x04)
  new DataView(authData.buffer).setUint32(33, opts?.signCount ?? 1, false);

  const clientDataHash = new Uint8Array(await subtle.digest('SHA-256', clientDataJSON));
  const signedBytes = new Uint8Array(authData.length + clientDataHash.length);
  signedBytes.set(authData, 0);
  signedBytes.set(clientDataHash, authData.length);

  const rawSig = new Uint8Array(
    await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, signedBytes)
  );
  const derSig = p1363ToDer(rawSig);

  return {
    publicKeySpki: bytesToBase64Url(spki),
    challenge,
    clientDataJSON,
    authenticatorData: authData,
    derSig,
  };
}

test('detectBiometricPlatform identifies Android Fingerprint, iOS Face ID, Windows Hello, and macOS Touch ID', () => {
  const android = detectBiometricPlatform(
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36'
  );
  assert.equal(android.platform, 'android');
  assert.match(android.actionLabel, /Fingerprint/i);

  const ios = detectBiometricPlatform(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)'
  );
  assert.equal(ios.platform, 'ios');
  assert.match(ios.actionLabel, /Face ID/i);

  const ipados = detectBiometricPlatform(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'MacIntel',
    5
  );
  assert.equal(ipados.platform, 'ios');

  const win = detectBiometricPlatform(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  );
  assert.equal(win.platform, 'windows');
  assert.match(win.actionLabel, /Windows Hello/i);

  const mac = detectBiometricPlatform(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36',
    'MacIntel',
    0
  );
  assert.equal(mac.platform, 'macos');
  assert.match(mac.actionLabel, /Touch ID/i);
});

test('Base64URL and ASN.1 DER -> IEEE P1363 roundtrip preserves signature coordinates', () => {
  const raw = new Uint8Array(64);
  raw[0] = 0x9a; // high bit triggers 0x00 DER integer padding
  raw[31] = 0x42;
  raw[32] = 0x00; // leading zero trimmed in DER
  raw[33] = 0x7f;
  raw[63] = 0x11;

  const der = p1363ToDer(raw);
  const roundtrip = derEcdsaToP1363(der);
  assert.equal(bytesToBase64Url(roundtrip), bytesToBase64Url(raw));
  assert.deepEqual(base64UrlToBytes(bytesToBase64Url(raw)), raw);
});

test('verifyWebAuthnAssertion accepts valid ES256 biometric assertion and blocks tampering/replay', async () => {
  const valid = await buildSignedAssertionFixture({ signCount: 3 });

  const ok = await verifyWebAuthnAssertion({
    passkey: {
      credentialId: 'cred-1',
      publicKeySpki: valid.publicKeySpki,
      algorithm: -7,
      signCount: 2,
    },
    clientDataJSON: valid.clientDataJSON,
    authenticatorData: valid.authenticatorData,
    signature: valid.derSig,
    expectedChallenge: valid.challenge,
    expectedOrigin: 'https://example.dev',
    expectedRpId: 'example.dev',
  });
  assert.equal(ok.verified, true);
  assert.equal(ok.nextSignCount, 3);

  // Reject missing UV (User Verification) flag
  const noUv = await buildSignedAssertionFixture({ flags: 0x01, signCount: 4 });
  const noUvRes = await verifyWebAuthnAssertion({
    passkey: {
      credentialId: 'cred-1',
      publicKeySpki: noUv.publicKeySpki,
      algorithm: -7,
      signCount: 0,
    },
    clientDataJSON: noUv.clientDataJSON,
    authenticatorData: noUv.authenticatorData,
    signature: noUv.derSig,
    expectedChallenge: noUv.challenge,
    expectedOrigin: 'https://example.dev',
    expectedRpId: 'example.dev',
  });
  assert.equal(noUvRes.verified, false);
  assert.match(noUvRes.reason || '', /UV/i);

  // Reject downgraded signCount (cloned passkey replay)
  const replay = await verifyWebAuthnAssertion({
    passkey: {
      credentialId: 'cred-1',
      publicKeySpki: valid.publicKeySpki,
      algorithm: -7,
      signCount: 5,
    },
    clientDataJSON: valid.clientDataJSON,
    authenticatorData: valid.authenticatorData,
    signature: valid.derSig,
    expectedChallenge: valid.challenge,
    expectedOrigin: 'https://example.dev',
    expectedRpId: 'example.dev',
  });
  assert.equal(replay.verified, false);
  assert.match(replay.reason || '', /counter|cloned/i);

  // Reject wrong origin
  const badOrigin = await verifyWebAuthnAssertion({
    passkey: {
      credentialId: 'cred-1',
      publicKeySpki: valid.publicKeySpki,
      algorithm: -7,
      signCount: 1,
    },
    clientDataJSON: valid.clientDataJSON,
    authenticatorData: valid.authenticatorData,
    signature: valid.derSig,
    expectedChallenge: valid.challenge,
    expectedOrigin: 'https://evil.example',
    expectedRpId: 'example.dev',
  });
  assert.equal(badOrigin.verified, false);
});

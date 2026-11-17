import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Security Rules Structural & "Dirty Dozen" Invariant Verification Suite
 * Validates firestore.rules against firebase-blueprint.json & security_spec.md.
 */

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesText = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8')) as {
  entities: Record<string, { properties: Record<string, { maxLength?: number }> }>;
  firestore: Record<string, unknown>;
};

test('firestore.rules covers every collection declared in firebase-blueprint.json with global default-deny', () => {
  assert.ok(rulesText.includes("rules_version = '2';"));
  assert.ok(
    rulesText.includes('match /{document=**} {\n      allow read, write: if false;\n    }'),
    'Missing default-deny catch-all at root'
  );

  for (const collectionPath of Object.keys(blueprint.firestore)) {
    const topCollection = collectionPath.split('/').filter(Boolean)[0];
    assert.ok(
      rulesText.includes(`match /${topCollection}/`),
      `Missing match block for blueprint collection /${topCollection}`
    );
  }
});

test('Dirty Dozen 1-3: Solo Owner identity lock enforces verified email, owner allowlist, and immutable UID lock', () => {
  // 1. Unverified email spoof rejected
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'));
  assert.ok(rulesText.includes("request.auth.token.email == 'rajdeep.bhattacharyya25@gmail.com'"));

  // 2. AdminLock immutability (cannot delete; update only permitted for one-time migration from prior placeholder email)
  const configMatchIdx = rulesText.indexOf('match /config/{docId}');
  const adminsMatchIdx = rulesText.indexOf('match /admins/{uid}');
  assert.ok(configMatchIdx !== -1 && adminsMatchIdx !== -1);
  const configBlock = rulesText.slice(configMatchIdx, adminsMatchIdx);
  assert.ok(configBlock.includes('allow delete: if false;'));
  assert.ok(configBlock.includes("existing().email != 'rajdeep.bhattacharyya25@gmail.com'"));
  assert.ok(configBlock.includes('!exists(/databases/$(database)/documents/config/adminLock)'));

  // 3. Admins self-registration prevented for non-owners
  const adminsBlock = rulesText.slice(adminsMatchIdx, rulesText.indexOf('match /messages/{messageId}'));
  assert.ok(adminsBlock.includes('allow create: if isSoloOwner()'));
  assert.ok(adminsBlock.includes('uid == request.auth.uid'));
  assert.ok(adminsBlock.includes('allow update, delete: if false;'));
});

test('Dirty Dozen 4-8: PII isolation blocks public reads on inbox/subscribers and enforces server timestamps & shadow-field rejection', () => {
  const messagesBlock = rulesText.slice(
    rulesText.indexOf('match /messages/{messageId}'),
    rulesText.indexOf('match /subscribers/{subscriberId}')
  );
  // PII cannot be read or listed by non-admin visitors, and owner list rules avoid unprovable type predicates
  assert.ok(messagesBlock.includes('allow get: if isSoloOwner()'));
  assert.ok(messagesBlock.includes('allow list: if isBootstrappedOwnerEmail();'));
  const subscribersBlock = rulesText.slice(
    rulesText.indexOf('match /subscribers/{subscriberId}'),
    rulesText.indexOf('match /analyticsEvents/{eventId}')
  );
  assert.ok(subscribersBlock.includes('allow list: if isBootstrappedOwnerEmail();'));
  const analyticsBlock = rulesText.slice(
    rulesText.indexOf('match /analyticsEvents/{eventId}'),
    rulesText.indexOf('match /mediaAssets/{assetId}')
  );
  assert.ok(analyticsBlock.includes('allow list: if isBootstrappedOwnerEmail();'));
  // Pre-marked read=true blocked on create, server timestamp enforced
  assert.ok(messagesBlock.includes('incoming().read == false'));
  assert.ok(messagesBlock.includes('incoming().createdAt == request.time'));
  // Field allowlist prevents shadow ghost fields
  assert.ok(rulesText.includes('data.keys().hasAll(') && rulesText.includes('data.keys().hasOnly('));
});

test('Dirty Dozen 9-12: Path ID hardening, maxLength synchronization, orphan analytics prevention, and storage byte caps', () => {
  assert.ok(rulesText.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$') && id.size()") || rulesText.includes("id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$')"));

  // Links URL bounds & immutable fields on update
  assert.ok(rulesText.includes('data.url.size() <= 1000'));
  assert.ok(rulesText.includes('data.title.size() <= 120'));
  assert.ok(rulesText.includes("data.previewType in ['auto', 'chat', 'linkhub', 'flib', 'chess', 'image']"));
  assert.ok(rulesText.includes('data.autoThumbnailUrl.size() <= 2000'));
  assert.ok(rulesText.includes('incoming().ownerUid == existing().ownerUid'));
  assert.ok(rulesText.includes('incoming().createdAt == existing().createdAt'));

  // Analytics cannot target fabricated link IDs on link_click
  assert.ok(rulesText.includes('exists(/databases/$(database)/documents/links/$(incoming().linkId))'));

  // Media metadata capped at 2 MB and strict image mime types
  assert.ok(rulesText.includes('data.sizeBytes <= 2097152'));
  assert.ok(rulesText.includes("data.mimeType in ['image/webp', 'image/jpeg', 'image/png']"));
});

test('Dirty Dozen 13-14: Biometric passkeys isolate device keys to solo owner and prevent replay counter downgrade', () => {
  const passkeyIdx = rulesText.indexOf('match /adminPasskeys/{credentialId}');
  assert.ok(passkeyIdx !== -1, 'Missing /adminPasskeys match block');
  const passkeyBlock = rulesText.slice(passkeyIdx);
  assert.ok(passkeyBlock.includes('allow get: if isSoloOwner()'));
  assert.ok(passkeyBlock.includes('allow list: if isBootstrappedOwnerEmail() && resource.data.ownerUid == request.auth.uid'));
  assert.ok(passkeyBlock.includes('allow create: if isSoloOwner()'));
  assert.ok(passkeyBlock.includes('incoming().signCount >= existing().signCount'));
  assert.ok(passkeyBlock.includes('incoming().publicKeySpki == existing().publicKeySpki'));
  assert.ok(rulesText.includes("data.platform in ['android', 'ios', 'windows', 'macos', 'other']"));
  assert.ok(rulesText.includes('data.algorithm in [-7, -257]'));
});

test('storage.rules enforces 2 MB image policy, solo-owner isolation, and explicit owner delete access', () => {
  const storageRulesPath = path.resolve(process.cwd(), 'storage.rules');
  const storageRulesText = fs.readFileSync(storageRulesPath, 'utf8');
  assert.ok(storageRulesText.includes('allow read, write: if false;'));
  assert.ok(storageRulesText.includes('allow create, update: if request.auth != null'));
  assert.ok(storageRulesText.includes('allow delete: if request.auth != null'));
  assert.ok(storageRulesText.includes('request.resource.size <= 2 * 1024 * 1024'));
  assert.ok(storageRulesText.includes("request.resource.contentType.matches('image/(webp|jpeg|png)')"));
  assert.ok(storageRulesText.includes("request.auth.token.email == 'rajdeep.bhattacharyya25@gmail.com'"));
});

test('Dirty Dozen 15: PublicMedia fallback enforces non-enumerability, 650KB binary cap, and solo-owner writes', () => {
  const pmIdx = rulesText.indexOf('match /publicMedia/{mediaId}');
  assert.ok(pmIdx !== -1, 'Missing /publicMedia match block');
  const pmBlock = rulesText.slice(pmIdx, rulesText.indexOf('match /adminPasskeys/{credentialId}'));
  assert.ok(pmBlock.includes('allow get: if isValidId(mediaId);'));
  assert.ok(pmBlock.includes('allow list: if false;'));
  assert.ok(pmBlock.includes('allow create: if isSoloOwner()'));
  assert.ok(pmBlock.includes('allow update: if false;'));
  assert.ok(pmBlock.includes('allow delete: if isSoloOwner() && isValidId(mediaId);'));
  assert.ok(rulesText.includes('data.sizeBytes <= 650000'));
  assert.ok(rulesText.includes('data.dataBase64.size() <= 900000'));
});


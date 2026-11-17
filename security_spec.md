# Security Specification — Link Hub Solo Firebase Edition

## 1. Core Data & Security Invariants

1. **Single-Owner Admin Lock (Email + UID Lock)**:
   - Only `request.auth != null && request.auth.token.email_verified == true && request.auth.token.email == 'rajdeep.bhattacharyya25@gmail.com'` is recognized as the owner email.
   - Once `/config/adminLock` is created with the owner's UID, NO other UID (and no overwrite/delete of `/config/adminLock` or `/admins/{uid}`) is permitted. Every administrative `get`, `create`, `update`, and `delete` verifies that `request.auth.uid == get(/databases/$(database)/documents/config/adminLock).data.uid`.
2. **PII Split-Collection Isolation**:
   - `/hub/public` and `/links/{linkId}` contain zero visitor PII.
   - `/messages/{messageId}`, `/subscribers/{subscriberId}`, and `/analyticsEvents/{eventId}` deny all `get`, `list`, `update`, and `delete` operations to non-admin or anonymous callers.
3. **Immutable Temporal & Ownership Fields**:
   - All `createdAt` and `lockedAt` fields MUST equal `request.time` on creation and NEVER change on update.
   - All `ownerUid` fields MUST equal `request.auth.uid` on creation and NEVER change on update.
4. **No Open Reads / Writes & Path Hardening**:
   - Global default-deny catch-all at top of `firestore.rules`.
   - Every single-document path ID (`linkId`, `messageId`, `subscriberId`, `eventId`, `assetId`, `uid`) enforces `isValidId(id)` (`^[a-zA-Z0-9_-]{1,128}$`).
5. **Action-Based Updates & Strict Field Allowlists**:
   - Every `create` enforces exact `keys().hasAll(...) && keys().hasOnly(...)` allowlists plus strict types and `maxLength` bounds from `firebase-blueprint.json`.
   - Every `update` invokes `isValid[Entity](incoming())` AND `incoming().diff(existing()).affectedKeys().hasOnly(...)` action branches.

---

## 2. The "Dirty Dozen" Adversarial Attack Payloads

1. **Unverified Admin Email Spoof (`email == 'rajdeep.bhattacharyya25@gmail.com'`, `email_verified: false`)**: Attacker spoofs JWT email claim without verification -> `PERMISSION_DENIED`.
2. **Second Account Lock Hijack (`/config/adminLock` overwrite by non-owner or second UID)**: Attacker attempts to overwrite or delete `/config/adminLock` -> `PERMISSION_DENIED`.
3. **Self-Assigned Admin Privilege Escalation (`/admins/{attackerUid}` create)**: Non-owner tries inserting their UID into `/admins` -> `PERMISSION_DENIED`.
4. **Visitor Reading Inbox PII (`GET /messages/{id}` or `LIST /messages`)**: Visitor or another signed-in user attempts to read `/messages` or `/subscribers` -> `PERMISSION_DENIED`.
5. **Public Tampering with Links (`CREATE` or `UPDATE` `/links/{id}`)**: Anonymous visitor attempts to change project URL to phishing URL -> `PERMISSION_DENIED`.
6. **Shadow Ghost Field Injection on Contact (`{ ..., isVerified: true }`)**: Visitor attaches unallowlisted `isVerified` field on `/messages/{id}` -> `PERMISSION_DENIED`.
7. **Pre-Marked Read Flag on Message (`{ ..., read: true }`)**: Visitor tries creating a message already marked `read: true` -> `PERMISSION_DENIED`.
8. **Backdated Client Timestamp Forgery (`createdAt: '1999-01-01'`)**: Attacker supplies client timestamp instead of server `request.time` -> `PERMISSION_DENIED`.
9. **Path Poisoning (Oversized ID `'a'.repeat(500)` on `/messages/{id}`)**: Attacker injects invalid characters or >128-char ID -> `PERMISSION_DENIED`.
10. **Payload Size Exhaustion ("Denial of Wallet" 10KB name or >3KB message)**: Attacker sends oversized text fields violating blueprint `maxLength` -> `PERMISSION_DENIED`.
11. **Orphan Analytics Spoof (`linkId: 'nonexistent-id'`, `eventType: 'link_click'`)**: Attacker logs fake click against non-existent link ID -> `PERMISSION_DENIED`.
12. **Storage / Media Metadata Over-Size Poison (`sizeBytes: 99999999` or non-image mimeType `'application/x-msdownload'`)**: Attempt to register invalid binary metadata -> `PERMISSION_DENIED`.
13. **Passkey Registration / Read Spoof (`/adminPasskeys/{id}` create or list by non-owner)**: Attacker attempts to read enrolled biometric devices or register a rogue public key -> `PERMISSION_DENIED`.
14. **Passkey Replay Counter Downgrade (`signCount < existing().signCount` or publicKeySpki overwrite on update)**: Attacker attempts to swap registered SPKI key or roll back `signCount` -> `PERMISSION_DENIED`.


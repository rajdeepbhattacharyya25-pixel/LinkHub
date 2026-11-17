import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractLinkPreviewMetadata,
  LinkPreviewMemoryCache,
  normalizeLinkPreviewType,
  resolveCardPreviewDisplay,
  validatePreviewTargetUrl,
} from './linkPreview';
import { sanitizeLinkPayload } from '../services/firebaseHubService';

test('resolveCardPreviewDisplay enforces the exact 6-option Art dropdown matrix', () => {
  const manual = 'https://cdn.example.com/manual.webp';
  const fetched = 'https://site.example.com/og.png';

  // Fixed built-in artworks ALWAYS show their artwork even if URLs exist
  assert.deepEqual(
    resolveCardPreviewDisplay({ previewType: 'chat', thumbnailUrl: manual, autoThumbnailUrl: fetched }),
    { mode: 'vector', artwork: 'chat', sourceLabel: 'Built-in Profile Card' }
  );
  assert.deepEqual(
    resolveCardPreviewDisplay({ previewType: 'linkhub', thumbnailUrl: manual, autoThumbnailUrl: fetched }),
    { mode: 'vector', artwork: 'linkhub', sourceLabel: 'Built-in Showcase' }
  );
  assert.deepEqual(
    resolveCardPreviewDisplay({ previewType: 'flib', thumbnailUrl: manual, autoThumbnailUrl: fetched }),
    { mode: 'vector', artwork: 'flib', sourceLabel: 'Built-in Editorial Card' }
  );
  assert.deepEqual(
    resolveCardPreviewDisplay({ previewType: 'chess', thumbnailUrl: manual, autoThumbnailUrl: fetched }),
    { mode: 'vector', artwork: 'chess', sourceLabel: 'Built-in Board Grid' }
  );

  // Image mode uses manual/uploaded image, falls back to Chat UI if missing or broken
  assert.deepEqual(
    resolveCardPreviewDisplay({ previewType: 'image', thumbnailUrl: manual, autoThumbnailUrl: fetched }),
    { mode: 'image', imageUrl: manual, sourceLabel: 'Manual Upload' }
  );
  assert.deepEqual(
    resolveCardPreviewDisplay({ previewType: 'image', thumbnailUrl: '', autoThumbnailUrl: fetched }),
    { mode: 'vector', artwork: 'chat', sourceLabel: 'Built-in Fallback' }
  );
  assert.deepEqual(
    resolveCardPreviewDisplay({
      previewType: 'image',
      thumbnailUrl: manual,
      autoThumbnailUrl: fetched,
      imageFailed: true,
    }),
    { mode: 'vector', artwork: 'chat', sourceLabel: 'Built-in Fallback' }
  );

  // Auto Preview mode: manual overrides auto -> auto fetched -> built-in fallback
  assert.deepEqual(
    resolveCardPreviewDisplay({ previewType: 'auto', thumbnailUrl: '', autoThumbnailUrl: fetched }),
    { mode: 'image', imageUrl: fetched, sourceLabel: 'Auto-Fetched Preview' }
  );
  assert.deepEqual(
    resolveCardPreviewDisplay({ previewType: 'auto', thumbnailUrl: manual, autoThumbnailUrl: fetched }),
    { mode: 'image', imageUrl: manual, sourceLabel: 'Manual Upload' }
  );
  assert.deepEqual(
    resolveCardPreviewDisplay({ previewType: 'auto', thumbnailUrl: '', autoThumbnailUrl: '' }),
    { mode: 'vector', artwork: 'chat', sourceLabel: 'Built-in Fallback' }
  );
  assert.deepEqual(
    resolveCardPreviewDisplay({
      previewType: 'auto',
      thumbnailUrl: '',
      autoThumbnailUrl: fetched,
      imageFailed: true,
    }),
    { mode: 'vector', artwork: 'chat', sourceLabel: 'Built-in Fallback' }
  );
});

test('validatePreviewTargetUrl accepts public HTTP(S) URLs and blocks private/SSRF targets', () => {
  const valid = validatePreviewTargetUrl('example.dev/projects#top');
  assert.equal(valid.valid, true);
  assert.equal(valid.normalizedUrl, 'https://example.dev/projects');

  for (const blocked of [
    '',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'http://localhost:3000',
    'http://127.0.0.1:8080/admin',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/internal',
    'https://192.168.1.1/',
    'http://[::1]:3000',
    'http://internal-service.local',
  ]) {
    const res = validatePreviewTargetUrl(blocked);
    assert.equal(res.valid, false, `Expected URL to be blocked: ${blocked}`);
  }
});

test('extractLinkPreviewMetadata extracts OG/Twitter images, resolves relative paths, and handles missing images cleanly', () => {
  const ogHtml = `
    <html>
      <head>
        <title>Vercel Demo App</title>
        <meta property="og:title" content="Vercel Demo &amp; Studio" />
        <meta property="og:image" content="/assets/preview-card.png?w=1200&amp;q=80" />
        <meta name="description" content="Fast editorial deployment." />
      </head>
      <body></body>
    </html>
  `;
  const parsed = extractLinkPreviewMetadata(ogHtml, 'https://vercel.com/templates');
  assert.equal(parsed.found, true);
  assert.equal(parsed.imageUrl, 'https://vercel.com/assets/preview-card.png?w=1200&q=80');
  assert.equal(parsed.title, 'Vercel Demo & Studio');
  assert.equal(parsed.description, 'Fast editorial deployment.');

  const noImageHtml = `<html><head><title>Plain Site</title></head><body>Hello</body></html>`;
  const missing = extractLinkPreviewMetadata(noImageHtml, 'https://example.com');
  assert.equal(missing.found, false);
  assert.equal(missing.imageUrl, null);
  assert.equal(missing.title, 'Plain Site');
});

test('LinkPreviewMemoryCache respects hit/miss TTLs and bounded LRU eviction', () => {
  const cache = new LinkPreviewMemoryCache({
    maxEntries: 2,
    hitTtlMs: 10_000,
    missTtlMs: 1_000,
  });

  cache.set(
    'https://a.example.com',
    { ok: true, found: true, imageUrl: 'https://a.example.com/og.png', sourceUrl: 'https://a.example.com' },
    1000
  );
  cache.set(
    'https://b.example.com',
    { ok: true, found: false, imageUrl: null, sourceUrl: 'https://b.example.com' },
    1000
  );

  // Hit on A refreshes LRU position
  const hitA = cache.get('https://a.example.com', 1500);
  assert.equal(hitA?.cached, true);
  assert.equal(hitA?.imageUrl, 'https://a.example.com/og.png');

  // Miss on B expires after missTtlMs (1000ms)
  assert.equal(cache.get('https://b.example.com', 2500), null);

  // Capacity eviction test
  cache.set(
    'https://c.example.com',
    { ok: true, found: true, imageUrl: 'https://c.example.com/og.png', sourceUrl: 'https://c.example.com' },
    2600
  );
  cache.set(
    'https://d.example.com',
    { ok: true, found: true, imageUrl: 'https://d.example.com/og.png', sourceUrl: 'https://d.example.com' },
    2700
  );
  assert.equal(cache.size, 2);
  assert.equal(cache.get('https://a.example.com', 2800), null);
  assert.ok(cache.get('https://c.example.com', 2800));
});

test('sanitizeLinkPayload and normalizeLinkPreviewType persist auto previewType and autoThumbnailUrl', () => {
  assert.equal(normalizeLinkPreviewType('auto'), 'auto');
  assert.equal(normalizeLinkPreviewType('unknown', 'chat'), 'chat');

  const sanitized = sanitizeLinkPayload(
    {
      id: 'sample-auto',
      title: 'Example Project',
      url: 'https://example.com',
      displayUrl: 'example.com',
      description: 'Project showcase card',
      pinned: true,
      category: 'project',
      previewType: 'auto',
      autoThumbnailUrl: 'https://example.com/og-cover.jpg',
      clicks: 0,
    },
    0,
    'owner-uid-123'
  );
  assert.equal(sanitized.previewType, 'auto');
  assert.equal(sanitized.autoThumbnailUrl, 'https://example.com/og-cover.jpg');
});

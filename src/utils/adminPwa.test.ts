import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isIosSafariBrowser,
  parseAdminInitialTabFromSearch,
} from './adminPwa';

test('parseAdminInitialTabFromSearch validates PWA shortcut tab query params', () => {
  assert.equal(parseAdminInitialTabFromSearch('?tab=links'), 'links');
  assert.equal(parseAdminInitialTabFromSearch('?tab=socials'), 'socials');
  assert.equal(parseAdminInitialTabFromSearch('?tab=MESSAGES'), 'messages');
  assert.equal(parseAdminInitialTabFromSearch('?tab=security'), 'security');
  assert.equal(parseAdminInitialTabFromSearch('?tab=invalid'), null);
  assert.equal(parseAdminInitialTabFromSearch(''), null);
});

test('isIosSafariBrowser distinguishes iOS Safari from Android Chrome', () => {
  assert.equal(
    isIosSafariBrowser(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
    ),
    true
  );
  assert.equal(
    isIosSafariBrowser(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
    ),
    false
  );
});

test('Admin PWA manifest, icons, scoped service worker, and admin.html are valid and aligned', () => {
  const rootDir = process.cwd();
  const manifestPath = path.join(rootDir, 'public', 'admin-manifest.webmanifest');
  const swPath = path.join(rootDir, 'public', 'sw.js');
  const adminHtmlPath = path.join(rootDir, 'admin.html');

  assert.equal(fs.existsSync(manifestPath), true);
  assert.equal(fs.existsSync(swPath), true);
  assert.equal(fs.existsSync(adminHtmlPath), true);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.equal(manifest.start_url, '/admin');
  assert.equal(manifest.scope, '/admin');
  assert.equal(manifest.display, 'standalone');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3);

  for (const icon of manifest.icons) {
    const iconFile = path.join(rootDir, 'public', icon.src.replace(/^\/+/, ''));
    assert.equal(fs.existsSync(iconFile), true, `missing icon ${icon.src}`);
  }

  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf-8');
  assert.match(adminHtml, /rel="manifest"\s+href="\/admin-manifest\.webmanifest"/);
  assert.match(adminHtml, /noindex/);
});

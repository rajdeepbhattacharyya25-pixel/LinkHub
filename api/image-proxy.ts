interface ServerlessReq {
  url?: string;
  query?: Record<string, string | string[] | undefined>;
}

interface ServerlessRes {
  status: (code: number) => ServerlessRes;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
  send: (body: Buffer | string) => void;
}

function isPrivateOrBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b, c, d] = ipv4Match.slice(1).map(Number);
    if ([a, b, c, d].some((oct) => Number.isNaN(oct) || oct < 0 || oct > 255)) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  if (
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('::ffff:127.') ||
    host.startsWith('::ffff:10.') ||
    host.startsWith('::ffff:192.168.')
  ) {
    return true;
  }

  if (!ipv4Match && !host.includes('.')) return true;
  return false;
}

function validatePreviewTargetUrl(
  rawUrl: string
): { valid: boolean; normalizedUrl?: string; reason?: string } {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return { valid: false, reason: 'URL is empty.' };
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return { valid: false, reason: 'Only http:// and https:// URLs are supported.' };
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Only HTTP/HTTPS URLs are allowed.' };
    }
    if (isPrivateOrBlockedHostname(parsed.hostname)) {
      return { valid: false, reason: 'Private or local network URLs are blocked.' };
    }
    parsed.hash = '';
    return { valid: true, normalizedUrl: parsed.toString() };
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }
}

function extractQueryParam(req: ServerlessReq, key: string): string {
  const fromQuery = req.query?.[key];
  if (Array.isArray(fromQuery)) return fromQuery[0] || '';
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
  if (req.url) {
    try {
      const parsed = new URL(req.url, 'https://localhost');
      return parsed.searchParams.get(key) || '';
    } catch {
      return '';
    }
  }
  return '';
}

export default async function handler(req: ServerlessReq, res: ServerlessRes) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const rawUrl = extractQueryParam(req, 'url');
  const check = validatePreviewTargetUrl(rawUrl);
  if (!check.valid || !check.normalizedUrl) {
    res.status(400).json({ error: check.reason || 'Invalid image URL.' });
    return;
  }

  try {
    const upstream = await fetch(check.normalizedUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkHubImageCropProxy/1.0)',
        Accept: 'image/*,*/*;q=0.5',
      },
    });

    const finalCheck = validatePreviewTargetUrl(upstream.url || check.normalizedUrl);
    if (!finalCheck.valid) {
      res.status(403).json({ error: 'Blocked redirect target.' });
      return;
    }

    if (!upstream.ok) {
      res.status(502).json({ error: `Image server returned ${upstream.status}` });
      return;
    }

    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      res.status(415).json({ error: 'Target URL did not return an image.' });
      return;
    }

    const maxBytes = 5 * 1024 * 1024;
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > maxBytes) {
      res.status(413).json({ error: 'Image exceeds 5 MB crop proxy limit.' });
      return;
    }

    res.setHeader('Content-Type', contentType.split(';')[0]);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(buf);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Unable to fetch remote image.',
    });
  }
}

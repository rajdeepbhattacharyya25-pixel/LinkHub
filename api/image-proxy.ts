import dns from 'node:dns/promises';

interface ServerlessReq {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
}

interface ServerlessRes {
  status: (code: number) => ServerlessRes;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
  send: (body: Buffer | string) => void;
  end: () => void;
}

const ALLOWED_RASTER_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

function isPrivateIpAddress(ip: string): boolean {
  const clean = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!clean) return true;

  // IPv4-mapped IPv6
  const v4Mapped = clean.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const target = v4Mapped ? v4Mapped[1] : clean;

  const ipv4Match = target.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b, c, d] = ipv4Match.slice(1).map(Number);
    if ([a, b, c, d].some((oct) => Number.isNaN(oct) || oct < 0 || oct > 255)) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast & reserved
    return false;
  }

  // IPv6 private / loopback / link-local / NAT64
  if (
    target === '::' ||
    target === '::1' ||
    target.startsWith('0:0:0:0:') ||
    target.startsWith('fc') ||
    target.startsWith('fd') ||
    /^fe[89ab][0-9a-f]:/.test(target) ||
    target.startsWith('64:ff9b:') ||
    target.startsWith('ff') ||
    target.includes('::ffff:')
  ) {
    return true;
  }

  return false;
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
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/.test(host)) return true;

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    if (ipv4Match.slice(1).some((part) => part.length > 1 && part.startsWith('0'))) return true;
    return isPrivateIpAddress(host);
  }
  if (host.includes(':')) return isPrivateIpAddress(host);
  if (!host.includes('.')) return true;
  return false;
}

function validatePreviewTargetUrl(
  rawUrl: string
): { valid: boolean; normalizedUrl?: string; hostname?: string; reason?: string } {
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
    if (parsed.username || parsed.password) {
      return { valid: false, reason: 'Credentials in URL are not allowed.' };
    }
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      return { valid: false, reason: 'Only standard HTTP/HTTPS ports are allowed.' };
    }
    if (isPrivateOrBlockedHostname(parsed.hostname)) {
      return { valid: false, reason: 'Private or local network URLs are blocked.' };
    }
    parsed.hash = '';
    return { valid: true, normalizedUrl: parsed.toString(), hostname: parsed.hostname };
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }
}

async function assertPublicDns(hostname: string): Promise<boolean> {
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!Array.isArray(records) || records.length === 0) return false;
    return records.every((rec) => !isPrivateIpAddress(rec.address));
  } catch {
    return false;
  }
}

function matchesRasterMagicBytes(buf: Buffer, mime: string): boolean {
  if (buf.byteLength < 12) return false;
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (mime === 'image/gif') {
    const hdr = buf.subarray(0, 6).toString('ascii');
    return hdr === 'GIF87a' || hdr === 'GIF89a';
  }
  if (mime === 'image/webp') {
    return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (mime === 'image/avif') {
    return buf.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  return false;
}

async function readBoundedBuffer(response: globalThis.Response, maxBytes: number): Promise<Buffer | null> {
  const declaredLen = Number(response.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
    return null;
  }
  if (!response.body) {
    const ab = await response.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > maxBytes) return null;
    return Buffer.from(ab);
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      total += value.byteLength;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return total > 0 ? Buffer.concat(chunks, total) : null;
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
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

  const rawUrl = extractQueryParam(req, 'url');
  const check = validatePreviewTargetUrl(rawUrl);
  if (!check.valid || !check.normalizedUrl || !check.hostname) {
    res.status(400).json({ error: check.reason || 'Invalid image URL.' });
    return;
  }

  try {
    let currentUrl = check.normalizedUrl;
    let currentHost = check.hostname;
    let upstream: globalThis.Response | null = null;

    // Manually follow up to 3 redirects, verifying DNS + SSRF rules BEFORE each hop
    for (let hop = 0; hop <= 3; hop++) {
      const dnsSafe = await assertPublicDns(currentHost);
      if (!dnsSafe) {
        res.status(403).json({ error: 'Blocked target host.' });
        return;
      }

      const attempt = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(6500),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LinkHubImageCropProxy/1.0)',
          Accept: 'image/webp,image/png,image/jpeg,image/avif,image/gif,*/*;q=0.1',
        },
      });

      if (attempt.status >= 300 && attempt.status < 400) {
        const location = attempt.headers.get('location');
        if (!location || hop === 3) {
          res.status(502).json({ error: 'Too many redirects.' });
          return;
        }
        const nextUrl = new URL(location, currentUrl).toString();
        const nextCheck = validatePreviewTargetUrl(nextUrl);
        if (!nextCheck.valid || !nextCheck.normalizedUrl || !nextCheck.hostname) {
          res.status(403).json({ error: 'Blocked redirect target.' });
          return;
        }
        currentUrl = nextCheck.normalizedUrl;
        currentHost = nextCheck.hostname;
        continue;
      }

      upstream = attempt;
      break;
    }

    if (!upstream || !upstream.ok) {
      res.status(502).json({ error: 'Unable to fetch remote image.' });
      return;
    }

    const mime = (upstream.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    if (!ALLOWED_RASTER_MIMES.has(mime)) {
      res.status(415).json({ error: 'Only raster images (JPEG, PNG, WebP, GIF, AVIF) are supported.' });
      return;
    }

    const maxBytes = 5 * 1024 * 1024;
    const buf = await readBoundedBuffer(upstream, maxBytes);
    if (!buf) {
      res.status(413).json({ error: 'Image is empty or exceeds 5 MB limit.' });
      return;
    }

    if (!matchesRasterMagicBytes(buf, mime)) {
      res.status(415).json({ error: 'Image payload does not match declared raster format.' });
      return;
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(buf.byteLength));
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (method === 'HEAD') {
      res.status(200).end();
      return;
    }
    res.send(buf);
  } catch {
    res.status(502).json({ error: 'Unable to fetch remote image.' });
  }
}

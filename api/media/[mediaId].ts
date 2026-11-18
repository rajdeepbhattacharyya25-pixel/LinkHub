import fs from 'node:fs';
import path from 'node:path';

interface ServerlessReq {
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}

interface ServerlessRes {
  status: (code: number) => ServerlessRes;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
  send: (body: Buffer | string) => void;
  end: () => void;
}

interface FirebaseConfigSubset {
  projectId?: string;
  apiKey?: string;
  firestoreDatabaseId?: string;
}

const ALLOWED_MEDIA_MIME_TYPES = new Set([
  'image/webp',
  'image/jpeg',
  'image/png',
]);

let cachedFirebaseCfg: FirebaseConfigSubset | null = null;

function resolveFirebaseConfig(): FirebaseConfigSubset {
  if (cachedFirebaseCfg) return cachedFirebaseCfg;

  let fileCfg: FirebaseConfigSubset = {};
  try {
    const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      fileCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as FirebaseConfigSubset;
    }
  } catch {
    // Fall back to environment variables
  }

  cachedFirebaseCfg = {
    projectId: (process.env.VITE_FIREBASE_PROJECT_ID || fileCfg.projectId || '').trim(),
    apiKey: (process.env.VITE_FIREBASE_API_KEY || fileCfg.apiKey || '').trim(),
    firestoreDatabaseId: (
      process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      fileCfg.firestoreDatabaseId ||
      '(default)'
    ).trim(),
  };
  return cachedFirebaseCfg;
}

function extractMediaId(req: ServerlessReq): string {
  const rawParam = req.query?.mediaId;
  const fromQuery = (Array.isArray(rawParam) ? rawParam[0] || '' : rawParam || '').trim();
  if (fromQuery && fromQuery !== '[mediaId]') return fromQuery;

  if (req.url) {
    try {
      const parsed = new URL(req.url, 'https://localhost');
      const fromSearch = (parsed.searchParams.get('mediaId') || '').trim();
      if (fromSearch && fromSearch !== '[mediaId]') return fromSearch;
      const parts = parsed.pathname.split('/').filter(Boolean);
      const last = (parts[parts.length - 1] || '').trim();
      if (last && last !== '[mediaId]') return last;
    } catch {
      return '';
    }
  }
  return '';
}

export default async function handler(req: ServerlessReq, res: ServerlessRes) {
  const rawId = extractMediaId(req);

  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(rawId)) {
    res.status(400).json({ error: 'Invalid media ID.' });
    return;
  }

  const { projectId, firestoreDatabaseId, apiKey } = resolveFirebaseConfig();
  if (!projectId || !apiKey) {
    res.status(503).json({ error: 'Cloud media store not configured.' });
    return;
  }

  const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(firestoreDatabaseId || '(default)')}/documents/publicMedia/${encodeURIComponent(
    rawId
  )}?key=${encodeURIComponent(apiKey)}`;

  try {
    const upstream = await fetch(docUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (upstream.status === 404) {
      res.status(404).json({ error: 'Media not found.' });
      return;
    }
    if (!upstream.ok) {
      res.status(502).json({ error: `Media store returned ${upstream.status}` });
      return;
    }

    const rawDoc = (await upstream.json()) as {
      fields?: Record<string, { stringValue?: string }>;
    };
    const mimeType = String(rawDoc?.fields?.mimeType?.stringValue || '')
      .trim()
      .toLowerCase();
    const dataBase64 = String(rawDoc?.fields?.dataBase64?.stringValue || '').trim();

    if (!ALLOWED_MEDIA_MIME_TYPES.has(mimeType) || !dataBase64) {
      res.status(404).json({ error: 'Invalid media record.' });
      return;
    }

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.byteLength === 0 || buffer.byteLength > 700_000) {
      res.status(404).json({ error: 'Corrupt or oversized media payload.' });
      return;
    }

    const etag = `"pm-${rawId}-${buffer.byteLength}"`;
    if (req.headers?.['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(buffer);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Unable to read cloud media.',
    });
  }
}

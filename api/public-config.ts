interface ServerlessReq {
  url?: string;
  query?: Record<string, string | string[] | undefined>;
}

interface ServerlessRes {
  status: (code: number) => ServerlessRes;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
}

function extractMode(req: ServerlessReq): string {
  const fromQuery = req.query?.mode;
  const val = Array.isArray(fromQuery) ? fromQuery[0] || '' : fromQuery || '';
  if (val) return val.trim().toLowerCase();
  if (req.url) {
    try {
      const parsed = new URL(req.url, 'https://localhost');
      return (parsed.searchParams.get('mode') || '').trim().toLowerCase();
    } catch {
      return '';
    }
  }
  return '';
}

export default function handler(req: ServerlessReq, res: ServerlessRes) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const mode = extractMode(req);
  if (mode === 'health' || (req.url && req.url.startsWith('/api/health'))) {
    res.status(200).json({ ok: true, runtime: 'vercel' });
    return;
  }

  const mapsApiKey = (
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ''
  ).trim();

  res.status(200).json({ mapsApiKey });
}

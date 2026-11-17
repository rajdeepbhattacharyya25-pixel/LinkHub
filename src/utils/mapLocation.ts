export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface ParsedGoogleMapsUrlResult {
  lat?: number;
  lng?: number;
  zoom?: number;
  placeName?: string;
  canonicalUrl: string;
}

export interface ProfileMapLocationInput {
  location?: string | null;
  mapLabel?: string | null;
  coordinates?: string | null;
  googleMapsUrl?: string | null;
  mapLat?: number | null;
  mapLng?: number | null;
  mapZoom?: number | null;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function roundCoord(value: number, precision = 6): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

/**
 * Parses either decimal coordinates ("22.5726, 88.3639" or "-33.8688, 151.2093")
 * or directional coordinates ("22.5726° N, 88.3639° E" or "37.7749 N, 122.4194 W").
 */
export function parseCoordinatesInput(raw: string | undefined | null): LatLngPoint | null {
  const clean = String(raw || '').trim();
  if (!clean) return null;

  // Match two numeric values with optional degree symbol and N/S/E/W hemisphere markers
  const match = clean.match(
    /^([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,;\s]+\s*([+-]?\d+(?:\.\d+)?)\s*°?\s*([EWew])?$/
  );
  if (!match) return null;

  let lat = Number(match[1]);
  const latDir = match[2]?.toUpperCase();
  let lng = Number(match[3]);
  const lngDir = match[4]?.toUpperCase();

  if (latDir === 'S') lat = -Math.abs(lat);
  if (latDir === 'N') lat = Math.abs(lat);
  if (lngDir === 'W') lng = -Math.abs(lng);
  if (lngDir === 'E') lng = Math.abs(lng);

  if (!isValidLatLng(lat, lng)) return null;
  return { lat: roundCoord(lat, 6), lng: roundCoord(lng, 6) };
}

export function formatCoordinatesLabel(lat: number, lng: number): string {
  if (!isValidLatLng(lat, lng)) return '';
  const latHem = lat >= 0 ? 'N' : 'S';
  const lngHem = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latHem}, ${Math.abs(lng).toFixed(4)}° ${lngHem}`;
}

export function sanitizeExternalMapUrl(rawUrl: string | undefined | null): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  const withProto = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)
    ? `https://${trimmed}`
    : '';
  if (!withProto) return '';
  try {
    const parsed = new URL(withProto);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    return parsed.toString().slice(0, 1200);
  } catch {
    return '';
  }
}

/**
 * Parses standard Google Maps links to extract coordinates, zoom, and place names:
 * - https://www.google.com/maps/place/San+Francisco/@37.7749,-122.4194,12z
 * - https://www.google.com/maps/@22.5726,88.3639,14z
 * - https://maps.google.com/?q=22.5726,88.3639
 * - https://www.google.com/maps/search/?api=1&query=22.5726,88.3639
 * - Place data params containing !3d<lat>!4d<lng>
 */
export function parseGoogleMapsUrl(
  rawUrl: string | undefined | null
): ParsedGoogleMapsUrlResult | null {
  const canonicalUrl = sanitizeExternalMapUrl(rawUrl);
  if (!canonicalUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(canonicalUrl);
  } catch {
    return null;
  }

  let lat: number | undefined;
  let lng: number | undefined;
  let zoom: number | undefined;
  let placeName: string | undefined;

  // 1. Check !3d<lat>!4d<lng> (most precise pin coordinate in Google Maps URLs)
  const dataPinMatch = canonicalUrl.match(/!3d([+-]?\d+(?:\.\d+)?)!4d([+-]?\d+(?:\.\d+)?)/);
  if (dataPinMatch) {
    const dLat = Number(dataPinMatch[1]);
    const dLng = Number(dataPinMatch[2]);
    if (isValidLatLng(dLat, dLng)) {
      lat = roundCoord(dLat, 6);
      lng = roundCoord(dLng, 6);
    }
  }

  // 2. Check /@lat,lng[,zoomz] in path or hash
  const atMatch = canonicalUrl.match(
    /@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/
  );
  if (atMatch) {
    const aLat = Number(atMatch[1]);
    const aLng = Number(atMatch[2]);
    if (lat === undefined && lng === undefined && isValidLatLng(aLat, aLng)) {
      lat = roundCoord(aLat, 6);
      lng = roundCoord(aLng, 6);
    }
    if (atMatch[3]) {
      const z = Math.round(Number(atMatch[3]));
      if (Number.isFinite(z) && z >= 1 && z <= 21) {
        zoom = z;
      }
    }
  }

  // 3. Extract /place/<Place+Name>/ from path
  const placePathMatch = parsed.pathname.match(/\/maps\/place\/([^/]+)/i);
  if (placePathMatch && placePathMatch[1]) {
    try {
      const decoded = decodeURIComponent(placePathMatch[1].replace(/\+/g, ' ')).trim();
      if (decoded && !parseCoordinatesInput(decoded)) {
        placeName = decoded;
      }
    } catch {
      // ignore malformed URI sequence
    }
  }

  // 4. Check ?q=, ?query=, ?ll=, ?center=
  const queryCandidates = [
    parsed.searchParams.get('q'),
    parsed.searchParams.get('query'),
    parsed.searchParams.get('ll'),
    parsed.searchParams.get('center'),
  ];
  for (const candidate of queryCandidates) {
    if (!candidate) continue;
    const coords = parseCoordinatesInput(candidate);
    if (coords) {
      if (lat === undefined && lng === undefined) {
        lat = coords.lat;
        lng = coords.lng;
      }
    } else if (!placeName && candidate.trim()) {
      placeName = candidate.trim();
    }
  }

  return {
    ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
    ...(zoom !== undefined ? { zoom } : {}),
    ...(placeName ? { placeName } : {}),
    canonicalUrl,
  };
}

export function resolveProfileCoordinates(
  profile: ProfileMapLocationInput
): LatLngPoint | null {
  if (isValidLatLng(profile.mapLat, profile.mapLng)) {
    return {
      lat: roundCoord(Number(profile.mapLat), 6),
      lng: roundCoord(Number(profile.mapLng), 6),
    };
  }
  const fromCoords = parseCoordinatesInput(profile.coordinates);
  if (fromCoords) return fromCoords;

  const fromUrl = parseGoogleMapsUrl(profile.googleMapsUrl);
  if (fromUrl && isValidLatLng(fromUrl.lat, fromUrl.lng)) {
    return { lat: fromUrl.lat!, lng: fromUrl.lng! };
  }
  return null;
}

export function buildGoogleMapsExternalUrl(profile: ProfileMapLocationInput): string {
  const customUrl = sanitizeExternalMapUrl(profile.googleMapsUrl);
  if (customUrl) return customUrl;

  const coords = resolveProfileCoordinates(profile);
  if (coords) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${coords.lat},${coords.lng}`
    )}`;
  }

  const label = (profile.location || profile.mapLabel || '').trim();
  if (label) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
  }

  return '';
}

export function buildOpenStreetMapExternalUrl(profile: ProfileMapLocationInput): string {
  const coords = resolveProfileCoordinates(profile);
  if (coords) {
    const z =
      typeof profile.mapZoom === 'number' && profile.mapZoom >= 2 && profile.mapZoom <= 19
        ? Math.round(profile.mapZoom)
        : 13;
    return `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=${z}/${coords.lat}/${coords.lng}`;
  }

  const label = (profile.location || profile.mapLabel || '').trim();
  if (label) {
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(label)}`;
  }

  return '';
}

export function hasAnyMapLocationData(profile: ProfileMapLocationInput): boolean {
  return Boolean(
    (profile.location || '').trim() ||
      (profile.mapLabel || '').trim() ||
      (profile.coordinates || '').trim() ||
      sanitizeExternalMapUrl(profile.googleMapsUrl) ||
      resolveProfileCoordinates(profile) !== null
  );
}

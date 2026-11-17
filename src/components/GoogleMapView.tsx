import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import {
  formatCoordinatesLabel,
  isValidLatLng,
  roundCoord,
  type LatLngPoint,
} from '../utils/mapLocation';

const DEMO_MAP_ID = 'DEMO_MAP_ID';
const ATTR_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

function isQuotaErrorLike(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === 'object' && err !== null
      ? JSON.stringify(err)
      : String(err || '');
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('OverQuotaMapError') ||
    msg.includes('QuotaExceededError') ||
    /\b429\b/.test(msg)
  );
}

let cachedRuntimeMapsKey: string | null = null;
let runtimeMapsKeyPromise: Promise<string> | null = null;

export function getStaticEnvMapsApiKey(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return (env?.VITE_GOOGLE_MAPS_API_KEY || '').trim();
}

export function useResolvedMapsApiKey(): {
  apiKey: string;
  resolving: boolean;
} {
  const staticKey = getStaticEnvMapsApiKey();
  const [apiKey, setApiKey] = useState<string>(() => staticKey || cachedRuntimeMapsKey || '');
  const [resolving, setResolving] = useState<boolean>(
    () => !staticKey && cachedRuntimeMapsKey === null
  );

  useEffect(() => {
    if (staticKey) {
      cachedRuntimeMapsKey = staticKey;
      setApiKey(staticKey);
      setResolving(false);
      return;
    }
    if (cachedRuntimeMapsKey !== null) {
      setApiKey(cachedRuntimeMapsKey);
      setResolving(false);
      return;
    }

    let cancelled = false;
    if (!runtimeMapsKeyPromise) {
      runtimeMapsKeyPromise = fetch('/api/public-config', {
        headers: { Accept: 'application/json' },
      })
        .then(async (res) => {
          if (!res.ok) return '';
          const data = (await res.json()) as { mapsApiKey?: string };
          return typeof data?.mapsApiKey === 'string' ? data.mapsApiKey.trim() : '';
        })
        .catch(() => '');
    }

    runtimeMapsKeyPromise.then((resolved) => {
      cachedRuntimeMapsKey = resolved;
      if (!cancelled) {
        setApiKey(resolved);
        setResolving(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [staticKey]);

  return { apiKey, resolving };
}

export interface ModernPlacePrediction {
  placeId?: string;
  text: { text: string };
  mainText?: { text: string };
  toPlace: () => {
    id?: string;
    displayName?: string | null;
    formattedAddress?: string | null;
    googleMapsURI?: string | null;
    location?: { lat: () => number; lng: () => number } | null;
    viewport?: unknown;
    fetchFields: (opts: { fields: string[] }) => Promise<unknown>;
  };
}

export interface ModernAutocompleteSuggestion {
  placePrediction?: ModernPlacePrediction | null;
}

interface AutocompleteSuggestionsResult {
  suggestions: ModernAutocompleteSuggestion[];
  isLoading: boolean;
  errorText: string | null;
  resetSession: () => void;
}

/**
 * Places API (New) Autocomplete hook using AutocompleteSuggestion + AutocompleteSessionToken.
 */
function useModernPlaceSuggestions(
  inputString: string,
  enabled: boolean
): AutocompleteSuggestionsResult {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<unknown>(null);
  const [suggestions, setSuggestions] = useState<ModernAutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!placesLib || !enabled) return;

    const trimmed = inputString.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      setErrorText(null);
      return;
    }

    const libAny = placesLib as unknown as {
      AutocompleteSessionToken?: new () => unknown;
      AutocompleteSuggestion?: {
        fetchAutocompleteSuggestions?: (req: {
          input: string;
          sessionToken?: unknown;
        }) => Promise<{ suggestions?: ModernAutocompleteSuggestion[] }>;
      };
    };
    const { AutocompleteSessionToken, AutocompleteSuggestion } = libAny;
    if (!AutocompleteSuggestion?.fetchAutocompleteSuggestions || !AutocompleteSessionToken) {
      return;
    }

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setErrorText(null);
      AutocompleteSuggestion.fetchAutocompleteSuggestions!({
        input: trimmed,
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((res: { suggestions?: ModernAutocompleteSuggestion[] }) => {
          if (cancelled) return;
          setSuggestions(Array.isArray(res?.suggestions) ? res.suggestions : []);
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setIsLoading(false);
          setSuggestions([]);
          if (isQuotaErrorLike(err)) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            setErrorText('Google Maps quota reached while searching places.');
          } else {
            setErrorText('Place search unavailable right now. You can click the map or paste a Google Maps link.');
          }
        });
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, inputString, enabled]);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSuggestions([]);
    setErrorText(null);
  }, []);

  return { suggestions, isLoading, errorText, resetSession };
}

function MapViewportSync({
  coords,
  zoom,
}: {
  coords: LatLngPoint | null;
  zoom: number;
}) {
  const map = useMap();
  const lastSyncRef = useRef<string>('');

  useEffect(() => {
    if (!map || !coords) return;
    const sig = `${coords.lat.toFixed(6)},${coords.lng.toFixed(6)},${zoom}`;
    if (lastSyncRef.current === sig) return;
    lastSyncRef.current = sig;
    map.panTo(coords);
    if (typeof zoom === 'number' && Number.isFinite(zoom)) {
      map.setZoom(zoom);
    }
  }, [map, coords, zoom]);

  return null;
}

export interface PlaceSelectionPayload {
  lat: number;
  lng: number;
  placeName: string;
  formattedAddress: string;
  placeId: string;
  googleMapsUrl: string;
  zoom?: number;
}

interface AdminMapInnerProps {
  coords: LatLngPoint | null;
  zoom: number;
  pinLabel: string;
  onSelectFromMapClick: (lat: number, lng: number, zoom: number) => void;
  onSelectPlace: (payload: PlaceSelectionPayload) => void;
}

const AdminMapPickerInner: React.FC<AdminMapInnerProps> = ({
  coords,
  zoom,
  pinLabel,
  onSelectFromMapClick,
  onSelectPlace,
}) => {
  const apiStatus = useApiLoadingStatus();
  const placesLib = useMapsLibrary('places');
  const map = useMap();

  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [placePickError, setPlacePickError] = useState<string | null>(null);

  const searchReady =
    apiStatus === APILoadingStatus.LOADED && Boolean(placesLib);
  const { suggestions, isLoading, errorText, resetSession } =
    useModernPlaceSuggestions(query, searchReady);

  useEffect(() => {
    if (
      apiStatus === APILoadingStatus.AUTH_FAILURE ||
      apiStatus === APILoadingStatus.FAILED
    ) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [apiStatus]);

  const handleChooseSuggestion = async (
    suggestion: ModernAutocompleteSuggestion
  ) => {
    if (!suggestion.placePrediction) return;
    setResolvingPlace(true);
    setPlacePickError(null);
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: [
          'displayName',
          'formattedAddress',
          'location',
          'viewport',
          'id',
          'googleMapsURI',
        ],
      });

      const loc = place.location;
      if (!loc) {
        setPlacePickError('Selected place did not return geographic coordinates.');
        return;
      }

      const lat = roundCoord(loc.lat(), 6);
      const lng = roundCoord(loc.lng(), 6);

      if (map) {
        if (place.viewport) {
          map.fitBounds(place.viewport as Parameters<typeof map.fitBounds>[0]);
        } else {
          map.panTo({ lat, lng });
          map.setZoom(13);
        }
      }

      const displayName =
        (place.displayName || '').trim() ||
        suggestion.placePrediction.mainText?.text ||
        suggestion.placePrediction.text.text;
      const formattedAddress = (place.formattedAddress || displayName || '').trim();
      const mapsUrl =
        (place.googleMapsURI || '').trim() ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${lat},${lng}`
        )}${place.id ? `&query_place_id=${encodeURIComponent(place.id)}` : ''}`;

      onSelectPlace({
        lat,
        lng,
        placeName: displayName,
        formattedAddress,
        placeId: place.id || '',
        googleMapsUrl: mapsUrl,
        zoom: 13,
      });

      setQuery(displayName);
      setDropdownOpen(false);
      resetSession();
    } catch (err) {
      if (isQuotaErrorLike(err)) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      setPlacePickError(
        'Could not fetch details for that place. Try pasting its Google Maps link or clicking the map.'
      );
    } finally {
      setResolvingPlace(false);
    }
  };

  const defaultCenter: LatLngPoint = coords || { lat: 20, lng: 0 };
  const defaultZoom = coords ? zoom : 2;

  return (
    <div className="space-y-2.5">
      {/* Place Search Input (Places API New) */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-[#6B4A2E] absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            placeholder="Search city, studio, landmark, or address on Google Maps..."
            aria-label="Search place on Google Maps"
            className="w-full min-h-[38px] pl-8 pr-8 py-1.5 rounded-lg sm:rounded-xl bg-[#F4EDE2] border border-[#B89B7E] text-[12.5px] sm:text-xs font-medium text-[#1A120E]"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                resetSession();
                setDropdownOpen(false);
              }}
              aria-label="Clear place search"
              className="absolute right-2.5 p-1 rounded-md text-[#6B4A2E] hover:text-[#1A120E] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {dropdownOpen && (suggestions.length > 0 || isLoading || resolvingPlace) && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl bg-[#FAF6F0] border border-[#B89B7E] shadow-lg overflow-hidden max-h-56 overflow-y-auto">
            {(isLoading || resolvingPlace) && suggestions.length === 0 && (
              <div className="px-3 py-2.5 flex items-center gap-2 text-xs text-[#3A2418]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6B4A2E]" />
                <span>Searching Google Maps places...</span>
              </div>
            )}
            <ul role="listbox" aria-label="Google Maps place suggestions" className="divide-y divide-[#D5C4AE]">
              {suggestions.map((suggestion, index) => {
                const labelText =
                  suggestion.placePrediction?.text?.text || 'Place result';
                return (
                  <li key={suggestion.placePrediction?.placeId || index}>
                    <button
                      type="button"
                      onClick={() => void handleChooseSuggestion(suggestion)}
                      className="w-full text-left px-3 py-2.5 hover:bg-[#EAE0D3] transition-colors flex items-start gap-2 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5 text-[#6B4A2E] shrink-0 mt-0.5" />
                      <span className="text-xs font-medium text-[#1A120E]">
                        {labelText}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {(errorText || placePickError) && (
        <p className="text-[11px] font-medium text-[#9A2E2E]">
          {placePickError || errorText}
        </p>
      )}

      {/* Interactive Click-to-Pin Google Map */}
      {apiStatus === APILoadingStatus.AUTH_FAILURE ||
      apiStatus === APILoadingStatus.FAILED ? (
        <div className="h-[220px] rounded-xl border border-[#B89B7E] bg-[#F4EDE2] flex flex-col items-center justify-center p-4 text-center space-y-1.5">
          <MapPin className="w-5 h-5 text-[#6B4A2E]" />
          <p className="text-xs font-bold text-[#1A120E]">
            Interactive Google Map temporarily unavailable
          </p>
          <p className="text-[11px] text-[#3A2418] max-w-sm">
            You can still paste any Google Maps URL or enter coordinates and place labels below — your live card will link directly to Google Maps.
          </p>
        </div>
      ) : (
        <div className="relative h-[240px] sm:h-[260px] w-full rounded-xl overflow-hidden border border-[#B89B7E] bg-[#EAE0D3]">
          <GoogleMap
            mapId={DEMO_MAP_ID}
            defaultCenter={defaultCenter}
            defaultZoom={defaultZoom}
            gestureHandling="greedy"
            disableDefaultUI={false}
            mapTypeControl={false}
            streetViewControl={false}
            internalUsageAttributionIds={ATTR_IDS}
            onClick={(ev) => {
              const ll = ev.detail.latLng;
              if (!ll) return;
              const currentZoom =
                typeof map?.getZoom() === 'number'
                  ? Math.max(4, Math.round(map.getZoom() || 13))
                  : coords
                  ? zoom
                  : 12;
              onSelectFromMapClick(
                roundCoord(ll.lat, 6),
                roundCoord(ll.lng, 6),
                currentZoom
              );
            }}
            style={{ width: '100%', height: '100%' }}
          >
            <MapViewportSync coords={coords} zoom={coords ? zoom : 2} />
            {coords && (
              <AdvancedMarker
                position={coords}
                title={pinLabel || formatCoordinatesLabel(coords.lat, coords.lng)}
              >
                <Pin
                  background="#3A2418"
                  borderColor="#FAF6F0"
                  glyphColor="#E5B887"
                />
              </AdvancedMarker>
            )}
          </GoogleMap>

          <div className="pointer-events-none absolute bottom-2 left-2 z-10 px-2.5 py-1 rounded-lg bg-[#1A120E]/80 text-[#FAF6F0] text-[10.5px] font-ibm-mono backdrop-blur-xs">
            {coords
              ? `Pinned: ${formatCoordinatesLabel(coords.lat, coords.lng)} · Click map to move pin`
              : 'Click anywhere on Google Maps or search above to pin your location'}
          </div>
        </div>
      )}
    </div>
  );
};

export interface AdminGoogleMapPickerProps {
  coords: LatLngPoint | null;
  zoom: number;
  pinLabel: string;
  gmpQuotaExceeded?: boolean;
  onSelectFromMapClick: (lat: number, lng: number, zoom: number) => void;
  onSelectPlace: (payload: PlaceSelectionPayload) => void;
}

export const AdminGoogleMapPicker: React.FC<AdminGoogleMapPickerProps> = ({
  coords,
  zoom,
  pinLabel,
  gmpQuotaExceeded = false,
  onSelectFromMapClick,
  onSelectPlace,
}) => {
  const { apiKey, resolving } = useResolvedMapsApiKey();

  if (resolving) {
    return (
      <div className="h-[220px] rounded-xl border border-[#B89B7E] bg-[#F4EDE2] flex items-center justify-center gap-2 text-xs font-medium text-[#3A2418]">
        <Loader2 className="w-4 h-4 animate-spin text-[#6B4A2E]" />
        <span>Loading Google Maps Studio...</span>
      </div>
    );
  }

  if (!apiKey || gmpQuotaExceeded) {
    return (
      <div className="h-[190px] rounded-xl border border-dashed border-[#B89B7E] bg-[#F4EDE2] flex flex-col items-center justify-center p-4 text-center space-y-1.5">
        <MapPin className="w-5 h-5 text-[#6B4A2E]" />
        <p className="text-xs font-bold text-[#1A120E]">
          {gmpQuotaExceeded
            ? 'Google Maps interactive preview paused (quota reached)'
            : 'Google Maps Link & Coordinates Mode'}
        </p>
        <p className="text-[11px] text-[#3A2418] max-w-md">
          {gmpQuotaExceeded
            ? 'You can still paste any Google Maps share link or enter coordinates manually below.'
            : 'Paste a Google Maps link, click Use GPS, or enter your city and coordinates below to showcase your location on the live card.'}
        </p>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      language="en"
      region="US"
      libraries={['places', 'marker']}
    >
      <AdminMapPickerInner
        coords={coords}
        zoom={zoom}
        pinLabel={pinLabel}
        onSelectFromMapClick={onSelectFromMapClick}
        onSelectPlace={onSelectPlace}
      />
    </APIProvider>
  );
};

interface PublicMapInnerProps {
  coords: LatLngPoint;
  zoom: number;
  title: string;
  overlayLabel: string;
  subtitle: string;
  onFallbackToStatic: () => void;
}

const PublicGoogleMapInner: React.FC<PublicMapInnerProps> = ({
  coords,
  zoom,
  title,
  overlayLabel,
  subtitle,
  onFallbackToStatic,
}) => {
  const apiStatus = useApiLoadingStatus();
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (
      apiStatus === APILoadingStatus.AUTH_FAILURE ||
      apiStatus === APILoadingStatus.FAILED
    ) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      onFallbackToStatic();
    }
  }, [apiStatus, onFallbackToStatic]);

  return (
    <div className="relative h-56 sm:h-60 w-full bg-[#0B0C10] overflow-hidden">
      <GoogleMap
        mapId={DEMO_MAP_ID}
        defaultCenter={coords}
        defaultZoom={zoom}
        colorScheme="DARK"
        gestureHandling="cooperative"
        disableDefaultUI={true}
        zoomControl={true}
        internalUsageAttributionIds={ATTR_IDS}
        style={{ width: '100%', height: '100%' }}
      >
        <MapViewportSync coords={coords} zoom={zoom} />
        <AdvancedMarker
          ref={markerRef}
          position={coords}
          title={title || 'Location'}
          onClick={() => setInfoOpen((prev) => !prev)}
        >
          <Pin
            background="#1E293B"
            borderColor="#E2E8F0"
            glyphColor="#38BDF8"
          />
        </AdvancedMarker>
        {infoOpen && marker && (
          <InfoWindow anchor={marker} onCloseClick={() => setInfoOpen(false)}>
            <div className="px-1 py-0.5 text-[#1A120E]">
              <p className="text-xs font-bold">{title || 'Pinned Location'}</p>
              {subtitle && (
                <p className="text-[11px] font-mono text-[#3A2418]">{subtitle}</p>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {overlayLabel && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center z-10 px-4"
        >
          <span className="text-base sm:text-lg font-bold tracking-[0.16em] uppercase text-[#E2E8F0]/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] text-center select-none">
            {overlayLabel}
          </span>
        </div>
      )}
    </div>
  );
};

export interface PublicGoogleMapShowcaseProps {
  coords: LatLngPoint | null;
  zoom?: number;
  title: string;
  overlayLabel?: string;
  subtitle?: string;
  gmpQuotaExceeded?: boolean;
  fallbackGraphic: React.ReactNode;
}

export const PublicGoogleMapShowcase: React.FC<PublicGoogleMapShowcaseProps> = ({
  title,
  overlayLabel = '',
  fallbackGraphic,
}) => {
  if (fallbackGraphic) {
    return <>{fallbackGraphic}</>;
  }
  return (
    <PageoDarkMapSvg
      displayMapLabel={overlayLabel || title}
      locationLabel={title}
    />
  );
};

interface MapMicroLabel {
  x: number;
  y: number;
  text: string;
}

function getMicroLabelsForLocation(
  displayMapLabel: string,
  locationLabel?: string
): MapMicroLabel[] {
  const combined = `${displayMapLabel} ${locationLabel || ''}`.toUpperCase();

  if (combined.includes('KOLKATA') || combined.includes('CALCUTTA')) {
    return [
      { x: 12, y: 42, text: 'DUM DUM' },
      { x: 126, y: 26, text: 'SHYAMBAZAR' },
      { x: 214, y: 30, text: 'ULTADANGA' },
      { x: 404, y: 48, text: 'SALT LAKE' },
      { x: 135, y: 66, text: 'GIRISH PARK' },
      { x: 216, y: 65, text: 'MANIKTALA' },
      { x: 292, y: 68, text: 'KANKURGACHI' },
      { x: 382, y: 74, text: 'SECTOR V' },
      { x: 562, y: 80, text: 'NEW TOWN' },
      { x: 36, y: 98, text: 'HOWRAH' },
      { x: 268, y: 95, text: 'SEALDAH' },
      { x: 350, y: 102, text: 'BELIAGHATA' },
      { x: 432, y: 94, text: 'EM BYPASS' },
      { x: 180, y: 112, text: 'ESPLANADE' },
      { x: 74, y: 138, text: 'MAIDAN' },
      { x: 214, y: 152, text: 'PARK STREET' },
      { x: 334, y: 142, text: 'ENTALLY' },
      { x: 386, y: 140, text: 'TANGRA' },
      { x: 446, y: 164, text: 'SCIENCE CITY' },
      { x: 92, y: 192, text: 'ALIPORE' },
      { x: 250, y: 184, text: 'BHOWANIPORE' },
      { x: 296, y: 212, text: 'BALLYGUNGE' },
      { x: 356, y: 204, text: 'GARIAHAT' },
      { x: 220, y: 238, text: 'CHETLA' },
      { x: 384, y: 235, text: 'KASBA' },
      { x: 315, y: 256, text: 'TOLLYGUNGE' },
    ];
  }

  return [
    { x: 4, y: 42, text: 'SECTOR 104' },
    { x: 126, y: 26, text: 'SECTOR 3A' },
    { x: 214, y: 30, text: 'SECTOR 5' },
    { x: 404, y: 48, text: 'SECTOR 17' },
    { x: 135, y: 66, text: 'SECTOR 4' },
    { x: 216, y: 65, text: 'SECTOR 6' },
    { x: 295, y: 69, text: 'SECTOR 13' },
    { x: 344, y: 74, text: 'SECTOR 14' },
    { x: 568, y: 80, text: 'IFFCO' },
    { x: 14, y: 98, text: 'SECTOR 9A' },
    { x: 268, y: 95, text: 'SECTOR 12A' },
    { x: 350, y: 102, text: 'SECTOR 16' },
    { x: 432, y: 94, text: 'SECTOR 29' },
    { x: 180, y: 112, text: 'NEW COLONY' },
    { x: 74, y: 138, text: 'SECTOR 9' },
    { x: 214, y: 152, text: 'SECTOR 8' },
    { x: 334, y: 142, text: 'SECTOR 15-II' },
    { x: 386, y: 140, text: 'SECTOR 30' },
    { x: 446, y: 164, text: 'SECTOR 41' },
    { x: 92, y: 192, text: 'SECTOR 10' },
    { x: 250, y: 184, text: 'SECTOR 11A' },
    { x: 296, y: 212, text: 'SECTOR 15-I' },
    { x: 356, y: 204, text: 'SECTOR 31' },
    { x: 220, y: 238, text: 'OM NAGAR' },
    { x: 384, y: 235, text: 'SECTOR 40' },
    { x: 315, y: 256, text: 'SECTOR 32' },
  ];
}

export const PageoDarkMapSvg: React.FC<{
  displayMapLabel: string;
  locationLabel?: string;
}> = ({ displayMapLabel, locationLabel }) => {
  const cleanLabel = (displayMapLabel || locationLabel || 'LOCATION')
    .trim()
    .toUpperCase();
  const microLabels = getMicroLabelsForLocation(cleanLabel, locationLabel);

  return (
    <div className="relative h-56 sm:h-64 w-full bg-[#050608] overflow-hidden select-none">
      <svg
        viewBox="0 0 600 260"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full block"
        aria-label={`Dark street map of ${locationLabel || cleanLabel}`}
      >
        {/* Pitch-black obsidian base & subtle urban block geometry */}
        <rect width="600" height="260" fill="#050608" />
        <polygon points="0,0 175,0 142,84 0,98" fill="#07090D" />
        <polygon points="180,0 375,0 322,94 148,86" fill="#06080C" />
        <polygon points="382,0 600,0 600,115 335,102" fill="#080A0F" />
        <polygon points="0,104 142,90 222,168 0,214" fill="#07090E" />
        <polygon points="228,172 348,108 518,168 442,260 192,260" fill="#080A10" />

        {/* Fine secondary neighborhood street grid */}
        <g stroke="#181D2A" strokeWidth="1.2" fill="none" strokeLinecap="round">
          <path d="M92,0 L124,78 L168,155 L210,260" />
          <path d="M148,0 L118,62 L88,136 L112,260" />
          <path d="M235,0 L212,72 L248,142 L222,260" />
          <path d="M292,0 L278,86 L312,168 L285,260" />
          <path d="M442,0 L412,88 L468,176 L435,260" />
          <path d="M518,0 L492,94 L542,188 L512,260" />
          <path d="M0,44 L132,32 L268,54 L412,38 L600,56" />
          <path d="M0,88 L118,74 L248,96 L396,82 L600,98" />
          <path d="M0,162 L145,148 L286,164 L442,150 L600,168" />
          <path d="M0,212 L162,196 L318,214 L468,198 L600,218" />
          <path d="M58,28 L138,18 L156,64 L78,76 Z" />
          <path d="M276,42 L348,48 L336,92 L264,84 Z" />
          <path d="M358,118 L434,104 L452,154 L372,168 Z" />
          <path d="M112,158 L194,146 L212,198 L124,208 Z" />
        </g>

        {/* Medium collector avenues (slate-indigo tint matching Pageo reference) */}
        <g stroke="#242B3D" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M0,108 L142,84 L265,126 L388,74 L542,42 L600,24" />
          <path d="M168,0 L218,112 L278,196 L305,260" />
          <path d="M0,148 L128,136 L252,142 L374,116 L496,138 L600,118" />
          <path d="M42,260 L146,184 L242,126 L368,28 L395,0" />
          <path d="M242,126 L332,178 L458,212 L565,260" />
          <path d="M465,0 L432,78 L368,154 L418,260" />
          <path d="M0,235 L95,215 L196,242 L310,236 L425,260" />
        </g>

        {/* Primary diagonal expressway & highway interchange loops */}
        <g stroke="#2F3850" strokeWidth="4.2" fill="none" strokeLinecap="round">
          <path d="M588,28 C492,88 412,148 302,260" />
          <path d="M198,258 C232,232 276,244 316,258" />
        </g>
        <g stroke="#111520" strokeWidth="1.5" fill="none" strokeLinecap="round">
          <path d="M588,28 C492,88 412,148 302,260" />
        </g>

        {/* Subtle sector / neighborhood micro-labels */}
        <g
          fill="#6C7385"
          fontFamily="Plus Jakarta Sans, Inter, sans-serif"
          fontSize="8.2"
          fontWeight="700"
          letterSpacing="0.06em"
          opacity="0.82"
        >
          {microLabels.map((item, idx) => (
            <text key={`${item.text}-${idx}`} x={item.x} y={item.y}>
              {item.text}
            </text>
          ))}
        </g>

        {/* Soft radial vignette behind primary city label for crisp contrast */}
        <defs>
          <radialGradient id="pageoCenterVignette" cx="0.5" cy="0.48" r="0.28">
            <stop offset="0%" stopColor="#050608" stopOpacity="0.76" />
            <stop offset="100%" stopColor="#050608" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="600" height="260" fill="url(#pageoCenterVignette)" />

        {/* Centered uppercase city display label */}
        <text
          x="300"
          y="132"
          textAnchor="middle"
          fill="#D4D8E2"
          fontFamily="Plus Jakarta Sans, Inter, sans-serif"
          fontSize="18"
          fontWeight="700"
          letterSpacing="0.09em"
        >
          {cleanLabel}
        </text>
      </svg>
    </div>
  );
};

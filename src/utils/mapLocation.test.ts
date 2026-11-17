import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoogleMapsExternalUrl,
  buildOpenStreetMapExternalUrl,
  formatCoordinatesLabel,
  hasAnyMapLocationData,
  parseCoordinatesInput,
  parseGoogleMapsUrl,
  resolveProfileCoordinates,
  sanitizeExternalMapUrl,
} from './mapLocation';

test('parseCoordinatesInput handles decimal and directional DMS strings', () => {
  assert.deepEqual(parseCoordinatesInput('22.5726, 88.3639'), {
    lat: 22.5726,
    lng: 88.3639,
  });
  assert.deepEqual(parseCoordinatesInput('37.7749° N, 122.4194° W'), {
    lat: 37.7749,
    lng: -122.4194,
  });
  assert.deepEqual(parseCoordinatesInput('33.8688° S, 151.2093° E'), {
    lat: -33.8688,
    lng: 151.2093,
  });
  assert.equal(parseCoordinatesInput('95.0, 20.0'), null);
  assert.equal(parseCoordinatesInput('not coordinates'), null);
});

test('formatCoordinatesLabel formats hemispheres accurately', () => {
  assert.equal(
    formatCoordinatesLabel(22.5726, 88.3639),
    '22.5726° N, 88.3639° E'
  );
  assert.equal(
    formatCoordinatesLabel(37.7749, -122.4194),
    '37.7749° N, 122.4194° W'
  );
});

test('parseGoogleMapsUrl extracts coordinates, zoom, and place name', () => {
  const placeUrl =
    'https://www.google.com/maps/place/Kolkata,+West+Bengal/@22.572646,88.363895,12z/data=!3m1!4b1!4m6!3m5!1s0x39f882db4908f667:0x43e330e68f6c2cbc!8m2!3d22.5743545!4d88.3628734';
  const parsedPlace = parseGoogleMapsUrl(placeUrl);
  assert.ok(parsedPlace);
  assert.equal(parsedPlace.lat, 22.574355);
  assert.equal(parsedPlace.lng, 88.362873);
  assert.equal(parsedPlace.zoom, 12);
  assert.equal(parsedPlace.placeName, 'Kolkata, West Bengal');

  const queryUrl = 'https://www.google.com/maps/search/?api=1&query=51.5074,-0.1278';
  const parsedQuery = parseGoogleMapsUrl(queryUrl);
  assert.deepEqual(parsedQuery, {
    lat: 51.5074,
    lng: -0.1278,
    canonicalUrl: queryUrl,
  });

  const textQueryUrl = 'https://maps.google.com/?q=Bengaluru,+India';
  const parsedText = parseGoogleMapsUrl(textQueryUrl);
  assert.deepEqual(parsedText, {
    placeName: 'Bengaluru, India',
    canonicalUrl: textQueryUrl,
  });
});

test('sanitizeExternalMapUrl blocks dangerous protocols', () => {
  assert.equal(sanitizeExternalMapUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeExternalMapUrl('data:text/html,hi'), '');
  assert.equal(
    sanitizeExternalMapUrl('maps.google.com/?q=Kolkata'),
    'https://maps.google.com/?q=Kolkata'
  );
});

test('buildGoogleMapsExternalUrl and resolveProfileCoordinates follow priority order', () => {
  const custom = buildGoogleMapsExternalUrl({
    googleMapsUrl: 'https://maps.app.goo.gl/example123',
    location: 'Kolkata',
    mapLat: 22.5726,
    mapLng: 88.3639,
  });
  assert.equal(custom, 'https://maps.app.goo.gl/example123');

  const byCoords = buildGoogleMapsExternalUrl({
    location: 'Kolkata',
    mapLat: 22.5726,
    mapLng: 88.3639,
  });
  assert.equal(
    byCoords,
    'https://www.google.com/maps/search/?api=1&query=22.5726%2C88.3639'
  );

  const osmByCoords = buildOpenStreetMapExternalUrl({
    mapLat: 22.5726,
    mapLng: 88.3639,
    mapZoom: 14,
  });
  assert.equal(
    osmByCoords,
    'https://www.openstreetmap.org/?mlat=22.5726&mlon=88.3639#map=14/22.5726/88.3639'
  );

  assert.deepEqual(
    resolveProfileCoordinates({
      coordinates: '12.9716° N, 77.5946° E',
    }),
    { lat: 12.9716, lng: 77.5946 }
  );

  assert.equal(hasAnyMapLocationData({}), false);
  assert.equal(
    hasAnyMapLocationData({ googleMapsUrl: 'https://maps.google.com/?q=Tokyo' }),
    true
  );
});

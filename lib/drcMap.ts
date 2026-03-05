export const DRC_BOUNDS = {
  minLatitude: -13.5,
  maxLatitude: 5.4,
  minLongitude: 12.2,
  maxLongitude: 31.3,
} as const;

export const DRC_DEFAULT_REGION = {
  latitude: -4.3276,
  longitude: 15.3136,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export const DRC_CAMERA_BOUNDS = {
  sw: [DRC_BOUNDS.minLongitude, DRC_BOUNDS.minLatitude] as [number, number],
  ne: [DRC_BOUNDS.maxLongitude, DRC_BOUNDS.maxLatitude] as [number, number],
};

export const DRC_MAPBOX_COUNTRY = 'cd';
export const DRC_MAPBOX_BBOX = `${DRC_BOUNDS.minLongitude},${DRC_BOUNDS.minLatitude},${DRC_BOUNDS.maxLongitude},${DRC_BOUNDS.maxLatitude}`;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const normalizeText = (value?: string | null) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const isPointInDRC = (latitude: number, longitude: number) =>
  latitude >= DRC_BOUNDS.minLatitude &&
  latitude <= DRC_BOUNDS.maxLatitude &&
  longitude >= DRC_BOUNDS.minLongitude &&
  longitude <= DRC_BOUNDS.maxLongitude;

export const clampPointToDRC = (latitude: number, longitude: number) => ({
  lat: clamp(latitude, DRC_BOUNDS.minLatitude, DRC_BOUNDS.maxLatitude),
  lng: clamp(longitude, DRC_BOUNDS.minLongitude, DRC_BOUNDS.maxLongitude),
});

export const isCountryInDRC = (country?: string | null, isoCountryCode?: string | null) => {
  const normalizedIso = normalizeText(isoCountryCode);
  if (normalizedIso === 'cd' || normalizedIso === 'cod') {
    return true;
  }

  const normalizedCountry = normalizeText(country);
  if (!normalizedCountry) {
    return false;
  }

  return (
    normalizedCountry === 'cd' ||
    normalizedCountry === 'cod' ||
    normalizedCountry === 'rdc' ||
    normalizedCountry === 'drc' ||
    normalizedCountry.includes('democratic republic of the congo') ||
    normalizedCountry.includes('congo, democratic republic of the') ||
    normalizedCountry.includes('republique democratique du congo') ||
    normalizedCountry.includes('congo kinshasa')
  );
};

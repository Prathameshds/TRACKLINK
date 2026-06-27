export function parseCoordinate(value: string | number | undefined): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return null;
  return n;
}

export function hasValidCoordinates(latitude: string, longitude: string): boolean {
  const lat = parseCoordinate(latitude);
  const lon = parseCoordinate(longitude);
  if (lat === null || lon === null) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function formatCoordinates(latitude: string, longitude: string): string {
  if (!hasValidCoordinates(latitude, longitude)) {
    return "Awaiting GPS fix…";
  }
  const lat = parseCoordinate(latitude)!;
  const lon = parseCoordinate(longitude)!;
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export function formatGeoPoint(city: string, region: string, country: string): string {
  const parts = [city, region, country].filter(
    (part) => part && part !== "—" && !/^unknown$/i.test(part) && !/^pending/i.test(part),
  );
  if (parts.length === 0) {
    return "Resolving location…";
  }
  return parts.join(", ");
}

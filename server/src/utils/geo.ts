export type Ring = [number, number][];

export interface BoundaryPointInput {
  label?: string | null;
  lat: number;
  lon: number;
}

export function boundaryPointsToRing(points: BoundaryPointInput[]): Ring {
  return points.map((p) => [p.lon, p.lat]);
}

export function isValidRing(value: unknown): value is Ring {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every((n) => typeof n === "number" && Number.isFinite(n)),
    )
  );
}

// GeoJSON polygons require the first and last point of a ring to match.
export function closeRing(ring: Ring): Ring {
  const [firstLon, firstLat] = ring[0];
  const [lastLon, lastLat] = ring[ring.length - 1];
  return firstLon === lastLon && firstLat === lastLat ? ring : [...ring, ring[0]];
}

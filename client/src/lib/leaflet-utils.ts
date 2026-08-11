import type L from "leaflet";
import type { Boundary } from "./api";

export function boundaryToLatLngs(boundary: Boundary): L.LatLngExpression[] {
  return boundary.coordinates[0].map(([lon, lat]) => [lat, lon]);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// leaflet-draw always nests a polygon/rectangle's outer ring one level deep,
// even for a simple shape with no holes.
export function ringFromLayer(layer: L.Layer): [number, number][] {
  const [outerRing] = (layer as L.Polygon).getLatLngs() as L.LatLng[][];
  return outerRing.map((latlng) => [latlng.lng, latlng.lat]);
}

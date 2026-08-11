import type { Request, Response } from "express";
import { z } from "zod";

// left,top,right,bottom (lon,lat,lon,lat) around Philadelphia — biases
// results toward the city without excluding nearby suburbs entirely.
const PHILADELPHIA_VIEWBOX = "-75.280,40.138,-74.955,39.867";

const querySchema = z.object({
  q: z.string().trim().min(1),
});

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

// Proxies OpenStreetMap's free Nominatim geocoder so an admin can jump to an
// address or landmark ("1401 JFK Blvd", "City Hall") instead of having to
// find and click it on the map. Kept server-side because Nominatim's usage
// policy requires a descriptive User-Agent and caps requests — routing it
// through one place makes both easy to honor.
//
// Note: Nominatim's free-text search does not resolve compound street×street
// intersection queries ("Broad St and Market St" returns zero results, even
// though each street individually geocodes fine) — verified directly against
// the live service. A workaround of geocoding each street separately and
// computing where their line geometries cross was tried and rejected: OSM
// splits streets into many short way segments, and even scoping the search to
// a tight viewbox didn't reliably surface the segments that actually cross
// (confirmed against the real Broad St/Market St intersection). So this only
// supports single-place search; an admin needs a nearby address or landmark
// to locate an intersection, then click-to-place for the exact point.
export async function search(req: Request, res: Response): Promise<void> {
  const { q } = querySchema.parse(req.query);

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", `${q}, Philadelphia, PA`);
  url.searchParams.set("viewbox", PHILADELPHIA_VIEWBOX);
  url.searchParams.set("bounded", "1");
  url.searchParams.set("limit", "5");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "rent-thisphilly-admin-tool (contact: admin@rent-thisphilly.local)",
    },
  });

  if (!response.ok) {
    res.status(502).json({ message: "Geocoding service unavailable" });
    return;
  }

  const results = (await response.json()) as NominatimResult[];

  res.json({
    results: results.map((r) => ({
      label: r.display_name,
      lat: Number(r.lat),
      lon: Number(r.lon),
    })),
  });
}

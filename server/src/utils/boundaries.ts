import { BuildingModel } from "../models/Building";
import { NeighborhoodModel } from "../models/Neighborhood";
import type { RegionBoundary } from "../models/Region";
import { RegionModel } from "../models/Region";

export function geoWithinFilter(boundary: RegionBoundary): Record<string, unknown> {
  return { location: { $geoWithin: { $geometry: boundary } } };
}

// Resolves a regionId/neighborhoodId pair (as accepted on the buildings list
// endpoints) to a Mongo filter for buildings inside that boundary.
// - `null` means neither was provided — caller should skip area filtering.
// - `false` means the referenced region/neighborhood doesn't exist — caller
//   should return an empty result rather than error, consistent with how
//   the `mine` filter behaves elsewhere on the public buildings list.
export async function resolveAreaFilter(params: {
  regionId?: string;
  neighborhoodId?: string;
}): Promise<Record<string, unknown> | false | null> {
  if (params.neighborhoodId) {
    const neighborhood = await NeighborhoodModel.findById(params.neighborhoodId);
    if (!neighborhood) return false;
    return geoWithinFilter(neighborhood.boundary);
  }
  if (params.regionId) {
    const region = await RegionModel.findById(params.regionId);
    if (!region) return false;
    return geoWithinFilter(region.boundary);
  }
  return null;
}

export async function areaStats(
  boundary: RegionBoundary,
): Promise<{ buildingCount: number; totalUnits: number }> {
  const [result] = await BuildingModel.aggregate<{ buildingCount: number; totalUnits: number }>([
    { $match: geoWithinFilter(boundary) },
    {
      $group: {
        _id: null,
        buildingCount: { $sum: 1 },
        totalUnits: { $sum: { $ifNull: ["$numberOfUnits", 0] } },
      },
    },
  ]);
  return { buildingCount: result?.buildingCount ?? 0, totalUnits: result?.totalUnits ?? 0 };
}

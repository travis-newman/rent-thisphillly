import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Neighborhood, type Region } from "../lib/api";
import { boundaryToLatLngs, escapeHtml } from "../lib/leaflet-utils";

const PHILADELPHIA_CENTER: [number, number] = [39.9526, -75.1652];

// A read-only overview of every region/neighborhood at once, plus quick
// rename/delete actions. Creating a region/neighborhood, or editing its
// boundary, happens on its own page (/regions, /regions/:id,
// /neighborhoods/:id) using the boundary-points editor there.
export function AdminRegions() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const regionsLayerRef = useRef<L.LayerGroup | null>(null);
  const neighborhoodsLayerRef = useRef<L.LayerGroup | null>(null);

  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshRegions = useCallback(() => {
    setIsLoading(true);
    setError(null);
    api
      .listRegions()
      .then((res) => setRegions(res.regions))
      .catch(() => setError("Failed to load regions."))
      .finally(() => setIsLoading(false));
  }, []);

  const refreshNeighborhoods = useCallback((regionId: string) => {
    api
      .listNeighborhoods(regionId)
      .then((res) => setNeighborhoods(res.neighborhoods))
      .catch(() => setActionError("Failed to load neighborhoods."));
  }, []);

  useEffect(() => refreshRegions(), [refreshRegions]);

  useEffect(() => {
    if (!selectedRegionId) {
      setNeighborhoods([]);
      return;
    }
    refreshNeighborhoods(selectedRegionId);
  }, [selectedRegionId, refreshNeighborhoods]);

  // Map + tile layer + overlay groups, set up once.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView(PHILADELPHIA_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const regionsLayer = new L.LayerGroup().addTo(map);
    const neighborhoodsLayer = new L.LayerGroup().addTo(map);

    mapRef.current = map;
    regionsLayerRef.current = regionsLayer;
    neighborhoodsLayerRef.current = neighborhoodsLayer;

    return () => {
      map.remove();
      mapRef.current = null;
      regionsLayerRef.current = null;
      neighborhoodsLayerRef.current = null;
    };
  }, []);

  // Repaint region polygons whenever the list or selection changes.
  useEffect(() => {
    const layer = regionsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const region of regions) {
      const isSelected = region._id === selectedRegionId;
      L.polygon(boundaryToLatLngs(region.boundary), {
        color: isSelected ? "#b83280" : "#6b46c1",
        weight: isSelected ? 3 : 2,
        fillOpacity: isSelected ? 0.12 : 0.04,
      })
        .bindPopup(escapeHtml(region.name))
        .on("click", () => setSelectedRegionId(region._id))
        .addTo(layer);
    }
  }, [regions, selectedRegionId]);

  // Repaint neighborhood polygons (scoped to the selected region) whenever they change.
  useEffect(() => {
    const layer = neighborhoodsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const neighborhood of neighborhoods) {
      L.polygon(boundaryToLatLngs(neighborhood.boundary), {
        color: "#0d9488",
        weight: 1,
        dashArray: "4",
        fillOpacity: 0.1,
      })
        .bindPopup(escapeHtml(neighborhood.name))
        .addTo(layer);
    }
  }, [neighborhoods]);

  async function renameRegion(region: Region) {
    const name = prompt("Rename region", region.name);
    if (!name?.trim() || name.trim() === region.name) return;
    try {
      await api.updateRegion(region._id, { name: name.trim() });
      refreshRegions();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to rename region.");
    }
  }

  async function deleteRegion(region: Region) {
    if (!confirm(`Delete region "${region.name}" and all its neighborhoods?`)) return;
    try {
      await api.deleteRegion(region._id);
      if (selectedRegionId === region._id) setSelectedRegionId(null);
      refreshRegions();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to delete region.");
    }
  }

  async function renameNeighborhood(neighborhood: Neighborhood) {
    const name = prompt("Rename neighborhood", neighborhood.name);
    if (!name?.trim() || name.trim() === neighborhood.name || !selectedRegionId) return;
    try {
      await api.updateNeighborhood(neighborhood._id, { name: name.trim() });
      refreshNeighborhoods(selectedRegionId);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to rename neighborhood.");
    }
  }

  async function deleteNeighborhood(neighborhood: Neighborhood) {
    if (!confirm(`Delete neighborhood "${neighborhood.name}"?`) || !selectedRegionId) return;
    try {
      await api.deleteNeighborhood(neighborhood._id);
      refreshNeighborhoods(selectedRegionId);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to delete neighborhood.");
    }
  }

  const selectedRegion = regions.find((r) => r._id === selectedRegionId) ?? null;

  return (
    <div>
      <h1>Manage regions</h1>
      <p>
        <Link to="/map">Map</Link> · <Link to="/buildings">Buildings</Link>
      </p>

      {error && <p role="alert">{error}</p>}
      {actionError && <p role="alert">{actionError}</p>}

      <h2>Regions</h2>
      <p>
        <Link to="/regions">Add a region</Link> from the regions page.
      </p>
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <ul>
          {regions.map((region) => (
            <li key={region._id}>
              <button onClick={() => setSelectedRegionId(region._id)}>
                {region.name}
                {selectedRegionId === region._id ? " (selected)" : ""}
              </button>{" "}
              <Link to={`/regions/${region._id}`}>View / edit page</Link>{" "}
              <button onClick={() => renameRegion(region)}>Rename</button>{" "}
              <button onClick={() => deleteRegion(region)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
      {!isLoading && regions.length === 0 && <p>No regions yet.</p>}

      {selectedRegion && (
        <>
          <h2>Neighborhoods in {selectedRegion.name}</h2>
          <p>
            <Link to={`/regions/${selectedRegion._id}`}>Add a neighborhood</Link> from this
            region&rsquo;s page.
          </p>
          <ul>
            {neighborhoods.map((neighborhood) => (
              <li key={neighborhood._id}>
                {neighborhood.name}{" "}
                <Link to={`/neighborhoods/${neighborhood._id}`}>View / edit page</Link>{" "}
                <button onClick={() => renameNeighborhood(neighborhood)}>Rename</button>{" "}
                <button onClick={() => deleteNeighborhood(neighborhood)}>Delete</button>
              </li>
            ))}
          </ul>
          {neighborhoods.length === 0 && <p>No neighborhoods yet.</p>}
        </>
      )}

      <div ref={mapContainerRef} style={{ height: "70vh", width: "100%" }} />
    </div>
  );
}

import { TextInput } from "@mantine/core";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type BuildingMapPoint } from "../lib/api";
import { boundaryToLatLngs, escapeHtml, ringFromLayer } from "../lib/leaflet-utils";

// Vite doesn't resolve the relative image URLs Leaflet's default icon uses
// internally, so every marker renders as a broken image unless we point it
// at the bundler-resolved asset URLs instead.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const PHILADELPHIA_CENTER: [number, number] = [39.9526, -75.1652];

function popupHtml(building: BuildingMapPoint): string {
  const name = escapeHtml(building.buildingName ?? building.address);
  const address = escapeHtml(building.address);
  const zip = building.zipCode ? `, ${escapeHtml(building.zipCode)}` : "";
  const units = building.numberOfUnits != null ? `<br>${building.numberOfUnits} units` : "";
  return `<strong>${name}</strong><br>${address}${zip}${units}<br><a href="/buildings/${building._id}">View details</a>`;
}

export function BuildingsMap() {
  const [searchParams] = useSearchParams();
  const regionId = searchParams.get("regionId") ?? undefined;
  const neighborhoodId = searchParams.get("neighborhoodId") ?? undefined;
  const isScoped = Boolean(regionId || neighborhoodId);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const regionsLayerRef = useRef<L.LayerGroup | null>(null);
  const neighborhoodsLayerRef = useRef<L.LayerGroup | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [polygon, setPolygon] = useState<[number, number][] | null>(null);
  const [scopedAreaName, setScopedAreaName] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setQ(searchInput), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  function clearBoundary() {
    drawnItemsRef.current?.clearLayers();
    setPolygon(null);
  }

  // Set up the map + tile layer + cluster group + draw controls once.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView(PHILADELPHIA_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const cluster = L.markerClusterGroup();
    cluster.addTo(map);

    const drawnItems = new L.FeatureGroup();
    drawnItems.addTo(map);

    const regionsLayer = new L.LayerGroup().addTo(map);
    const neighborhoodsLayer = new L.LayerGroup().addTo(map);

    const drawControl = new L.Control.Draw({
      draw: {
        // showArea: false for both — leaflet-draw@1.0.4's readableArea() (the
        // live area readout in the tooltip) references an undeclared `type`
        // variable, which throws under strict-mode ES modules.
        polygon: { allowIntersection: false, showArea: false },
        rectangle: { showArea: false },
        marker: false,
        circle: false,
        circlemarker: false,
        polyline: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    map.addControl(drawControl);

    // Only one boundary at a time — a newly drawn shape replaces any existing one.
    map.on(L.Draw.Event.CREATED, (e) => {
      drawnItems.clearLayers();
      const layer = (e as L.DrawEvents.Created).layer;
      drawnItems.addLayer(layer);
      setPolygon(ringFromLayer(layer));
    });

    map.on(L.Draw.Event.EDITED, (e) => {
      const layers = (e as L.DrawEvents.Edited).layers;
      layers.eachLayer((layer) => setPolygon(ringFromLayer(layer)));
    });

    map.on(L.Draw.Event.DELETED, () => setPolygon(null));

    mapRef.current = map;
    clusterRef.current = cluster;
    drawnItemsRef.current = drawnItems;
    regionsLayerRef.current = regionsLayer;
    neighborhoodsLayerRef.current = neighborhoodsLayer;

    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      drawnItemsRef.current = null;
      regionsLayerRef.current = null;
      neighborhoodsLayerRef.current = null;
    };
  }, []);

  // When arriving from a region/neighborhood page, fetch its name (for the
  // banner) and boundary (to fit the map to it). Runs after the map-init
  // effect above, so mapRef.current is already set.
  useEffect(() => {
    if (!regionId && !neighborhoodId) {
      setScopedAreaName(null);
      return;
    }
    const request = neighborhoodId ? api.getNeighborhood(neighborhoodId) : api.getRegion(regionId!);
    request
      .then((res) => {
        const area = "neighborhood" in res ? res.neighborhood : res.region;
        setScopedAreaName(area.name);
        mapRef.current?.fitBounds(L.latLngBounds(boundaryToLatLngs(area.boundary)), {
          padding: [20, 20],
        });
      })
      .catch(() => setScopedAreaName(null));
  }, [regionId, neighborhoodId]);

  // Regions/neighborhoods are admin-managed but visible to everyone — plot
  // them once as static, non-editable overlays.
  useEffect(() => {
    Promise.all([api.listRegions(), api.listNeighborhoods()])
      .then(([regionsRes, neighborhoodsRes]) => {
        const regionsLayer = regionsLayerRef.current;
        const neighborhoodsLayer = neighborhoodsLayerRef.current;
        if (!regionsLayer || !neighborhoodsLayer) return;

        for (const region of regionsRes.regions) {
          L.polygon(boundaryToLatLngs(region.boundary), {
            color: "#6b46c1",
            weight: 2,
            fillOpacity: 0.04,
          })
            .bindPopup(
              `<strong>${escapeHtml(region.name)}</strong><br>Region<br><a href="/regions/${region._id}">View details</a>`,
            )
            .addTo(regionsLayer);
        }

        for (const neighborhood of neighborhoodsRes.neighborhoods) {
          L.polygon(boundaryToLatLngs(neighborhood.boundary), {
            color: "#0d9488",
            weight: 1,
            dashArray: "4",
            fillOpacity: 0.08,
          })
            .bindPopup(
              `<strong>${escapeHtml(neighborhood.name)}</strong><br>Neighborhood<br><a href="/neighborhoods/${neighborhood._id}">View details</a>`,
            )
            .addTo(neighborhoodsLayer);
        }
      })
      .catch(() => {
        // Non-critical overlay — a failure here shouldn't block the building map.
      });
  }, []);

  // Fetch + (re)plot markers whenever the search term or drawn boundary changes.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .getBuildingsMap({
        q: q || undefined,
        polygon: polygon ?? undefined,
        regionId,
        neighborhoodId,
      })
      .then((res) => {
        if (cancelled) return;
        const cluster = clusterRef.current;
        if (!cluster) return;

        cluster.clearLayers();
        const markers = res.buildings.map((building) =>
          L.marker([building.lat, building.lon]).bindPopup(popupHtml(building)),
        );
        cluster.addLayers(markers);
        setCount(res.buildings.length);

        if (markers.length > 0 && !polygon && !isScoped) {
          // Only auto-fit for a plain search — a drawn boundary or an
          // incoming region/neighborhood scope already frames the view.
          const bounds = L.latLngBounds(markers.map((m) => m.getLatLng()));
          mapRef.current?.fitBounds(bounds, { maxZoom: 15, padding: [20, 20] });
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load buildings.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [q, polygon, regionId, neighborhoodId, isScoped]);

  return (
    <div>
      <h1>Buildings map</h1>
      <p>
        <Link to="/buildings">List view</Link>
      </p>
      <p>
        <span style={{ color: "#6b46c1" }}>▬</span> Region &nbsp;
        <span style={{ color: "#0d9488" }}>▬</span> Neighborhood
      </p>

      {isScoped && (
        <p>
          Showing buildings in {neighborhoodId ? "neighborhood" : "region"}:{" "}
          <strong>{scopedAreaName ?? "…"}</strong> · <Link to="/map">Clear</Link>
        </p>
      )}

      <TextInput
        type="search"
        placeholder="Search by address or building name"
        value={searchInput}
        onChange={(e) => setSearchInput(e.currentTarget.value)}
      />

      {!isScoped && (
        <p>
          Use the polygon/rectangle tool on the map to draw a boundary and search only within it.
          {polygon && (
            <>
              {" "}
              <button onClick={clearBoundary}>Clear boundary</button>
            </>
          )}
        </p>
      )}

      {error && <p role="alert">{error}</p>}
      {!error && (
        <p>
          {isLoading
            ? "Loading…"
            : `${count ?? 0} building${count === 1 ? "" : "s"} shown${polygon ? " within the drawn boundary" : ""}`}
        </p>
      )}

      <div ref={mapContainerRef} style={{ height: "70vh", width: "100%" }} />
    </div>
  );
}

import { Button, Group, List, Stack, Text, TextInput } from "@mantine/core";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, type BoundaryPointInput } from "../lib/api";

const PHILADELPHIA_CENTER: [number, number] = [39.9526, -75.1652];
const MIN_POINTS = 3;

// Lets an admin build a region/neighborhood boundary by clicking points on a
// map (most often street intersections) rather than freehand-drawing a
// shape — each point gets a number (showing polygon order) and an optional
// label, and can be removed individually.
export function BoundaryPointsEditor({
  initialPoints = [],
  onChange,
}: {
  initialPoints?: BoundaryPointInput[];
  onChange: (points: BoundaryPointInput[]) => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const shapeRef = useRef<L.Polygon | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const initialPointsRef = useRef(initialPoints);
  const onChangeRef = useRef(onChange);

  const [points, setPoints] = useState<BoundaryPointInput[]>(initialPoints);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ label: string; lat: number; lon: number }[]>(
    [],
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onChangeRef.current(points);
  }, [points]);

  // Map + click-to-add-point handler, set up once.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView(PHILADELPHIA_CENTER, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const markersLayer = new L.LayerGroup().addTo(map);
    const shape = L.polygon([], { color: "#b83280", weight: 2, fillOpacity: 0.1 }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      setPoints((prev) => [...prev, { label: "", lat: e.latlng.lat, lon: e.latlng.lng }]);
    });

    if (initialPointsRef.current.length > 0) {
      map.fitBounds(
        L.latLngBounds(initialPointsRef.current.map((p) => [p.lat, p.lon] as [number, number])),
        { padding: [20, 20] },
      );
    }

    mapRef.current = map;
    markersLayerRef.current = markersLayer;
    shapeRef.current = shape;

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      shapeRef.current = null;
    };
  }, []);

  // Repaint numbered markers + the live polygon preview whenever points change.
  useEffect(() => {
    const markersLayer = markersLayerRef.current;
    const shape = shapeRef.current;
    if (!markersLayer || !shape) return;

    markersLayer.clearLayers();
    points.forEach((p, i) => {
      L.marker([p.lat, p.lon])
        .bindTooltip(String(i + 1), { permanent: true, direction: "top", offset: [0, -8] })
        .addTo(markersLayer);
    });
    shape.setLatLngs(points.map((p) => [p.lat, p.lon]));
  }, [points]);

  function updateLabel(index: number, label: string) {
    setPoints((prev) => prev.map((p, i) => (i === index ? { ...p, label } : p)));
  }

  function removePoint(index: number) {
    setPoints((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSearch() {
    const query = searchQuery.trim();
    if (!query) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const res = await api.geocodeSearch(query);
      if (res.results.length === 0) {
        setSearchError("No matching location found.");
      }
      setSearchResults(res.results);
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : "Search failed.");
    } finally {
      setIsSearching(false);
    }
  }

  function addSearchResult(result: { label: string; lat: number; lon: number }) {
    setPoints((prev) => [...prev, { label: searchQuery.trim(), lat: result.lat, lon: result.lon }]);
    mapRef.current?.panTo([result.lat, result.lon]);
    setSearchResults([]);
    setSearchQuery("");
  }

  const pointsNeeded = Math.max(0, MIN_POINTS - points.length);

  return (
    <Stack>
      <Text size="sm">
        Click the map to add a boundary point — usually a street intersection. Points are connected
        in the order added to form the shape. To jump near an intersection first, search a nearby
        address or landmark (street-intersection searches like &ldquo;Broad St and Market
        St&rdquo; aren&rsquo;t supported by the free geocoder — try &ldquo;1401 JFK Blvd&rdquo;
        or &ldquo;City Hall&rdquo; instead):
      </Text>
      <Group align="flex-start">
        <TextInput
          placeholder='e.g. "1401 JFK Blvd" or "City Hall"'
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSearch();
            }
          }}
          style={{ flex: 1 }}
        />
        <Button
          type="button"
          onClick={handleSearch}
          loading={isSearching}
          disabled={!searchQuery.trim()}
        >
          Search
        </Button>
      </Group>
      {searchError && <Text role="alert">{searchError}</Text>}
      {searchResults.length > 0 && (
        <List>
          {searchResults.map((result, index) => (
            <List.Item key={index}>
              {result.label}{" "}
              <Button type="button" size="xs" variant="light" onClick={() => addSearchResult(result)}>
                Add this point
              </Button>
            </List.Item>
          ))}
        </List>
      )}
      <div ref={mapContainerRef} style={{ height: "300px", width: "100%" }} />
      {points.length > 0 && (
        <List type="ordered">
          {points.map((point, index) => (
            <List.Item key={index}>
              <Group align="center">
                <TextInput
                  placeholder="Label (e.g. Broad St & Market St)"
                  value={point.label ?? ""}
                  onChange={(e) => updateLabel(index, e.currentTarget.value)}
                />
                <Text size="sm">
                  ({point.lat.toFixed(5)}, {point.lon.toFixed(5)})
                </Text>
                <Button
                  type="button"
                  size="xs"
                  variant="light"
                  color="red"
                  onClick={() => removePoint(index)}
                >
                  Remove
                </Button>
              </Group>
            </List.Item>
          ))}
        </List>
      )}
      {pointsNeeded > 0 && (
        <Text size="sm">
          Add at least {pointsNeeded} more point{pointsNeeded === 1 ? "" : "s"}.
        </Text>
      )}
    </Stack>
  );
}

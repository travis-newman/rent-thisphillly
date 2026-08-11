import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BoundaryEntityForm,
  type BoundaryEntityFormValues,
} from "../components/BoundaryEntityForm";
import { api, type Region } from "../lib/api";
import { useAuth } from "../lib/auth-context";

export function Regions() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [regions, setRegions] = useState<Region[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const refresh = useCallback(() => {
    setIsLoading(true);
    setError(null);
    api
      .listRegions()
      .then((res) => setRegions(res.regions))
      .catch(() => setError("Failed to load regions."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => refresh(), [refresh]);

  async function handleCreate(values: BoundaryEntityFormValues) {
    await api.createRegion(values);
    setIsAdding(false);
    refresh();
  }

  return (
    <div>
      <h1>Regions</h1>
      <p>
        <Link to="/buildings">Buildings</Link> · <Link to="/map">Map</Link>
      </p>

      {isLoading && <p>Loading…</p>}
      {error && <p role="alert">{error}</p>}

      {!isLoading && !error && (
        <ul>
          {regions.map((region) => (
            <li key={region._id}>
              <Link to={`/regions/${region._id}`}>{region.name}</Link>
              {" — "}
              {region.neighborhoodCount ?? 0} neighborhood
              {region.neighborhoodCount === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
      )}
      {!isLoading && !error && regions.length === 0 && <p>No regions yet.</p>}

      {isAdmin && (
        <div>
          {isAdding ? (
            <BoundaryEntityForm
              submitLabel="Add region"
              onSubmit={handleCreate}
              onCancel={() => setIsAdding(false)}
            />
          ) : (
            <button onClick={() => setIsAdding(true)}>Add region</button>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, type Building } from "../lib/api";
import { BuildingSummaryLine } from "./BuildingSummary";

const PAGE_SIZE = 20;

// Read-only, paginated list of buildings inside a region or neighborhood —
// used on their detail pages. Editing still happens from /buildings or a
// building's own detail page, not here.
export function BuildingList({
  regionId,
  neighborhoodId,
}: {
  regionId?: string;
  neighborhoodId?: string;
}) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .listBuildings({ page, limit: PAGE_SIZE, regionId, neighborhoodId })
      .then((res) => {
        if (cancelled) return;
        setBuildings(res.buildings);
        setTotal(res.total);
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
  }, [page, regionId, neighborhoodId]);

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p role="alert">{error}</p>;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <ul>
        {buildings.map((building) => (
          <li key={building._id}>
            <BuildingSummaryLine building={building} />
          </li>
        ))}
      </ul>
      {buildings.length === 0 && <p>No buildings here yet.</p>}
      {buildings.length > 0 && (
        <>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            {" "}
            Page {page} of {totalPages}{" "}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </>
      )}
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AdminBuildingForm,
  ClientBuildingForm,
  emptyAdminForm,
  getWebsiteHostname,
  toAdminForm,
  useClientList,
} from "../components/BuildingForms";
import { api, type Building, type BuildingInput } from "../lib/api";
import { useAuth } from "../lib/auth-context";

const PAGE_SIZE = 20;

export function Buildings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isClient = user?.role === "client";
  const clients = useClientList(isAdmin);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setQ(searchInput), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [q, mineOnly]);

  const refresh = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .listBuildings({ page, limit: PAGE_SIZE, q: q || undefined, mine: mineOnly || undefined })
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
  }, [page, q, mineOnly]);

  useEffect(() => refresh(), [refresh]);

  async function handleCreate(input: BuildingInput) {
    await api.createBuilding(input);
    setIsAdding(false);
    refresh();
  }

  async function handleUpdate(id: string, input: BuildingInput) {
    await api.updateBuilding(id, input);
    setEditingId(null);
    refresh();
  }

  async function handleDelete(building: Building) {
    if (!confirm(`Delete ${building.buildingName ?? building.address}?`)) return;
    await api.deleteBuilding(building._id);
    refresh();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1>Buildings</h1>
      <p>
        <Link to="/">Home</Link>
      </p>

      <input
        type="search"
        placeholder="Search by address or building name"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
      />

      {isClient && (
        <p>
          <label>
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
            />{" "}
            Show only buildings I manage
          </label>
        </p>
      )}

      {isAdmin && (
        <div>
          {isAdding ? (
            <AdminBuildingForm
              initial={emptyAdminForm}
              submitLabel="Add building"
              clients={clients}
              onSubmit={handleCreate}
              onCancel={() => setIsAdding(false)}
            />
          ) : (
            <button onClick={() => setIsAdding(true)}>Add building</button>
          )}
        </div>
      )}

      {isLoading && <p>Loading…</p>}
      {error && <p role="alert">{error}</p>}

      {!isLoading && !error && (
        <>
          <p>
            {total} building{total === 1 ? "" : "s"}
          </p>
          <ul>
            {buildings.map((building) => {
              const hostname = getWebsiteHostname(building.website);
              const canEdit = isAdmin || (isClient && building.managedBy === user!.id);

              if (editingId === building._id) {
                return (
                  <li key={building._id}>
                    {isAdmin ? (
                      <AdminBuildingForm
                        initial={toAdminForm(building)}
                        submitLabel="Save"
                        clients={clients}
                        onSubmit={(input) => handleUpdate(building._id, input)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <ClientBuildingForm
                        initial={{
                          leasingPhone: building.leasingPhone ?? "",
                          leasingEmail: building.leasingEmail ?? "",
                          website: building.website ?? "",
                        }}
                        onSubmit={(input) => handleUpdate(building._id, input)}
                        onCancel={() => setEditingId(null)}
                      />
                    )}
                  </li>
                );
              }

              return (
                <li key={building._id}>
                  <strong>
                    <Link to={`/buildings/${building._id}`}>
                      {building.buildingName ?? building.address}
                    </Link>
                  </strong>
                  {" — "}
                  {building.address}
                  {building.zipCode ? `, ${building.zipCode}` : ""}
                  {building.numberOfUnits != null && <> · {building.numberOfUnits} units</>}
                  {building.yearBuilt != null && <> · built {building.yearBuilt}</>}
                  {building.leasingPhone && <> · {building.leasingPhone}</>}
                  {building.leasingEmail && (
                    <>
                      {" · "}
                      <a href={`mailto:${building.leasingEmail}`}>{building.leasingEmail}</a>
                    </>
                  )}
                  {hostname && (
                    <>
                      {" · "}
                      <a href={building.website!} target="_blank" rel="noreferrer">
                        {hostname}
                      </a>
                    </>
                  )}
                  {canEdit && (
                    <>
                      {" "}
                      <button onClick={() => setEditingId(building._id)}>Edit</button>
                    </>
                  )}
                  {isAdmin && (
                    <>
                      {" "}
                      <button onClick={() => handleDelete(building)}>Delete</button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          {buildings.length === 0 && <p>No buildings match your search.</p>}

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
    </div>
  );
}

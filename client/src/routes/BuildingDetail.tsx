import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AdminBuildingForm,
  ClientBuildingForm,
  getWebsiteHostname,
  toAdminForm,
  useClientList,
} from "../components/BuildingForms";
import { PhotoGallery } from "../components/PhotoGallery";
import { api, type Building, type BuildingInput, type Neighborhood, type Region } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { uploadBuildingPhoto } from "../lib/photos";

function formatCurrency(n: number | null): string | null {
  return n == null ? null : `$${n.toLocaleString()}`;
}

function formatRentRange(rent: Building["rent"]): string | null {
  const { min, max } = rent;
  if (min == null && max == null) return null;
  if (min === max || max == null) return `$${min}/mo`;
  if (min == null) return `$${max}/mo`;
  return `$${min}–$${max}/mo`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function BuildingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const isClient = user?.role === "client";
  const clients = useClientList(isAdmin);

  const [building, setBuilding] = useState<Building | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [neighborhood, setNeighborhood] = useState<Neighborhood | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const refresh = useCallback(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    api
      .getBuilding(id)
      .then((res) => {
        setBuilding(res.building);
        setRegion(res.region);
        setNeighborhood(res.neighborhood);
      })
      .catch(() => setError("Building not found."))
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => refresh(), [refresh]);

  async function handleUpdate(input: BuildingInput) {
    if (!building) return;
    await api.updateBuilding(building._id, input);
    setIsEditing(false);
    refresh();
  }

  async function handleDelete() {
    if (!building) return;
    if (!confirm(`Delete ${building.buildingName ?? building.address}?`)) return;
    await api.deleteBuilding(building._id);
    navigate("/buildings");
  }

  async function handlePhotoUpload(file: File) {
    if (!building) return;
    const res = await uploadBuildingPhoto(building._id, file);
    setBuilding(res.building);
  }

  async function handlePhotoDelete(key: string) {
    if (!building) return;
    await api.deleteBuildingPhoto(building._id, key);
    setBuilding((prev) => (prev ? { ...prev, photos: prev.photos.filter((p) => p.key !== key) } : prev));
  }

  if (isLoading) return <p>Loading…</p>;
  if (error || !building) return <p role="alert">{error ?? "Building not found."}</p>;

  const canEdit = isAdmin || (isClient && building.managedBy === user!.id);
  const hostname = getWebsiteHostname(building.website);
  const manager = clients.find((c) => c._id === building.managedBy);
  const [lon, lat] = building.location?.coordinates ?? [];

  return (
    <div>
      <p>
        <Link to="/buildings">Buildings</Link>
      </p>

      <h1>{building.buildingName ?? building.address}</h1>
      <p>
        {building.address}
        {building.zipCode ? `, ${building.zipCode}` : ""}
      </p>
      {(region || neighborhood) && (
        <p>
          {region && (
            <>
              Region: <Link to={`/regions/${region._id}`}>{region.name}</Link>
            </>
          )}
          {region && neighborhood && " · "}
          {neighborhood && (
            <>
              Neighborhood:{" "}
              <Link to={`/neighborhoods/${neighborhood._id}`}>{neighborhood.name}</Link>
            </>
          )}
        </p>
      )}

      {canEdit && !isEditing && <button onClick={() => setIsEditing(true)}>Edit</button>}
      {isAdmin && !isEditing && (
        <>
          {" "}
          <button onClick={handleDelete}>Delete</button>
        </>
      )}

      {isEditing &&
        (isAdmin ? (
          <AdminBuildingForm
            initial={toAdminForm(building)}
            submitLabel="Save"
            clients={clients}
            onSubmit={handleUpdate}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <ClientBuildingForm
            initial={{
              leasingPhone: building.leasingPhone ?? "",
              leasingEmail: building.leasingEmail ?? "",
              website: building.website ?? "",
            }}
            onSubmit={handleUpdate}
            onCancel={() => setIsEditing(false)}
          />
        ))}

      <h2>Contact</h2>
      <ul>
        <li>Leasing phone: {building.leasingPhone ?? "—"}</li>
        <li>
          Leasing email:{" "}
          {building.leasingEmail ? (
            <a href={`mailto:${building.leasingEmail}`}>{building.leasingEmail}</a>
          ) : (
            "—"
          )}
        </li>
        <li>
          Website:{" "}
          {hostname ? (
            <a href={building.website!} target="_blank" rel="noreferrer">
              {hostname}
            </a>
          ) : (
            "—"
          )}
        </li>
      </ul>

      <h2>Property details</h2>
      <ul>
        <li>Units: {building.numberOfUnits ?? "—"}</li>
        <li>Year built: {building.yearBuilt ?? "—"}</li>
        <li>Construction era: {building.constructionEra ?? "—"}</li>
        <li>Stories: {building.numberOfStories ?? "—"}</li>
        <li>
          Total livable area:{" "}
          {building.totalLivableArea != null
            ? `${building.totalLivableArea.toLocaleString()} sq ft`
            : "—"}
        </li>
        <li>Market value: {formatCurrency(building.marketValue) ?? "—"}</li>
        <li>Owner: {building.ownerBusinessName ?? "—"}</li>
        <li>Parcel number: {building.parcelNumber ?? "—"}</li>
      </ul>

      <h2>Listings</h2>
      <ul>
        <li>Active listings: {building.activeListingsCount}</li>
        <li>
          Unit mix: studio {building.unitMix.studio ?? "—"}, 1BR {building.unitMix.br1 ?? "—"}, 2BR{" "}
          {building.unitMix.br2 ?? "—"}, 3BR+ {building.unitMix.br3plus ?? "—"}
        </li>
        <li>Rent: {formatRentRange(building.rent) ?? "—"}</li>
      </ul>

      {lat != null && lon != null && (
        <>
          <h2>Location</h2>
          <ul>
            <li>
              Coordinates: {lat}, {lon}{" "}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`}
                target="_blank"
                rel="noreferrer"
              >
                View on map
              </a>
            </li>
          </ul>
        </>
      )}

      <h2>Photos</h2>
      <PhotoGallery
        photos={building.photos}
        canEdit={isAdmin}
        onUpload={handlePhotoUpload}
        onDelete={handlePhotoDelete}
      />

      <h2>Data source</h2>
      <ul>
        {isAdmin && (
          <li>Managed by: {manager?.email ?? (building.managedBy ? "unknown client" : "—")}</li>
        )}
        <li>Source: {building.source ?? "—"}</li>
        <li>Contact confidence: {building.contactConfidence ?? "—"}</li>
        <li>Year built source: {building.yearBuiltSource ?? "—"}</li>
        <li>Website source: {building.websiteSource ?? "—"}</li>
        <li>Added: {formatDate(building.createdAt)}</li>
        <li>Last updated: {formatDate(building.updatedAt)}</li>
      </ul>
    </div>
  );
}

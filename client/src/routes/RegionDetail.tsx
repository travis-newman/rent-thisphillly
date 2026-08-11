import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BoundaryEntityForm,
  type BoundaryEntityFormValues,
} from "../components/BoundaryEntityForm";
import { BuildingList } from "../components/BuildingList";
import { PhotoGallery } from "../components/PhotoGallery";
import { api, type AreaStats, type Neighborhood, type Region } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { uploadRegionPhoto } from "../lib/photos";

export function RegionDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [region, setRegion] = useState<Region | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [stats, setStats] = useState<AreaStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingNeighborhood, setIsAddingNeighborhood] = useState(false);

  const refresh = useCallback(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    api
      .getRegion(id)
      .then((res) => {
        setRegion(res.region);
        setNeighborhoods(res.neighborhoods);
        setStats({ buildingCount: res.buildingCount, totalUnits: res.totalUnits });
      })
      .catch(() => setError("Region not found."))
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => refresh(), [refresh]);

  async function handleSaveEdit(values: BoundaryEntityFormValues) {
    if (!region) return;
    await api.updateRegion(region._id, values);
    setIsEditing(false);
    refresh();
  }

  async function handleCreateNeighborhood(values: BoundaryEntityFormValues) {
    if (!region) return;
    await api.createNeighborhood({ ...values, regionId: region._id });
    setIsAddingNeighborhood(false);
    refresh();
  }

  async function handlePhotoUpload(file: File) {
    if (!region) return;
    const res = await uploadRegionPhoto(region._id, file);
    setRegion(res.region);
  }

  async function handlePhotoDelete(key: string) {
    if (!region) return;
    await api.deleteRegionPhoto(region._id, key);
    setRegion((prev) => (prev ? { ...prev, photos: prev.photos.filter((p) => p.key !== key) } : prev));
  }

  if (isLoading) return <p>Loading…</p>;
  if (error || !region) return <p role="alert">{error ?? "Region not found."}</p>;

  return (
    <div>
      <p>
        <Link to="/regions">All regions</Link> ·{" "}
        <Link to={`/map?regionId=${region._id}`}>View on map</Link>
      </p>

      <h1>{region.name}</h1>

      {isEditing ? (
        <BoundaryEntityForm
          initialName={region.name}
          initialDescription={region.description ?? ""}
          initialBoundaryPoints={region.boundaryPoints}
          submitLabel="Save"
          onSubmit={handleSaveEdit}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <>
          <p>{region.description ?? "No description yet."}</p>
          {isAdmin && <button onClick={() => setIsEditing(true)}>Edit region</button>}
        </>
      )}

      <p>
        {stats?.buildingCount ?? 0} building{stats?.buildingCount === 1 ? "" : "s"} ·{" "}
        {stats?.totalUnits ?? 0} units · {neighborhoods.length} neighborhood
        {neighborhoods.length === 1 ? "" : "s"}
      </p>

      <h2>Neighborhoods</h2>
      {neighborhoods.length === 0 ? (
        <p>No neighborhoods yet.</p>
      ) : (
        <ul>
          {neighborhoods.map((neighborhood) => (
            <li key={neighborhood._id}>
              <Link to={`/neighborhoods/${neighborhood._id}`}>{neighborhood.name}</Link>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <div>
          {isAddingNeighborhood ? (
            <BoundaryEntityForm
              submitLabel="Add neighborhood"
              onSubmit={handleCreateNeighborhood}
              onCancel={() => setIsAddingNeighborhood(false)}
            />
          ) : (
            <button onClick={() => setIsAddingNeighborhood(true)}>Add neighborhood</button>
          )}
        </div>
      )}

      <h2>Photos</h2>
      <PhotoGallery
        photos={region.photos}
        canEdit={isAdmin}
        onUpload={handlePhotoUpload}
        onDelete={handlePhotoDelete}
      />

      <h2>Buildings in this region</h2>
      <BuildingList regionId={region._id} />
    </div>
  );
}

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
import { uploadNeighborhoodPhoto } from "../lib/photos";

export function NeighborhoodDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [neighborhood, setNeighborhood] = useState<Neighborhood | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [stats, setStats] = useState<AreaStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const refresh = useCallback(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    api
      .getNeighborhood(id)
      .then((res) => {
        setNeighborhood(res.neighborhood);
        setRegion(res.region);
        setStats({ buildingCount: res.buildingCount, totalUnits: res.totalUnits });
      })
      .catch(() => setError("Neighborhood not found."))
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => refresh(), [refresh]);

  async function handleSaveEdit(values: BoundaryEntityFormValues) {
    if (!neighborhood) return;
    await api.updateNeighborhood(neighborhood._id, values);
    setIsEditing(false);
    refresh();
  }

  async function handlePhotoUpload(file: File) {
    if (!neighborhood) return;
    const res = await uploadNeighborhoodPhoto(neighborhood._id, file);
    setNeighborhood(res.neighborhood);
  }

  async function handlePhotoDelete(key: string) {
    if (!neighborhood) return;
    await api.deleteNeighborhoodPhoto(neighborhood._id, key);
    setNeighborhood((prev) =>
      prev ? { ...prev, photos: prev.photos.filter((p) => p.key !== key) } : prev,
    );
  }

  if (isLoading) return <p>Loading…</p>;
  if (error || !neighborhood) return <p role="alert">{error ?? "Neighborhood not found."}</p>;

  return (
    <div>
      <p>
        <Link to="/regions">All regions</Link>
        {region && (
          <>
            {" · "}
            <Link to={`/regions/${region._id}`}>{region.name}</Link>
          </>
        )}
        {" · "}
        <Link to={`/map?neighborhoodId=${neighborhood._id}`}>View on map</Link>
      </p>

      <h1>{neighborhood.name}</h1>

      {isEditing ? (
        <BoundaryEntityForm
          initialName={neighborhood.name}
          initialDescription={neighborhood.description ?? ""}
          initialBoundaryPoints={neighborhood.boundaryPoints}
          submitLabel="Save"
          onSubmit={handleSaveEdit}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <>
          <p>{neighborhood.description ?? "No description yet."}</p>
          {isAdmin && <button onClick={() => setIsEditing(true)}>Edit neighborhood</button>}
        </>
      )}

      <p>
        {stats?.buildingCount ?? 0} building{stats?.buildingCount === 1 ? "" : "s"} ·{" "}
        {stats?.totalUnits ?? 0} units
      </p>

      <h2>Photos</h2>
      <PhotoGallery
        photos={neighborhood.photos}
        canEdit={isAdmin}
        onUpload={handlePhotoUpload}
        onDelete={handlePhotoDelete}
      />

      <h2>Buildings in this neighborhood</h2>
      <BuildingList neighborhoodId={neighborhood._id} />
    </div>
  );
}

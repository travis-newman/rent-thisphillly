import { Button, FileInput } from "@mantine/core";
import { useState } from "react";
import { ApiError, type Photo } from "../lib/api";

// Presentational and entity-agnostic — the page owns actually calling the
// right upload*Photo/delete*Photo helper for whichever entity it's showing.
export function PhotoGallery({
  photos,
  canEdit,
  onUpload,
  onDelete,
}: {
  photos: Photo[];
  canEdit: boolean;
  onUpload: (file: File) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  async function handleFileChange(file: File | null) {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      setFileInputKey((k) => k + 1); // clear the input so the same file can be re-selected later
    }
  }

  async function handleDelete(key: string) {
    if (!confirm("Delete this photo?")) return;

    setDeletingKey(key);
    setError(null);
    try {
      await onDelete(key);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete photo.");
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <div>
      {photos.length === 0 && <p>No photos yet.</p>}

      {photos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {photos.map((photo) => (
            <div key={photo.key} style={{ width: "160px" }}>
              <img
                src={photo.url}
                alt=""
                style={{ width: "160px", height: "120px", objectFit: "cover", display: "block" }}
              />
              {canEdit && (
                <Button
                  type="button"
                  size="xs"
                  variant="light"
                  color="red"
                  onClick={() => handleDelete(photo.key)}
                  loading={deletingKey === photo.key}
                >
                  Delete
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <FileInput
          key={fileInputKey}
          accept="image/*"
          placeholder={isUploading ? "Uploading…" : "Upload a photo"}
          onChange={handleFileChange}
          disabled={isUploading}
          maw={280}
        />
      )}

      {error && <p role="alert">{error}</p>}
    </div>
  );
}

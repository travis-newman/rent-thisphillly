import { api, ApiError, type Building, type Neighborhood, type Region } from "./api";

// Soft client-side check so a huge file fails fast instead of waiting on an
// upload that the server's HeadObject-based check (15MB) will reject anyway
// — that server check is the real backstop, this is just a faster no.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// presign -> PUT the bytes straight to R2 -> confirm. Identical for every
// entity type; only which presign/confirm endpoint to call differs, so
// that's passed in rather than exposing this generically from api.ts.
async function uploadPhoto<T>(
  file: File,
  presign: (contentType: string) => Promise<{ uploadUrl: string; key: string }>,
  confirm: (key: string) => Promise<T>,
): Promise<T> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(400, "File is too large (max 8MB).");
  }

  const { uploadUrl, key } = await presign(file.type);

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!putRes.ok) {
    throw new ApiError(putRes.status, "Upload to storage failed.");
  }

  return confirm(key);
}

export function uploadBuildingPhoto(id: string, file: File): Promise<{ building: Building }> {
  return uploadPhoto(
    file,
    (contentType) => api.presignBuildingPhoto(id, contentType),
    (key) => api.confirmBuildingPhoto(id, key),
  );
}

export function uploadRegionPhoto(id: string, file: File): Promise<{ region: Region }> {
  return uploadPhoto(
    file,
    (contentType) => api.presignRegionPhoto(id, contentType),
    (key) => api.confirmRegionPhoto(id, key),
  );
}

export function uploadNeighborhoodPhoto(
  id: string,
  file: File,
): Promise<{ neighborhood: Neighborhood }> {
  return uploadPhoto(
    file,
    (contentType) => api.presignNeighborhoodPhoto(id, contentType),
    (key) => api.confirmNeighborhoodPhoto(id, key),
  );
}

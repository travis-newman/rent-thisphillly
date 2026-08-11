const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? "Request failed");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export type Role = "admin" | "client" | "user";
export type AccountStatus = "active" | "suspended";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  status: AccountStatus;
}

export interface AdminUser {
  _id: string;
  email: string;
  role: Role;
  status: AccountStatus;
  createdAt: string;
}

export interface Photo {
  key: string;
  url: string;
  uploadedAt: string;
}

export interface Building {
  _id: string;
  photos: Photo[];
  address: string;
  zipCode: string | null;
  buildingName: string | null;
  leasingPhone: string | null;
  leasingEmail: string | null;
  website: string | null;
  websiteSource: string | null;
  contactConfidence: string | null;
  numberOfUnits: number | null;
  yearBuilt: number | null;
  yearBuiltSource: string | null;
  constructionEra: string | null;
  numberOfStories: number | null;
  totalLivableArea: number | null;
  marketValue: number | null;
  ownerBusinessName: string | null;
  parcelNumber: string | null;
  managedBy: string | null;
  source: string | null;
  activeListingsCount: number;
  unitMix: {
    studio: number | null;
    br1: number | null;
    br2: number | null;
    br3plus: number | null;
  };
  rent: { min: number | null; max: number | null };
  location?: { type: "Point"; coordinates: [number, number] };
  createdAt: string;
  updatedAt: string;
}

// The full set an admin may set (address required to create; everything
// else optional). A client's PATCH only ever needs a subset of these
// (leasingPhone/leasingEmail/website) — the server enforces which fields
// each role may actually change, this is just an authoring convenience.
export interface BuildingInput {
  address: string;
  zipCode?: string | null;
  buildingName?: string | null;
  leasingPhone?: string | null;
  leasingEmail?: string | null;
  website?: string | null;
  numberOfUnits?: number | null;
  yearBuilt?: number | null;
  numberOfStories?: number | null;
  totalLivableArea?: number | null;
  marketValue?: number | null;
  ownerBusinessName?: string | null;
  managedBy?: string | null;
}

export interface BuildingListParams {
  page?: number;
  limit?: number;
  zipCode?: string;
  q?: string;
  mine?: boolean;
  regionId?: string;
  neighborhoodId?: string;
}

export interface BuildingListResponse {
  buildings: Building[];
  total: number;
  page: number;
  limit: number;
}

export interface BuildingMapPoint {
  _id: string;
  buildingName: string | null;
  address: string;
  zipCode: string | null;
  numberOfUnits: number | null;
  lat: number;
  lon: number;
}

export interface Boundary {
  type: "Polygon";
  coordinates: number[][][];
}

// The human-authored form of a boundary — an ordered list of points (most
// often street intersections), each optionally labeled. `boundary` above is
// derived from these server-side and is what's used for geospatial queries.
export interface BoundaryPoint {
  label: string | null;
  lat: number;
  lon: number;
}

export interface BoundaryPointInput {
  label?: string | null;
  lat: number;
  lon: number;
}

export interface Region {
  _id: string;
  name: string;
  description: string | null;
  boundaryPoints: BoundaryPoint[];
  boundary: Boundary;
  photos: Photo[];
  // Only present on the list endpoint's response.
  neighborhoodCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Neighborhood {
  _id: string;
  name: string;
  description: string | null;
  regionId: string;
  boundaryPoints: BoundaryPoint[];
  boundary: Boundary;
  photos: Photo[];
  createdAt: string;
  updatedAt: string;
}

export interface AreaStats {
  buildingCount: number;
  totalUnits: number;
}

export interface BuildingDetailResponse {
  building: Building;
  region: Region | null;
  neighborhood: Neighborhood | null;
}

// Shared plumbing for the presign -> PUT (elsewhere) -> confirm -> delete
// photo flow, used by all three entity types below. Each entity keeps its
// own named methods (presignBuildingPhoto, etc.) rather than exposing these
// generically, to match this file's existing per-entity-method convention.
function presignEntityPhoto(pathPrefix: string, id: string, contentType: string) {
  return request<{ uploadUrl: string; key: string }>(`${pathPrefix}/${id}/photos/presign`, {
    method: "POST",
    body: JSON.stringify({ contentType }),
  });
}

function confirmEntityPhoto<T>(pathPrefix: string, id: string, key: string) {
  return request<T>(`${pathPrefix}/${id}/photos`, {
    method: "POST",
    body: JSON.stringify({ key }),
  });
}

function deleteEntityPhoto(pathPrefix: string, id: string, key: string) {
  return request<void>(`${pathPrefix}/${id}/photos?key=${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
}

export const api = {
  register: (email: string, password: string) =>
    request<{ message: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  verifyEmail: (token: string) => request<{ message: string }>(`/auth/verify-email/${token}`),

  login: (email: string, password: string) =>
    request<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<void>("/auth/logout", { method: "POST" }),

  me: () => request<{ user: AuthUser }>("/auth/me"),

  forgotPassword: (email: string) =>
    request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<{ message: string }>(`/auth/reset-password/${token}`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  listBuildings: (params: BuildingListParams = {}) => {
    const search = new URLSearchParams();
    if (params.page) search.set("page", String(params.page));
    if (params.limit) search.set("limit", String(params.limit));
    if (params.zipCode) search.set("zipCode", params.zipCode);
    if (params.q) search.set("q", params.q);
    if (params.mine) search.set("mine", "true");
    if (params.regionId) search.set("regionId", params.regionId);
    if (params.neighborhoodId) search.set("neighborhoodId", params.neighborhoodId);
    const qs = search.toString();
    return request<BuildingListResponse>(`/buildings${qs ? `?${qs}` : ""}`);
  },

  getBuilding: (id: string) => request<BuildingDetailResponse>(`/buildings/${id}`),

  getBuildingsMap: (
    params: {
      zipCode?: string;
      q?: string;
      polygon?: [number, number][];
      regionId?: string;
      neighborhoodId?: string;
    } = {},
  ) => {
    const search = new URLSearchParams();
    if (params.zipCode) search.set("zipCode", params.zipCode);
    if (params.q) search.set("q", params.q);
    if (params.polygon) search.set("polygon", JSON.stringify(params.polygon));
    if (params.regionId) search.set("regionId", params.regionId);
    if (params.neighborhoodId) search.set("neighborhoodId", params.neighborhoodId);
    const qs = search.toString();
    return request<{ buildings: BuildingMapPoint[] }>(`/buildings/map${qs ? `?${qs}` : ""}`);
  },

  createBuilding: (data: BuildingInput) =>
    request<{ building: Building }>("/buildings", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateBuilding: (id: string, data: Partial<BuildingInput>) =>
    request<{ building: Building }>(`/buildings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteBuilding: (id: string) => request<void>(`/buildings/${id}`, { method: "DELETE" }),

  listUsers: () => request<{ users: AdminUser[] }>("/users"),

  updateUser: (id: string, data: { role?: Role; status?: AccountStatus }) =>
    request<{ user: AdminUser }>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  listRegions: () => request<{ regions: Region[] }>("/regions"),

  getRegion: (id: string) =>
    request<{ region: Region; neighborhoods: Neighborhood[] } & AreaStats>(`/regions/${id}`),

  createRegion: (data: {
    name: string;
    description?: string | null;
    boundaryPoints: BoundaryPointInput[];
  }) => request<{ region: Region }>("/regions", { method: "POST", body: JSON.stringify(data) }),

  updateRegion: (
    id: string,
    data: { name?: string; description?: string | null; boundaryPoints?: BoundaryPointInput[] },
  ) =>
    request<{ region: Region }>(`/regions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteRegion: (id: string) => request<void>(`/regions/${id}`, { method: "DELETE" }),

  listNeighborhoods: (regionId?: string) =>
    request<{ neighborhoods: Neighborhood[] }>(
      `/neighborhoods${regionId ? `?regionId=${regionId}` : ""}`,
    ),

  getNeighborhood: (id: string) =>
    request<{ neighborhood: Neighborhood; region: Region | null } & AreaStats>(
      `/neighborhoods/${id}`,
    ),

  createNeighborhood: (data: {
    regionId: string;
    name: string;
    description?: string | null;
    boundaryPoints: BoundaryPointInput[];
  }) =>
    request<{ neighborhood: Neighborhood }>("/neighborhoods", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateNeighborhood: (
    id: string,
    data: {
      regionId?: string;
      name?: string;
      description?: string | null;
      boundaryPoints?: BoundaryPointInput[];
    },
  ) =>
    request<{ neighborhood: Neighborhood }>(`/neighborhoods/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteNeighborhood: (id: string) => request<void>(`/neighborhoods/${id}`, { method: "DELETE" }),

  geocodeSearch: (q: string) =>
    request<{ results: { label: string; lat: number; lon: number }[] }>(
      `/geocode/search?q=${encodeURIComponent(q)}`,
    ),

  presignBuildingPhoto: (id: string, contentType: string) =>
    presignEntityPhoto("/buildings", id, contentType),
  confirmBuildingPhoto: (id: string, key: string) =>
    confirmEntityPhoto<{ building: Building }>("/buildings", id, key),
  deleteBuildingPhoto: (id: string, key: string) => deleteEntityPhoto("/buildings", id, key),

  presignRegionPhoto: (id: string, contentType: string) =>
    presignEntityPhoto("/regions", id, contentType),
  confirmRegionPhoto: (id: string, key: string) =>
    confirmEntityPhoto<{ region: Region }>("/regions", id, key),
  deleteRegionPhoto: (id: string, key: string) => deleteEntityPhoto("/regions", id, key),

  presignNeighborhoodPhoto: (id: string, contentType: string) =>
    presignEntityPhoto("/neighborhoods", id, contentType),
  confirmNeighborhoodPhoto: (id: string, key: string) =>
    confirmEntityPhoto<{ neighborhood: Neighborhood }>("/neighborhoods", id, key),
  deleteNeighborhoodPhoto: (id: string, key: string) =>
    deleteEntityPhoto("/neighborhoods", id, key),
};

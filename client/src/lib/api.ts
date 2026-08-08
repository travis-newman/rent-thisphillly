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

export interface Building {
  _id: string;
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
  unitMix: { studio: number | null; br1: number | null; br2: number | null; br3plus: number | null };
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
}

export interface BuildingListResponse {
  buildings: Building[];
  total: number;
  page: number;
  limit: number;
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
    const qs = search.toString();
    return request<BuildingListResponse>(`/buildings${qs ? `?${qs}` : ""}`);
  },

  getBuilding: (id: string) => request<{ building: Building }>(`/buildings/${id}`),

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
};

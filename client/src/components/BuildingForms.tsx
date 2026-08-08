import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type AdminUser, type Building, type BuildingInput } from "../lib/api";

// This file intentionally exports helpers/hooks (getWebsiteHostname,
// emptyAdminForm, toAdminForm, useClientList) alongside the form components
// so Buildings.tsx and BuildingDetail.tsx can share one editing
// implementation — fast refresh still works fine, it just can't verify
// that statically.
/* eslint-disable react-refresh/only-export-components */

// A handful of source rows have a literal "https://null" website value from
// an upstream data bug — treat that hostname as absent rather than show it.
export function getWebsiteHostname(website: string | null): string | null {
  if (!website) return null;
  try {
    const hostname = new URL(website).hostname.replace(/^www\./, "");
    return hostname === "null" ? null : hostname;
  } catch {
    return null;
  }
}

function numToStr(n: number | null): string {
  return n == null ? "" : String(n);
}

function strToNum(s: string): number | null {
  const trimmed = s.trim();
  return trimmed === "" ? null : Number(trimmed);
}

interface ClientFormValues {
  leasingPhone: string;
  leasingEmail: string;
  website: string;
}

export function ClientBuildingForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: ClientFormValues;
  onSubmit: (input: BuildingInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({
        address: "", // ignored by the server for client updates
        leasingPhone: values.leasingPhone.trim() || null,
        leasingEmail: values.leasingEmail.trim() || null,
        website: values.website.trim() || null,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder="Leasing phone"
        value={values.leasingPhone}
        onChange={(e) => setValues({ ...values, leasingPhone: e.target.value })}
      />
      <input
        placeholder="Leasing email"
        type="email"
        value={values.leasingEmail}
        onChange={(e) => setValues({ ...values, leasingEmail: e.target.value })}
      />
      <input
        placeholder="Website"
        type="url"
        value={values.website}
        onChange={(e) => setValues({ ...values, website: e.target.value })}
      />
      <button type="submit" disabled={isSaving}>
        Save
      </button>
      <button type="button" onClick={onCancel} disabled={isSaving}>
        Cancel
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

interface AdminFormValues {
  address: string;
  buildingName: string;
  website: string;
  leasingPhone: string;
  leasingEmail: string;
  numberOfUnits: string;
  yearBuilt: string;
  numberOfStories: string;
  totalLivableArea: string;
  marketValue: string;
  ownerBusinessName: string;
  managedBy: string;
}

export function AdminBuildingForm({
  initial,
  submitLabel,
  clients,
  onSubmit,
  onCancel,
}: {
  initial: AdminFormValues;
  submitLabel: string;
  clients: AdminUser[];
  onSubmit: (input: BuildingInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof AdminFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({
        address: values.address.trim(),
        buildingName: values.buildingName.trim() || null,
        website: values.website.trim() || null,
        leasingPhone: values.leasingPhone.trim() || null,
        leasingEmail: values.leasingEmail.trim() || null,
        numberOfUnits: strToNum(values.numberOfUnits),
        yearBuilt: strToNum(values.yearBuilt),
        numberOfStories: strToNum(values.numberOfStories),
        totalLivableArea: strToNum(values.totalLivableArea),
        marketValue: strToNum(values.marketValue),
        ownerBusinessName: values.ownerBusinessName.trim() || null,
        managedBy: values.managedBy || null,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder="Address"
        value={values.address}
        onChange={(e) => set("address", e.target.value)}
        required
      />
      <input
        placeholder="Building name"
        value={values.buildingName}
        onChange={(e) => set("buildingName", e.target.value)}
      />
      <input
        placeholder="Website"
        type="url"
        value={values.website}
        onChange={(e) => set("website", e.target.value)}
      />
      <input
        placeholder="Leasing phone"
        value={values.leasingPhone}
        onChange={(e) => set("leasingPhone", e.target.value)}
      />
      <input
        placeholder="Leasing email"
        type="email"
        value={values.leasingEmail}
        onChange={(e) => set("leasingEmail", e.target.value)}
      />
      <input
        placeholder="Units"
        type="number"
        value={values.numberOfUnits}
        onChange={(e) => set("numberOfUnits", e.target.value)}
      />
      <input
        placeholder="Year built"
        type="number"
        value={values.yearBuilt}
        onChange={(e) => set("yearBuilt", e.target.value)}
      />
      <input
        placeholder="Stories"
        type="number"
        value={values.numberOfStories}
        onChange={(e) => set("numberOfStories", e.target.value)}
      />
      <input
        placeholder="Total livable area (sq ft)"
        type="number"
        value={values.totalLivableArea}
        onChange={(e) => set("totalLivableArea", e.target.value)}
      />
      <input
        placeholder="Market value ($)"
        type="number"
        value={values.marketValue}
        onChange={(e) => set("marketValue", e.target.value)}
      />
      <input
        placeholder="Owner business name"
        value={values.ownerBusinessName}
        onChange={(e) => set("ownerBusinessName", e.target.value)}
      />
      <select value={values.managedBy} onChange={(e) => set("managedBy", e.target.value)}>
        <option value="">No client assigned</option>
        {clients.map((client) => (
          <option key={client._id} value={client._id}>
            {client.email}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isSaving}>
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={isSaving}>
          Cancel
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export const emptyAdminForm: AdminFormValues = {
  address: "",
  buildingName: "",
  website: "",
  leasingPhone: "",
  leasingEmail: "",
  numberOfUnits: "",
  yearBuilt: "",
  numberOfStories: "",
  totalLivableArea: "",
  marketValue: "",
  ownerBusinessName: "",
  managedBy: "",
};

export function toAdminForm(building: Building): AdminFormValues {
  return {
    address: building.address,
    buildingName: building.buildingName ?? "",
    website: building.website ?? "",
    leasingPhone: building.leasingPhone ?? "",
    leasingEmail: building.leasingEmail ?? "",
    numberOfUnits: numToStr(building.numberOfUnits),
    yearBuilt: numToStr(building.yearBuilt),
    numberOfStories: numToStr(building.numberOfStories),
    totalLivableArea: numToStr(building.totalLivableArea),
    marketValue: numToStr(building.marketValue),
    ownerBusinessName: building.ownerBusinessName ?? "",
    managedBy: building.managedBy ?? "",
  };
}

export function useClientList(enabled: boolean): AdminUser[] {
  const [clients, setClients] = useState<AdminUser[]>([]);

  useEffect(() => {
    if (!enabled) return;
    api
      .listUsers()
      .then((res) => setClients(res.users.filter((u) => u.role === "client")))
      .catch(() => setClients([]));
  }, [enabled]);

  return clients;
}

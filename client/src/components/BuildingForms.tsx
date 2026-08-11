import { Button, Group, NumberInput, Select, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useState } from "react";
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

function numToNumOrEmpty(n: number | null): number | "" {
  return n == null ? "" : n;
}

function numOrEmptyToNum(n: number | ""): number | null {
  return n === "" ? null : n;
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ initialValues: initial });

  async function handleSubmit(values: ClientFormValues) {
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
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack maw={400}>
        <TextInput label="Leasing phone" {...form.getInputProps("leasingPhone")} />
        <TextInput
          label="Leasing email"
          type="email"
          {...form.getInputProps("leasingEmail")}
        />
        <TextInput label="Website" type="url" {...form.getInputProps("website")} />
        <Group>
          <Button type="submit" loading={isSaving}>
            Save
          </Button>
          <Button type="button" variant="default" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        </Group>
        {error && <p role="alert">{error}</p>}
      </Stack>
    </form>
  );
}

interface AdminFormValues {
  address: string;
  buildingName: string;
  website: string;
  leasingPhone: string;
  leasingEmail: string;
  numberOfUnits: number | "";
  yearBuilt: number | "";
  numberOfStories: number | "";
  totalLivableArea: number | "";
  marketValue: number | "";
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ initialValues: initial });

  async function handleSubmit(values: AdminFormValues) {
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({
        address: values.address.trim(),
        buildingName: values.buildingName.trim() || null,
        website: values.website.trim() || null,
        leasingPhone: values.leasingPhone.trim() || null,
        leasingEmail: values.leasingEmail.trim() || null,
        numberOfUnits: numOrEmptyToNum(values.numberOfUnits),
        yearBuilt: numOrEmptyToNum(values.yearBuilt),
        numberOfStories: numOrEmptyToNum(values.numberOfStories),
        totalLivableArea: numOrEmptyToNum(values.totalLivableArea),
        marketValue: numOrEmptyToNum(values.marketValue),
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
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack maw={480}>
        <TextInput label="Address" required {...form.getInputProps("address")} />
        <TextInput label="Building name" {...form.getInputProps("buildingName")} />
        <TextInput label="Website" type="url" {...form.getInputProps("website")} />
        <TextInput label="Leasing phone" {...form.getInputProps("leasingPhone")} />
        <TextInput label="Leasing email" type="email" {...form.getInputProps("leasingEmail")} />
        <NumberInput label="Units" {...form.getInputProps("numberOfUnits")} />
        <NumberInput label="Year built" {...form.getInputProps("yearBuilt")} />
        <NumberInput label="Stories" {...form.getInputProps("numberOfStories")} />
        <NumberInput
          label="Total livable area (sq ft)"
          {...form.getInputProps("totalLivableArea")}
        />
        <NumberInput label="Market value ($)" {...form.getInputProps("marketValue")} />
        <TextInput label="Owner business name" {...form.getInputProps("ownerBusinessName")} />
        <Select
          label="Managed by"
          placeholder="No client assigned"
          data={clients.map((client) => ({ value: client._id, label: client.email }))}
          clearable
          {...form.getInputProps("managedBy")}
        />

        <Group>
          <Button type="submit" loading={isSaving}>
            {submitLabel}
          </Button>
          {onCancel && (
            <Button type="button" variant="default" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
          )}
        </Group>
        {error && <p role="alert">{error}</p>}
      </Stack>
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
    numberOfUnits: numToNumOrEmpty(building.numberOfUnits),
    yearBuilt: numToNumOrEmpty(building.yearBuilt),
    numberOfStories: numToNumOrEmpty(building.numberOfStories),
    totalLivableArea: numToNumOrEmpty(building.totalLivableArea),
    marketValue: numToNumOrEmpty(building.marketValue),
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

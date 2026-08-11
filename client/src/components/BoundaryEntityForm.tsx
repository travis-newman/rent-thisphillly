import { Button, Group, Stack, Textarea, TextInput } from "@mantine/core";
import { useState, type FormEvent } from "react";
import { ApiError, type BoundaryPointInput } from "../lib/api";
import { BoundaryPointsEditor } from "./BoundaryPointsEditor";

export interface BoundaryEntityFormValues {
  name: string;
  description: string | null;
  boundaryPoints: BoundaryPointInput[];
}

// Shared name + description + boundary-points form for creating or editing
// a region or neighborhood.
export function BoundaryEntityForm({
  initialName = "",
  initialDescription = "",
  initialBoundaryPoints = [],
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialDescription?: string;
  initialBoundaryPoints?: BoundaryPointInput[];
  submitLabel: string;
  onSubmit: (values: BoundaryEntityFormValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [boundaryPoints, setBoundaryPoints] = useState<BoundaryPointInput[]>(initialBoundaryPoints);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && boundaryPoints.length >= 3;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        boundaryPoints,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack maw={480}>
        <TextInput
          label="Name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <Textarea
          label="Description"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          rows={3}
        />

        <BoundaryPointsEditor initialPoints={initialBoundaryPoints} onChange={setBoundaryPoints} />

        <Group>
          <Button type="submit" disabled={!canSubmit} loading={isSaving}>
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

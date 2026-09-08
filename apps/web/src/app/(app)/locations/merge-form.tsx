"use client";

import { useState } from "react";

export type MergeLocationOption = {
  id: string;
  pathLabel: string;
};

export type MergeLotPreview = {
  itemName: string;
  sourceQty: number;
  targetQty: number;
  mergedQty: number;
};

export type MergePreviewInput = {
  householdId: string;
  sourceLocationId: string;
  targetLocationId: string;
};

export type PreviewMergeFn = (input: MergePreviewInput) => Promise<
  { ok: true; lots: MergeLotPreview[] } | { ok: false }
>;

export type ApplyMergeFn = (input: MergePreviewInput) => Promise<{ ok: true } | { ok: false }>;

export function MergeForm({
  householdId,
  locations,
  previewMerge,
  applyMerge,
}: {
  householdId: string;
  locations: MergeLocationOption[];
  previewMerge: PreviewMergeFn;
  applyMerge: ApplyMergeFn;
}) {
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [targetLocationId, setTargetLocationId] = useState("");
  const [lots, setLots] = useState<MergeLotPreview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPreview() {
    setError(null);
    const result = await previewMerge({
      householdId,
      sourceLocationId,
      targetLocationId,
    });
    if (!result.ok) {
      setLots(null);
      setError("Those places can't be merged.");
      return;
    }
    setLots(result.lots);
  }

  async function onConfirm() {
    setError(null);
    const result = await applyMerge({
      householdId,
      sourceLocationId,
      targetLocationId,
    });
    if (!result.ok) {
      setError("Those places can't be merged.");
      return;
    }
    setLots(null);
  }

  return (
    <div>
      <label htmlFor="merge-source">Source</label>
      <select
        id="merge-source"
        value={sourceLocationId}
        onChange={(event) => {
          setSourceLocationId(event.target.value);
          setLots(null);
        }}
      >
        <option value="">Select source</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.pathLabel}
          </option>
        ))}
      </select>
      <label htmlFor="merge-target">Target</label>
      <select
        id="merge-target"
        value={targetLocationId}
        onChange={(event) => {
          setTargetLocationId(event.target.value);
          setLots(null);
        }}
      >
        <option value="">Select target</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.pathLabel}
          </option>
        ))}
      </select>
      <button type="button" onClick={onPreview}>
        Preview
      </button>
      {error ? <p>{error}</p> : null}
      {lots
        ? lots.map((lot) => (
            <p key={`${lot.itemName}-${lot.mergedQty}`}>
              {lot.itemName} {lot.mergedQty}
            </p>
          ))
        : null}
      {lots ? (
        <button type="button" onClick={onConfirm}>
          Confirm merge
        </button>
      ) : null}
    </div>
  );
}

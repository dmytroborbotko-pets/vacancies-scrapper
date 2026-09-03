"use client";

import { useId } from "react";
import type { SearchScope } from "@/generated/prisma/client";

// Re-exported as `Scope` so callers don't hand-roll this union themselves
// (that previously drifted out of sync with the Prisma enum). Importing
// straight from the generated client avoids an extra hop through ingest.ts's
// re-export and doesn't depend on that re-export surviving.
export type Scope = SearchScope;

export const SCOPE_LABELS: Record<Scope, string> = {
  DOU: "Тільки DOU",
  DJINNI: "Тільки Djinni",
  BOTH: "DOU + Djinni",
  EVERYWHERE: "По всьому інтернету",
};

export const ALL_CV_PROFILES = "all";

export function SearchParamsFields({
  cvProfiles,
  cvProfileId,
  onCvProfileIdChange,
  scope,
  onScopeChange,
  requireReservation,
  onRequireReservationChange,
}: {
  cvProfiles: { id: string; label: string }[];
  cvProfileId: string;
  onCvProfileIdChange: (id: string) => void;
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  requireReservation: boolean;
  onRequireReservationChange: (value: boolean) => void;
}) {
  const scopeGroupName = useId();

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-500">CV</span>
        <select
          value={cvProfileId}
          onChange={(e) => onCvProfileIdChange(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-base dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value={ALL_CV_PROFILES}>Всі</option>
          {cvProfiles.map((cv) => (
            <option key={cv.id} value={cv.id}>
              {cv.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm text-zinc-500">Де шукати</legend>
        {(Object.entries(SCOPE_LABELS) as [Scope, string][]).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-base">
            <input
              type="radio"
              name={scopeGroupName}
              value={value}
              checked={scope === value}
              onChange={() => onScopeChange(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <label className="flex items-center gap-2 text-base">
        <input
          type="checkbox"
          checked={requireReservation}
          onChange={(e) => onRequireReservationChange(e.target.checked)}
        />
        Лише вакансії з бронюванням від мобілізації
      </label>
    </div>
  );
}

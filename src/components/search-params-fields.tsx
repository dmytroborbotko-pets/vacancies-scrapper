"use client";

import type { SearchScope } from "@/generated/prisma/client";

// Re-exported as `Scope` (rather than requiring every caller to import
// `SearchScope` from the generated client directly) so this stays the one
// place the search-run modal (Task 11) and schedule modal (Task 12) get
// their scope type from — both hand-rolling this union previously drifted
// out of sync with the Prisma enum (see ingest.ts's SearchScope and
// scheduling.ts's ScheduleInterval, both fixed the same way). Importing
// only the type keeps this client component from pulling in `@/lib/ingest`
// (which imports server-only modules like `@/lib/prisma`) — `import type`
// is erased entirely at compile time, so nothing from the generated
// client's module graph reaches the browser bundle.
export type Scope = SearchScope;

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "DOU", label: "Тільки DOU" },
  { value: "DJINNI", label: "Тільки Djinni" },
  { value: "BOTH", label: "DOU + Djinni" },
  { value: "EVERYWHERE", label: "По всьому інтернету" },
];

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
  return (
    <div className="flex flex-col gap-4 text-left">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-500">CV</span>
        <select
          value={cvProfileId}
          onChange={(e) => onCvProfileIdChange(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-base dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="all">Всі</option>
          {cvProfiles.map((cv) => (
            <option key={cv.id} value={cv.id}>
              {cv.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm text-zinc-500">Де шукати</legend>
        {SCOPE_OPTIONS.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-base">
            <input
              type="radio"
              name="scope"
              value={option.value}
              checked={scope === option.value}
              onChange={() => onScopeChange(option.value)}
            />
            {option.label}
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

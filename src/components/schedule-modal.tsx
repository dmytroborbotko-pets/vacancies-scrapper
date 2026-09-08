"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchParamsFields } from "@/components/search-params-fields";
import type { Scope } from "@/lib/search-constants";
import { createScheduledSearch, updateScheduledSearch } from "@/app/settings/schedule-actions";
import { INTERVAL_LABELS, SCHEDULE_ERROR_LABELS, type ScheduleInterval } from "@/lib/scheduling";

export type ScheduleModalInitial = {
  id?: string; // present = edit mode, absent = create mode
  cvProfileId: string; // ALL_CV_PROFILES (see @/lib/search-constants) or a CV id
  scope: Scope;
  requireReservation: boolean;
  interval: ScheduleInterval;
};

// IMPORTANT: local state is seeded from `initial` exactly once and never
// resynced. Callers MUST either conditionally render this component
// (`{open && <ScheduleModal ... />}`, unmounting between different
// `initial` values) or pass `key={initial.id ?? "new"}` to force a remount
// — do NOT keep one instance mounted across different `initial` props
// while toggling `open`, or the form will silently show stale data.
export function ScheduleModal({
  open,
  onClose,
  cvProfiles,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  cvProfiles: { id: string; label: string }[];
  initial: ScheduleModalInitial;
}) {
  const router = useRouter();
  const intervalGroupName = useId();

  const [cvProfileId, setCvProfileId] = useState(initial.cvProfileId);
  const [scope, setScope] = useState<Scope>(initial.scope);
  const [requireReservation, setRequireReservation] = useState(initial.requireReservation);
  const [intervalValue, setIntervalValue] = useState<ScheduleInterval>(initial.interval);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isEdit = Boolean(initial.id);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("cvProfileId", cvProfileId);
      formData.set("scope", scope);
      formData.set("requireReservation", requireReservation ? "true" : "false");
      formData.set("interval", intervalValue);
      if (initial.id) formData.set("id", initial.id);

      const result = initial.id ? await updateScheduledSearch(formData) : await createScheduledSearch(formData);

      if (!result.ok) {
        setError(`Не вдалося зберегти: ${SCHEDULE_ERROR_LABELS[result.reason]}`);
        return;
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Невідома помилка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="text-xl font-semibold">
          {isEdit ? "Редагувати запланований пошук" : "Запланувати автоматичний пошук"}
        </h2>

        <SearchParamsFields
          cvProfiles={cvProfiles}
          cvProfileId={cvProfileId}
          onCvProfileIdChange={setCvProfileId}
          scope={scope}
          onScopeChange={setScope}
          requireReservation={requireReservation}
          onRequireReservationChange={setRequireReservation}
        />

        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm text-zinc-500">Як часто</legend>
          {(Object.entries(INTERVAL_LABELS) as [ScheduleInterval, string][]).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-base">
              <input
                type="radio"
                name={intervalGroupName}
                value={value}
                checked={intervalValue === value}
                onChange={() => setIntervalValue(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        {error && <p className="text-base text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-zinc-300 px-4 py-2 text-base font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-zinc-900 px-4 py-2 text-base font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isEdit ? "Зберегти" : "Запланувати"}
          </button>
        </div>
      </div>
    </div>
  );
}

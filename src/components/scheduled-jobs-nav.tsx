"use client";

import { useState } from "react";
import { ScheduleModal, type ScheduleModalInitial } from "@/components/schedule-modal";
import { SubmitButton } from "@/components/submit-button";
import { toggleScheduledSearchPaused, deleteScheduledSearch } from "@/app/settings/schedule-actions";
import { ALL_CV_PROFILES, SCOPE_LABELS, type Scope } from "@/lib/search-constants";
import { INTERVAL_LABELS, type ScheduleInterval } from "@/lib/scheduling";

export type ScheduledJob = {
  id: string;
  cvProfileId: string | null;
  cvProfileLabel: string | null;
  scope: Scope;
  requireReservation: boolean;
  interval: ScheduleInterval;
  paused: boolean;
  nextRunAt: string; // ISO
};

function editInitial(job: ScheduledJob): ScheduleModalInitial {
  return {
    id: job.id,
    cvProfileId: job.cvProfileId ?? ALL_CV_PROFILES,
    scope: job.scope,
    requireReservation: job.requireReservation,
    interval: job.interval,
  };
}

export function ScheduledJobsNav({
  jobs,
  cvProfiles,
  className,
}: {
  jobs: ScheduledJob[];
  cvProfiles: { id: string; label: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledJob | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70"
        }
      >
        Заплановані пошуки
        {jobs.length > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-600 px-1 text-xs font-semibold text-white dark:bg-amber-500 dark:text-amber-950">
            {jobs.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">Заплановані пошуки</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                aria-label="Закрити"
              >
                ✕
              </button>
            </div>

            {jobs.length === 0 ? (
              <p className="text-base text-zinc-500">Ще немає запланованих пошуків.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {jobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 text-base dark:border-zinc-800"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{job.cvProfileLabel ?? "Всі CV"}</div>
                      <div className="text-sm text-zinc-500">
                        {SCOPE_LABELS[job.scope]} · {INTERVAL_LABELS[job.interval]}
                        {job.requireReservation && " · лише з бронюванням"}
                        {job.paused && " · на паузі"}
                      </div>
                      <div className="text-sm text-zinc-500">
                        Наступний запуск: {new Date(job.nextRunAt).toLocaleDateString("uk-UA")}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setEditing(job)}
                        className="text-sm text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                      >
                        Редагувати
                      </button>
                      <form action={toggleScheduledSearchPaused}>
                        <input type="hidden" name="id" value={job.id} />
                        <input type="hidden" name="nextPaused" value={(!job.paused).toString()} />
                        <SubmitButton
                          pendingText="…"
                          className="text-sm text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                        >
                          {job.paused ? "Відновити" : "Пауза"}
                        </SubmitButton>
                      </form>
                      <form action={deleteScheduledSearch}>
                        <input type="hidden" name="id" value={job.id} />
                        <SubmitButton
                          pendingText="Видаляю…"
                          className="text-sm text-red-500 underline hover:text-red-700 dark:hover:text-red-400"
                        >
                          Видалити
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {editing && (
        <ScheduleModal
          key={editing.id}
          open
          onClose={() => setEditing(null)}
          cvProfiles={cvProfiles}
          initial={editInitial(editing)}
        />
      )}
    </>
  );
}

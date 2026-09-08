"use client";

import { useState } from "react";
import { ScheduleModal } from "@/components/schedule-modal";
import { ALL_CV_PROFILES } from "@/components/search-params-fields";

export function CreateScheduleButton({
  cvProfiles,
  className,
}: {
  cvProfiles: { id: string; label: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "rounded-md border border-zinc-300 px-3 py-1.5 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        }
      >
        Запланувати автоматичне виконання
      </button>
      {open && (
        <ScheduleModal
          open={open}
          onClose={() => setOpen(false)}
          cvProfiles={cvProfiles}
          initial={{ cvProfileId: ALL_CV_PROFILES, scope: "BOTH", requireReservation: false, interval: "DAILY" }}
        />
      )}
    </>
  );
}

"use client";

import { useTaskStatus } from "@/components/task-status";
import { Spinner } from "@/components/spinner";

export function RunTaskButton({
  href,
  label,
  runningLabel,
  className,
  modal = false,
}: {
  href: string;
  label: string;
  runningLabel: string;
  className?: string;
  // Full-screen blocking overlay instead of just the bottom-corner banner
  // — for a trigger that may kick off a slow run (e.g. "Інші" mode's
  // web-search leg), so it's unmistakable that something is in progress.
  modal?: boolean;
}) {
  const { runningLabel: activeLabel, run } = useTaskStatus();
  const isThisRunning = activeLabel === runningLabel;
  const disabled = activeLabel !== null;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => run(runningLabel, href)}
        className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {isThisRunning ? runningLabel : label}
      </button>

      {modal && isThisRunning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex w-full max-w-md flex-col items-center gap-4 px-6 text-center">
            <Spinner className="h-8 w-8 text-zinc-300" />
            <p className="text-base font-medium text-zinc-300">{runningLabel}</p>
          </div>
        </div>
      )}
    </>
  );
}

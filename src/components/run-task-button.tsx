"use client";

import { useTaskStatus } from "@/components/task-status";

export function RunTaskButton({
  href,
  label,
  runningLabel,
  className,
}: {
  href: string;
  label: string;
  runningLabel: string;
  className?: string;
}) {
  const { runningLabel: activeLabel, run } = useTaskStatus();
  const isThisRunning = activeLabel === runningLabel;
  const disabled = activeLabel !== null;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => run(runningLabel, href)}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {isThisRunning ? runningLabel : label}
    </button>
  );
}

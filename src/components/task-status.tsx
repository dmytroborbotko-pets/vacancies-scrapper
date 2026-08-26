"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/spinner";

type TaskStatusContextValue = {
  runningLabel: string | null;
  run: (label: string, href: string) => Promise<void>;
};

const TaskStatusContext = createContext<TaskStatusContextValue | null>(null);

// Mounted once in the root layout, so it survives client-side navigation
// between pages — a background task (search/matching run) keeps its
// loading state visible no matter which page the user is on, and
// router.refresh() picks up new data on whichever page they land on once
// it finishes (e.g. new vacancies showing up on /vacancies).
export function TaskStatusProvider({ children }: { children: React.ReactNode }) {
  const [runningLabel, setRunningLabel] = useState<string | null>(null);
  const router = useRouter();

  const run = useCallback(
    async (label: string, href: string) => {
      setRunningLabel(label);
      try {
        await fetch(href, { method: "GET" });
      } catch {
        // Network/server error — the banner just disappears; the trigger
        // button itself has no other error UI to report to right now.
      } finally {
        setRunningLabel(null);
        router.refresh();
      }
    },
    [router],
  );

  return (
    <TaskStatusContext.Provider value={{ runningLabel, run }}>
      {children}
      {runningLabel && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <Spinner className="h-4 w-4 text-zinc-500" />
          <span>{runningLabel}</span>
        </div>
      )}
    </TaskStatusContext.Provider>
  );
}

export function useTaskStatus() {
  const ctx = useContext(TaskStatusContext);
  if (!ctx) {
    throw new Error("useTaskStatus must be used within TaskStatusProvider");
  }
  return ctx;
}

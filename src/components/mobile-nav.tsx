"use client";

import { useState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { ScheduledJobsNav, type ScheduledJob } from "@/components/scheduled-jobs-nav";

type NavItem = { href: string; label: string };

export function MobileNav({
  navItems,
  userEmail,
  logoutAction,
  scheduledJobs,
  cvProfiles,
}: {
  navItems: NavItem[];
  userEmail: string;
  logoutAction: () => void;
  scheduledJobs: ScheduledJob[];
  cvProfiles: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Закрити меню" : "Відкрити меню"}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
      >
        {open ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>

      {/* No z-index on this panel: a positioned z-index would create a new
          stacking context that traps descendant fixed-position children
          (e.g. the scheduled-jobs modal's z-[100] overlay) beneath other
          page-level fixed elements outside it (e.g. task-status.tsx's z-50
          toast). `absolute` alone still paints above sibling static content
          below it in DOM order, which is all this dropdown needs relative
          to the header/page. */}
      {open && (
        <div className="absolute inset-x-0 top-full border-b border-zinc-200 bg-zinc-50 px-4 py-4 shadow-sm sm:px-6 dark:border-zinc-800 dark:bg-black">
          <div className="flex flex-col gap-3 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-1">
              <ScheduledJobsNav jobs={scheduledJobs} cvProfiles={cvProfiles} />
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                {userEmail}
              </Link>
              <form action={logoutAction}>
                <SubmitButton
                  pendingText="Виходжу…"
                  className="text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Вийти
                </SubmitButton>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

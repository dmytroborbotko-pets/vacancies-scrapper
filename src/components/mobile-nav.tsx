"use client";

import { useState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";

type NavItem = { href: string; label: string };

export function MobileNav({
  navItems,
  userEmail,
  logoutAction,
}: {
  navItems: NavItem[];
  userEmail: string;
  logoutAction: () => void;
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

      {open && (
        <div className="absolute inset-x-0 top-full z-10 border-b border-zinc-200 bg-zinc-50 px-4 py-4 shadow-sm sm:px-6 dark:border-zinc-800 dark:bg-black">
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

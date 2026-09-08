import type { Metadata } from "next";
import { Mulish } from "next/font/google";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MobileNav } from "@/components/mobile-nav";
import { SubmitButton } from "@/components/submit-button";
import { ScheduledJobsNav, type ScheduledJob } from "@/components/scheduled-jobs-nav";
import "./globals.css";

const mulish = Mulish({
  variable: "--font-mulish",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: "variable",
});

export const metadata: Metadata = {
  title: "AI Job Searcher",
  description: "Пошук вакансій з AI-матчингом та генерацією мотиваційних листів",
};

const navItems = [
  { href: "/vacancies", label: "Вакансії" },
  { href: "/to-apply", label: "До подачі" },
  { href: "/applied", label: "Подався" },
  { href: "/settings", label: "Налаштування" },
];

async function logout() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  // Can't use requireUserId() here: the layout renders for logged-out
  // visitors too and must degrade to empty lists rather than throw. But a
  // stale JWT (tokens live up to 400 days) predating the id-assignment
  // callback in auth.ts can carry a session with no user.id — binding it
  // once here and gating both queries on `userId` (never on `session?.user`)
  // ensures a missing id short-circuits to `[]` instead of reaching Prisma,
  // where `where: { userId: undefined }` would omit the filter entirely and
  // leak every user's rows. Do not "simplify" this back to `session?.user`.
  const userId = session?.user?.id;

  const cvProfiles = userId
    ? await prisma.cvProfile.findMany({
        where: { userId },
        select: { id: true, label: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const scheduledJobs: ScheduledJob[] = userId
    ? (
        await prisma.scheduledSearch.findMany({
          where: { userId },
          include: { cvProfile: { select: { label: true } } },
          orderBy: { createdAt: "desc" },
        })
      ).map((row) => ({
        id: row.id,
        cvProfileId: row.cvProfileId,
        cvProfileLabel: row.cvProfile?.label ?? null,
        scope: row.scope,
        requireReservation: row.requireReservation,
        interval: row.interval,
        paused: row.paused,
        nextRunAt: row.nextRunAt.toISOString(),
      }))
    : [];

  return (
    <html
      lang="uk"
      className={`${mulish.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
        <header className="relative border-b border-zinc-200 dark:border-zinc-800">
          <nav className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4 sm:px-6 md:gap-6 lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl">
            <Link href="/" className="font-semibold">
              AI Job Searcher
            </Link>
            {session?.user && (
              <>
                <div className="hidden flex-1 gap-4 text-sm md:flex">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
                <div className="ml-auto hidden items-center gap-3 text-sm md:flex">
                  <ScheduledJobsNav jobs={scheduledJobs} cvProfiles={cvProfiles} />
                  <Link
                    href="/account"
                    className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {session.user.email}
                  </Link>
                  <form action={logout}>
                    <SubmitButton
                      pendingText="Виходжу…"
                      className="text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      Вийти
                    </SubmitButton>
                  </form>
                </div>
                <div className="ml-auto md:hidden">
                  <MobileNav
                    navItems={navItems}
                    userEmail={session.user.email ?? ""}
                    logoutAction={logout}
                    scheduledJobs={scheduledJobs}
                    cvProfiles={cvProfiles}
                  />
                </div>
              </>
            )}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl">
          {children}
        </main>
      </body>
    </html>
  );
}

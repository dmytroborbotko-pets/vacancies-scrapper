import type { Metadata } from "next";
import { Handjet } from "next/font/google";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { MobileNav } from "@/components/mobile-nav";
import { TaskStatusProvider } from "@/components/task-status";
import { SubmitButton } from "@/components/submit-button";
import "./globals.css";

const handjet = Handjet({
  variable: "--font-handjet",
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

  return (
    <html
      lang="uk"
      className={`${handjet.variable} h-full antialiased`}
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
                  />
                </div>
              </>
            )}
          </nav>
        </header>
        <TaskStatusProvider>
          <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl">
            {children}
          </main>
        </TaskStatusProvider>
      </body>
    </html>
  );
}

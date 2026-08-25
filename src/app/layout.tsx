import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
            <Link href="/" className="font-semibold">
              AI Job Searcher
            </Link>
            {session?.user && (
              <>
                <div className="flex flex-1 gap-4 text-sm">
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
                <div className="flex items-center gap-3 text-sm">
                  <Link
                    href="/account"
                    className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {session.user.email}
                  </Link>
                  <form action={logout}>
                    <button
                      type="submit"
                      className="text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      Вийти
                    </button>
                  </form>
                </div>
              </>
            )}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}

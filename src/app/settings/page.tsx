import { prisma } from "@/lib/prisma";
import type { SearchConfig, CvProfile } from "@/generated/prisma/client";

export default async function SettingsPage() {
  const [searchConfigs, cvProfiles] = await Promise.all([
    prisma.searchConfig.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.cvProfile.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Ключові слова пошуку</h1>
        {searchConfigs.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Ще не додано жодного пошукового запиту.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {searchConfigs.map((config: SearchConfig) => (
              <li
                key={config.id}
                className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                {config.keywords} · {config.source}
                {!config.active && " · вимкнено"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold">CV-профілі</h2>
        {cvProfiles.length === 0 ? (
          <p className="text-sm text-zinc-500">Ще не завантажено жодного CV.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cvProfiles.map((profile: CvProfile) => (
              <li
                key={profile.id}
                className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                {profile.label}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

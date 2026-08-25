import { prisma } from "@/lib/prisma";
import type { Vacancy } from "@/generated/prisma/client";
import { requireUserId } from "@/lib/session";

export default async function VacanciesPage() {
  const userId = await requireUserId();
  const cvProfiles = await prisma.cvProfile.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      searchConfigs: {
        include: {
          discoveries: {
            include: { vacancy: true },
          },
        },
      },
      matches: true,
    },
  });

  const groups = cvProfiles.map((profile) => {
    const vacancyById = new Map<string, Vacancy>();
    for (const config of profile.searchConfigs) {
      for (const discovery of config.discoveries) {
        vacancyById.set(discovery.vacancy.id, discovery.vacancy);
      }
    }
    const scoreByVacancyId = new Map<string, number>();
    const dismissedVacancyIds = new Set<string>();
    for (const match of profile.matches) {
      scoreByVacancyId.set(match.vacancyId, match.score);
      if (match.status === "DISMISSED") dismissedVacancyIds.add(match.vacancyId);
    }
    for (const id of dismissedVacancyIds) vacancyById.delete(id);

    const vacancies = Array.from(vacancyById.values()).sort((a, b) => {
      const scoreA = scoreByVacancyId.get(a.id);
      const scoreB = scoreByVacancyId.get(b.id);
      if (scoreA !== undefined && scoreB !== undefined) return scoreB - scoreA;
      if (scoreA !== undefined) return -1;
      if (scoreB !== undefined) return 1;
      return b.foundAt.getTime() - a.foundAt.getTime();
    });

    return { profile, vacancies, scoreByVacancyId };
  });

  const hasAnyProfile = cvProfiles.length > 0;
  const hasAnyVacancy = groups.some((g) => g.vacancies.length > 0);

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-semibold">Знайдені вакансії</h1>

      {!hasAnyProfile ? (
        <p className="text-sm text-zinc-500">
          Спочатку додай CV-профіль та ключові слова на сторінці налаштувань.
        </p>
      ) : !hasAnyVacancy ? (
        <p className="text-sm text-zinc-500">
          Ще нічого не знайдено. Додай ключове слово під CV та натисни
          &laquo;Запустити пошук зараз&raquo; на сторінці налаштувань.
        </p>
      ) : (
        groups.map(({ profile, vacancies, scoreByVacancyId }) => (
          <section key={profile.id} className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">
              {profile.label} ({vacancies.length})
            </h2>
            {vacancies.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Для цього CV ще нічого не знайдено.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {vacancies.map((vacancy) => {
                  const score = scoreByVacancyId.get(vacancy.id);
                  return (
                    <li
                      key={vacancy.id}
                      className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <a
                          href={vacancy.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium underline"
                        >
                          {vacancy.title}
                        </a>
                        {score !== undefined ? (
                          <span
                            className={
                              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium " +
                              (score >= 60
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : score >= 40
                                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400")
                            }
                          >
                            {score}% збіг
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs text-zinc-500">
                            не оцінено
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {vacancy.source} · знайдено{" "}
                        {vacancy.foundAt.toLocaleString("uk-UA")}
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
                        {vacancy.rawText}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}

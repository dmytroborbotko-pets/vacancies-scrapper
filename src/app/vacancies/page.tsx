import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Vacancy } from "@/generated/prisma/client";
import { requireUserId } from "@/lib/session";
import { markApplied, deleteMatch } from "@/app/to-apply/actions";
import { SubmitButton } from "@/components/submit-button";

const PAGE_SIZE = 20;
// Vacancies scored below this are just noise — not worth ever showing.
const MIN_SCORE_THRESHOLD = 30;

// Builds an href for a page link within one CV's section, preserving every
// other CV section's own page param untouched.
function pageHref(
  searchParams: Record<string, string | undefined>,
  cvProfileId: string,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && key !== `page_${cvProfileId}`) {
      params.set(key, value);
    }
  }
  if (page > 1) params.set(`page_${cvProfileId}`, String(page));
  const query = params.toString();
  return query ? `/vacancies?${query}` : "/vacancies";
}

export default async function VacanciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const userId = await requireUserId();
  const resolvedSearchParams = await searchParams;
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
    const matchIdByVacancyId = new Map<string, string>();
    const hiddenVacancyIds = new Set<string>();
    for (const match of profile.matches) {
      scoreByVacancyId.set(match.vacancyId, match.score);
      matchIdByVacancyId.set(match.vacancyId, match.id);
      // Dismissed (deleted from "До подачі") and applied ("Подався")
      // vacancies are done with — they belong on their own pages, not back
      // in the general list. Low-scoring ones just aren't worth showing.
      if (
        match.status === "DISMISSED" ||
        match.status === "APPLIED" ||
        match.score < MIN_SCORE_THRESHOLD
      ) {
        hiddenVacancyIds.add(match.vacancyId);
      }
    }
    for (const id of hiddenVacancyIds) vacancyById.delete(id);

    const vacancies = Array.from(vacancyById.values()).sort((a, b) => {
      const scoreA = scoreByVacancyId.get(a.id);
      const scoreB = scoreByVacancyId.get(b.id);
      if (scoreA !== undefined && scoreB !== undefined) return scoreB - scoreA;
      if (scoreA !== undefined) return -1;
      if (scoreB !== undefined) return 1;
      return b.foundAt.getTime() - a.foundAt.getTime();
    });

    const totalPages = Math.max(1, Math.ceil(vacancies.length / PAGE_SIZE));
    const rawPage = Number(resolvedSearchParams[`page_${profile.id}`] ?? "1");
    const page = Number.isFinite(rawPage)
      ? Math.min(Math.max(1, Math.trunc(rawPage)), totalPages)
      : 1;
    const pageVacancies = vacancies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return { profile, vacancies, pageVacancies, page, totalPages, scoreByVacancyId, matchIdByVacancyId };
  });

  const hasAnyProfile = cvProfiles.length > 0;
  const hasAnyVacancy = groups.some((g) => g.vacancies.length > 0);

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-4xl font-semibold">Знайдені вакансії</h1>

      {!hasAnyProfile ? (
        <p className="text-base text-zinc-500">
          Спочатку додай CV-профіль та ключові слова на сторінці налаштувань.
        </p>
      ) : !hasAnyVacancy ? (
        <p className="text-base text-zinc-500">
          Ще нічого не знайдено. Додай ключове слово під CV та натисни
          &laquo;Запустити пошук зараз&raquo; на сторінці налаштувань.
        </p>
      ) : (
        groups.map(({ profile, vacancies, pageVacancies, page, totalPages, scoreByVacancyId, matchIdByVacancyId }) => (
          <section key={profile.id} className="flex flex-col gap-4">
            <h2 className="text-2xl font-semibold">
              {profile.label} ({vacancies.length})
            </h2>
            {vacancies.length === 0 ? (
              <p className="text-base text-zinc-500">
                Для цього CV ще нічого не знайдено.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {pageVacancies.map((vacancy) => {
                  const score = scoreByVacancyId.get(vacancy.id);
                  const matchId = matchIdByVacancyId.get(vacancy.id);
                  const scoreBorder =
                    score === undefined
                      ? "border-zinc-200 dark:border-zinc-800"
                      : score >= 60
                        ? "border-green-300 dark:border-green-800"
                        : score >= 40
                          ? "border-yellow-300 dark:border-yellow-800"
                          : "border-zinc-200 dark:border-zinc-800";
                  return (
                    <li
                      key={vacancy.id}
                      className={`rounded-lg border-l-4 border p-4 ${scoreBorder}`}
                    >
                      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
                              "shrink-0 rounded-full px-2 py-0.5 text-sm font-medium " +
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
                          <span className="shrink-0 text-sm text-zinc-500">
                            не оцінено
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-zinc-500">
                        {vacancy.source} · знайдено{" "}
                        {vacancy.foundAt.toLocaleString("uk-UA")}
                      </div>
                      <p className="mt-2 line-clamp-3 text-base text-zinc-600 dark:text-zinc-400">
                        {vacancy.rawText}
                      </p>
                      {matchId && (
                        <div className="mt-3 flex gap-2">
                          <form action={markApplied}>
                            <input type="hidden" name="id" value={matchId} />
                            <SubmitButton
                              pendingText="…"
                              className="rounded-md bg-zinc-900 px-3 py-1.5 text-base font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
                            >
                              Подався
                            </SubmitButton>
                          </form>
                          <form action={deleteMatch}>
                            <input type="hidden" name="id" value={matchId} />
                            <SubmitButton
                              pendingText="…"
                              className="rounded-md border border-zinc-300 px-3 py-1.5 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                            >
                              Видалити
                            </SubmitButton>
                          </form>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 text-sm">
                {page > 1 ? (
                  <Link
                    href={pageHref(resolvedSearchParams, profile.id, page - 1)}
                    className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
                  >
                    ← Попередня
                  </Link>
                ) : (
                  <span className="text-zinc-300 dark:text-zinc-700">← Попередня</span>
                )}
                <span className="text-zinc-500">
                  Сторінка {page} з {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={pageHref(resolvedSearchParams, profile.id, page + 1)}
                    className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
                  >
                    Наступна →
                  </Link>
                ) : (
                  <span className="text-zinc-300 dark:text-zinc-700">Наступна →</span>
                )}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

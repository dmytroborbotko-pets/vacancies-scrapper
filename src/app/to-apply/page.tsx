import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Match, Vacancy, CvProfile } from "@/generated/prisma/client";
import { requireUserId } from "@/lib/session";
import { markApplied, deleteMatch } from "./actions";
import { SubmitButton } from "@/components/submit-button";

type MatchWithRelations = Match & { vacancy: Vacancy; cvProfile: CvProfile };

export default async function ToApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ cv?: string }>;
}) {
  const userId = await requireUserId();
  const { cv: cvFilter } = await searchParams;

  const [matches, cvProfiles] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: "TO_APPLY",
        cvProfile: { userId },
        ...(cvFilter ? { cvProfileId: cvFilter } : {}),
      },
      include: { vacancy: true, cvProfile: true },
      orderBy: { score: "desc" },
    }),
    prisma.cvProfile.findMany({
      where: { userId, matches: { some: { status: "TO_APPLY" } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const groups = new Map<string, { profile: CvProfile; matches: MatchWithRelations[] }>();
  for (const match of matches) {
    const existing = groups.get(match.cvProfileId);
    if (existing) {
      existing.matches.push(match);
    } else {
      groups.set(match.cvProfileId, { profile: match.cvProfile, matches: [match] });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">До подачі</h1>

      {cvProfiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/to-apply"
            className={
              "rounded-full px-3 py-1 text-xs font-medium " +
              (!cvFilter
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900")
            }
          >
            Усі
          </Link>
          {cvProfiles.map((profile) => (
            <Link
              key={profile.id}
              href={`/to-apply?cv=${profile.id}`}
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (cvFilter === profile.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900")
              }
            >
              {profile.label}
            </Link>
          ))}
        </div>
      )}

      {matches.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Поки що немає жодного матчу з достатнім відсотком збігу. Запусти
          пошук і порахуй % збігу на сторінці налаштувань.
        </p>
      ) : (
        Array.from(groups.values()).map(({ profile, matches }) => (
          <section key={profile.id} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">
              {profile.label} ({matches.length})
            </h2>
            <ul className="flex flex-col gap-4">
              {matches.map((match) => (
                <li
                  key={match.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <a
                        href={match.vacancy.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline"
                      >
                        {match.vacancy.title}
                      </a>
                      <div className="mt-1 text-xs text-zinc-500">
                        {match.score}%
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-3">
                      <form action={markApplied}>
                        <input type="hidden" name="id" value={match.id} />
                        <SubmitButton
                          pendingText="…"
                          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
                        >
                          Подався
                        </SubmitButton>
                      </form>
                      <form action={deleteMatch}>
                        <input type="hidden" name="id" value={match.id} />
                        <SubmitButton
                          pendingText="…"
                          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        >
                          Видалити
                        </SubmitButton>
                      </form>
                    </div>
                  </div>

                  {match.coverLetter && (
                    <p className="mt-3 whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {match.coverLetter}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

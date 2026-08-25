import { prisma } from "@/lib/prisma";
import type { Match, Vacancy, CvProfile } from "@/generated/prisma/client";

type MatchWithRelations = Match & { vacancy: Vacancy; cvProfile: CvProfile };

export default async function ToApplyPage() {
  const matches = await prisma.match.findMany({
    where: { status: "NEW" },
    include: { vacancy: true, cvProfile: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">До подачі</h1>
      {matches.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Поки що немає жодного матчу. Він з&apos;явиться тут після того, як
          пошук знайде вакансію з достатнім відсотком збігу.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {matches.map((match: MatchWithRelations) => (
            <li
              key={match.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="font-medium">{match.vacancy.title}</div>
              <div className="text-sm text-zinc-500">
                {match.score}% · {match.cvProfile.label}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

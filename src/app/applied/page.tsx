import { prisma } from "@/lib/prisma";
import type { Match, Vacancy, CvProfile } from "@/generated/prisma/client";

type MatchWithRelations = Match & { vacancy: Vacancy; cvProfile: CvProfile };

export default async function AppliedPage() {
  const matches = await prisma.match.findMany({
    where: { status: "APPLIED" },
    include: { vacancy: true, cvProfile: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Подався</h1>
      {matches.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Історія подань поки порожня.
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

import { prisma } from "@/lib/prisma";
import type { Match, Vacancy, CvProfile, MatchOutcome } from "@/generated/prisma/client";
import { requireUserId } from "@/lib/session";
import { setOutcome } from "./actions";
import { SubmitButton } from "@/components/submit-button";

type MatchWithRelations = Match & { vacancy: Vacancy; cvProfile: CvProfile };

const OUTCOME_STYLES: Record<MatchOutcome, string> = {
  INTERVIEW: "bg-sky-500/10",
  HIRED: "bg-green-500/10",
  REJECTED: "bg-red-500/10",
};

const OUTCOME_BUTTONS: { value: MatchOutcome; label: string }[] = [
  { value: "INTERVIEW", label: "Інтервʼю" },
  { value: "HIRED", label: "Найм" },
  { value: "REJECTED", label: "Відмова" },
];

export default async function AppliedPage() {
  const userId = await requireUserId();
  const matches = await prisma.match.findMany({
    where: { status: "APPLIED", cvProfile: { userId } },
    include: { vacancy: true, cvProfile: true },
    orderBy: { createdAt: "desc" },
  });

  const base = matches.filter((m) => !m.outcome);
  const interview = matches.filter((m) => m.outcome === "INTERVIEW");
  const hired = matches.filter((m) => m.outcome === "HIRED");
  const rejected = matches.filter((m) => m.outcome === "REJECTED");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-4xl font-semibold">Подався ({matches.length})</h1>
        <div className="flex flex-wrap gap-x-3 text-sm text-zinc-500">
          {interview.length > 0 && <span>Інтервʼю: {interview.length}</span>}
          {hired.length > 0 && <span>Найм: {hired.length}</span>}
          {rejected.length > 0 && <span>Відмова: {rejected.length}</span>}
        </div>
      </div>

      {matches.length === 0 ? (
        <p className="text-sm text-zinc-500">Історія подань поки порожня.</p>
      ) : (
        <>
          <MatchList matches={base} />

          {interview.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-2xl font-semibold text-zinc-700 dark:text-zinc-300">
                Інтервʼю ({interview.length})
              </h2>
              <MatchList matches={interview} />
            </section>
          )}

          {hired.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-2xl font-semibold text-zinc-700 dark:text-zinc-300">
                Найм ({hired.length})
              </h2>
              <MatchList matches={hired} />
            </section>
          )}

          {rejected.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-2xl font-semibold text-zinc-700 dark:text-zinc-300">
                Відмова ({rejected.length})
              </h2>
              <MatchList matches={rejected} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function MatchList({ matches }: { matches: MatchWithRelations[] }) {
  if (matches.length === 0) return null;

  return (
    <ul className="flex flex-col gap-4">
      {matches.map((match) => (
        <li
          key={match.id}
          className={`rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 ${
            match.outcome ? OUTCOME_STYLES[match.outcome] : ""
          }`}
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
              <div className="text-sm text-zinc-500">
                {match.score}% · {match.cvProfile.label}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {OUTCOME_BUTTONS.map((btn) => (
                <form key={btn.value} action={setOutcome}>
                  <input type="hidden" name="id" value={match.id} />
                  <input
                    type="hidden"
                    name="outcome"
                    value={match.outcome === btn.value ? "" : btn.value}
                  />
                  <SubmitButton
                    pendingText="…"
                    className={
                      "rounded-full px-3 py-1 text-sm font-medium " +
                      (match.outcome === btn.value
                        ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                        : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900")
                    }
                  >
                    {btn.label}
                  </SubmitButton>
                </form>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

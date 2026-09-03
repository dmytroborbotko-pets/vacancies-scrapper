import { prisma } from "@/lib/prisma";
import { fetchDjinniVacancies } from "@/lib/sources/djinni";
import { fetchDouVacancies } from "@/lib/sources/dou";
import { fetchOtherVacancies, OTHER_DAILY_VACANCY_CAP } from "@/lib/sources/other";
import { scoreCvProfile } from "@/lib/scoring";
import type { FetchedVacancy } from "@/lib/sources/types";
import type { CvProfile, SearchScope } from "@/generated/prisma/client";

export type { SearchScope };

// Vercel's hard ceiling is 300s (see api/run-search/route.ts's maxDuration).
// Leave headroom for the route's own overhead and the final response.
const RUN_SEARCH_BUDGET_MS = 260_000;

// Callers are responsible for verifying `cvProfileIds` belong to the
// requesting user — this function does not check.
export interface RunSearchParams {
  cvProfileIds: string[];
  scope: SearchScope;
  requireReservation: boolean;
  onStatus?: (message: string) => void;
}

export interface RunSearchCvResult {
  cvProfileId: string;
  found: number;
  created: number;
  scored: number;
  toApply: number;
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function emitStatus(onStatus: ((message: string) => void) | undefined, message: string) {
  try {
    onStatus?.(message);
  } catch {
    // The caller's status sink (e.g. a closed stream) failing must never
    // abort the rest of the batch — this is best-effort progress reporting.
  }
}

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Shared tail for every ingest path: dedup by sourceUrl against the global
// Vacancy table, create rows for new ones, and link this CV profile to each
// — never deleting anything, so re-running a search only ever adds.
//
// Batched rather than per-vacancy: Vacancy.sourceUrl is globally unique, and
// two overlapping runs (two users' searches, or the cron overlapping a
// manual run) surfacing the same posting could otherwise both attempt a
// `create` and hit a P2002 unique-constraint violation. `skipDuplicates`
// makes both createMany calls race-safe instead. Callers must already have
// deduped `vacancies` by sourceUrl (fetchDouOrDjinniVacancies's Map-based
// merge and other.ts's own dedup both do this).
async function persistDiscoveries(
  cvProfileId: string,
  vacancies: FetchedVacancy[],
): Promise<{ found: number; created: number }> {
  if (vacancies.length === 0) return { found: 0, created: 0 };

  const { count: created } = await prisma.vacancy.createMany({
    data: vacancies.map((v) => ({
      source: v.source,
      sourceUrl: v.sourceUrl,
      title: v.title,
      company: v.company,
      rawText: v.rawText,
    })),
    skipDuplicates: true,
  });

  const records = await prisma.vacancy.findMany({
    where: { sourceUrl: { in: vacancies.map((v) => v.sourceUrl) } },
    select: { id: true },
  });

  await prisma.vacancyDiscovery.createMany({
    data: records.map((r) => ({ vacancyId: r.id, cvProfileId })),
    skipDuplicates: true,
  });

  return { found: vacancies.length, created };
}

// A CV's cached searchTerms are OR'd together: a vacancy matching any one
// term qualifies. DOU/Djinni only accept one query at a time, so each term
// is queried separately and merged by sourceUrl.
async function fetchDouOrDjinniVacancies(
  source: "DOU" | "DJINNI",
  terms: string[],
  requireReservation: boolean,
): Promise<FetchedVacancy[]> {
  const bySourceUrl = new Map<string, FetchedVacancy>();
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const vacancies =
      source === "DOU"
        ? await fetchDouVacancies(term, { requireReservation })
        : await fetchDjinniVacancies(term, { requireReservation });
    for (const vacancy of vacancies) {
      if (!bySourceUrl.has(vacancy.sourceUrl)) {
        bySourceUrl.set(vacancy.sourceUrl, vacancy);
      }
    }
    // dou.ua is scraped HTML, not a public feed API — stay conservative
    // between requests rather than firing one per term back to back.
    // Only *between* terms, not after the last one.
    const isLastTerm = i === terms.length - 1;
    if (source === "DOU" && !isLastTerm) {
      await sleep(2000);
    }
  }
  return Array.from(bySourceUrl.values());
}

async function ingestForCvProfile(
  cvProfile: CvProfile,
  scope: SearchScope,
  requireReservation: boolean,
  onStatus?: (message: string) => void,
): Promise<{ found: number; created: number }> {
  // Exhaustiveness guard: SearchScope is imported from the generated Prisma
  // client, so a new enum member added there would otherwise silently no-op
  // through every branch below instead of failing loudly.
  if (scope !== "DOU" && scope !== "DJINNI" && scope !== "BOTH" && scope !== "EVERYWHERE") {
    const _exhaustive: never = scope;
    throw new Error(`Unhandled search scope: ${_exhaustive}`);
  }

  // searchTerms: [] is reachable (CV upload extraction can degrade to it),
  // and DOU/Djinni queries built from an empty term list would silently
  // no-op — indistinguishable from a genuine zero-result search. EVERYWHERE
  // already guards this internally in other.ts (returns [] for empty
  // cvSearchTerms) with its own logging, so only skip-and-log here for the
  // DOU/DJINNI/BOTH paths.
  if (cvProfile.searchTerms.length === 0 && scope !== "EVERYWHERE") {
    console.error(`runSearch: CV ${cvProfile.id} (${cvProfile.label}) has no searchTerms — skipping DOU/Djinni`);
    emitStatus(onStatus, `У CV «${cvProfile.label}» немає пошукових термінів для DOU/Djinni — пропускаю`);
    return { found: 0, created: 0 };
  }

  let found = 0;
  let created = 0;

  if (scope === "DOU" || scope === "BOTH") {
    emitStatus(onStatus, `Сканую DOU для «${cvProfile.label}»…`);
    const vacancies = await fetchDouOrDjinniVacancies("DOU", cvProfile.searchTerms, requireReservation);
    const result = await persistDiscoveries(cvProfile.id, vacancies);
    found += result.found;
    created += result.created;
  }

  if (scope === "DJINNI" || scope === "BOTH") {
    emitStatus(onStatus, `Сканую Djinni для «${cvProfile.label}»…`);
    const vacancies = await fetchDouOrDjinniVacancies("DJINNI", cvProfile.searchTerms, requireReservation);
    const result = await persistDiscoveries(cvProfile.id, vacancies);
    found += result.found;
    created += result.created;
  }

  if (scope === "EVERYWHERE") {
    emitStatus(onStatus, `Шукаю по всьому інтернету для «${cvProfile.label}»…`);
    const createdToday = await prisma.vacancy.count({
      where: { source: "OTHER", foundAt: { gte: startOfTodayUTC() } },
    });
    const remaining = OTHER_DAILY_VACANCY_CAP - createdToday;
    const vacancies = await fetchOtherVacancies({
      cvSearchTerms: cvProfile.searchTerms,
      requireReservation,
      maxResults: remaining,
    });
    const result = await persistDiscoveries(cvProfile.id, vacancies);
    found += result.found;
    created += result.created;
  }

  return { found, created };
}

// The single generic search+score entry point. Called from the manual
// search modal's streaming route and from the schedule evaluator — never
// called from anywhere else, so manual and automatic runs can't drift.
//
// Scoring is not optional or separately triggered: if a CV's ingest
// succeeds, it is scored immediately, in the same call, before moving to
// the next CV. If one CV's ingest throws, the others in the batch still get
// searched and scored — errors are per-CV, not batch-fatal.
export async function runSearch(params: RunSearchParams): Promise<RunSearchCvResult[]> {
  // Guards against the 300s Vercel function ceiling: a single CV at scope
  // BOTH/EVERYWHERE can take well over a minute, so a batch of just a
  // couple of CVs (e.g. the "Всі" / all-CVs feature) can exceed the
  // deadline. Without this check a timeout kills the function mid-stream
  // with no `done`/`error` event ever sent, leaving the client hanging.
  const deadline = Date.now() + RUN_SEARCH_BUDGET_MS;

  const cvProfiles = await prisma.cvProfile.findMany({
    where: { id: { in: params.cvProfileIds } },
  });

  const results: RunSearchCvResult[] = [];

  for (let i = 0; i < cvProfiles.length; i++) {
    const cvProfile = cvProfiles[i];

    if (Date.now() >= deadline) {
      // Out of budget: report this CV and every remaining one as a clean,
      // explicit skip instead of starting more work that can't finish.
      for (let j = i; j < cvProfiles.length; j++) {
        results.push({
          cvProfileId: cvProfiles[j].id,
          found: 0,
          created: 0,
          scored: 0,
          toApply: 0,
          error: "Пропущено — вичерпано ліміт часу",
        });
      }
      break;
    }

    // Declared outside the try so a scoring failure after a successful
    // ingest still reports the vacancies that were actually persisted,
    // instead of the catch block reporting found/created as 0.
    let found = 0;
    let created = 0;

    try {
      const ingestResult = await ingestForCvProfile(
        cvProfile,
        params.scope,
        params.requireReservation,
        params.onStatus,
      );
      found = ingestResult.found;
      created = ingestResult.created;

      emitStatus(params.onStatus, `Оцінюю відповідність для «${cvProfile.label}»…`);
      const { scored, toApply } = await scoreCvProfile(cvProfile);

      results.push({ cvProfileId: cvProfile.id, found, created, scored, toApply });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Невідома помилка";
      // Otherwise unobserved — e.g. by the cron evaluator, which has no
      // other sink for per-CV failures.
      console.error(`runSearch: CV ${cvProfile.id} (${cvProfile.label}) failed:`, error);
      emitStatus(params.onStatus, `Помилка для «${cvProfile.label}»: ${message}`);
      results.push({
        cvProfileId: cvProfile.id,
        found,
        created,
        scored: 0,
        toApply: 0,
        error: message,
      });
    }
  }

  return results;
}

import { prisma } from "@/lib/prisma";
import { fetchDjinniVacancies } from "@/lib/sources/djinni";
import { fetchDouVacancies } from "@/lib/sources/dou";
import { fetchOtherVacancies, OTHER_DAILY_VACANCY_CAP } from "@/lib/sources/other";
import { scoreCvProfile } from "@/lib/scoring";
import type { FetchedVacancy } from "@/lib/sources/types";
import type { CvProfile } from "@/generated/prisma/client";

export type SearchScope = "DOU" | "DJINNI" | "BOTH" | "EVERYWHERE";

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

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Shared tail for every ingest path: dedup by sourceUrl against the global
// Vacancy table, create rows for new ones, and link this CV profile to each
// — never deleting anything, so re-running a search only ever adds.
async function persistDiscoveries(
  cvProfileId: string,
  vacancies: Iterable<FetchedVacancy>,
): Promise<{ found: number; created: number }> {
  let found = 0;
  let created = 0;
  for (const vacancy of vacancies) {
    found += 1;
    const existing = await prisma.vacancy.findUnique({
      where: { sourceUrl: vacancy.sourceUrl },
      select: { id: true },
    });

    const vacancyRecord =
      existing ??
      (await prisma.vacancy.create({
        data: {
          source: vacancy.source,
          sourceUrl: vacancy.sourceUrl,
          title: vacancy.title,
          company: vacancy.company,
          rawText: vacancy.rawText,
        },
      }));

    if (!existing) created += 1;

    await prisma.vacancyDiscovery.upsert({
      where: {
        cvProfileId_vacancyId: {
          vacancyId: vacancyRecord.id,
          cvProfileId,
        },
      },
      create: { vacancyId: vacancyRecord.id, cvProfileId },
      update: {},
    });
  }

  return { found, created };
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
  for (const term of terms) {
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
    if (source === "DOU" && terms.length > 1) {
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
  let found = 0;
  let created = 0;

  if (scope === "DOU" || scope === "BOTH") {
    onStatus?.(`Сканую DOU для «${cvProfile.label}»…`);
    const vacancies = await fetchDouOrDjinniVacancies("DOU", cvProfile.searchTerms, requireReservation);
    const result = await persistDiscoveries(cvProfile.id, vacancies);
    found += result.found;
    created += result.created;
  }

  if (scope === "DJINNI" || scope === "BOTH") {
    onStatus?.(`Сканую Djinni для «${cvProfile.label}»…`);
    const vacancies = await fetchDouOrDjinniVacancies("DJINNI", cvProfile.searchTerms, requireReservation);
    const result = await persistDiscoveries(cvProfile.id, vacancies);
    found += result.found;
    created += result.created;
  }

  if (scope === "EVERYWHERE") {
    onStatus?.(`Шукаю по всьому інтернету для «${cvProfile.label}»…`);
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
  const cvProfiles = await prisma.cvProfile.findMany({
    where: { id: { in: params.cvProfileIds } },
  });

  const results: RunSearchCvResult[] = [];

  for (const cvProfile of cvProfiles) {
    try {
      const { found, created } = await ingestForCvProfile(
        cvProfile,
        params.scope,
        params.requireReservation,
        params.onStatus,
      );

      params.onStatus?.(`Оцінюю відповідність для «${cvProfile.label}»…`);
      const { scored, toApply } = await scoreCvProfile(cvProfile);

      results.push({ cvProfileId: cvProfile.id, found, created, scored, toApply });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Невідома помилка";
      params.onStatus?.(`Помилка для «${cvProfile.label}»: ${message}`);
      results.push({
        cvProfileId: cvProfile.id,
        found: 0,
        created: 0,
        scored: 0,
        toApply: 0,
        error: message,
      });
    }
  }

  return results;
}

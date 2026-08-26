import { prisma } from "@/lib/prisma";
import { fetchDjinniVacancies } from "@/lib/sources/djinni";
import { fetchDouVacancies } from "@/lib/sources/dou";
import { fetchOtherVacancies } from "@/lib/sources/other";
import { OTHER_DAILY_VACANCY_CAP } from "@/lib/defense-keywords";
import type { FetchedVacancy } from "@/lib/sources/types";
import type { SearchConfig } from "@/generated/prisma/client";

export interface IngestResult {
  searchConfigId: string;
  keywords: string;
  found: number;
  created: number;
}

// A SearchConfig's `keywords` field is a comma-separated list of terms,
// OR'd together: a vacancy matching any single term qualifies (e.g.
// "TensorFlow, PyTorch, RAG" should not require all three in one posting).
// Djinni's own `all_keywords` param ANDs every word in one query, so OR
// semantics are achieved by querying each term separately and merging.
function splitKeywordTerms(keywords: string): string[] {
  return keywords
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Shared tail for every ingest path: dedup by sourceUrl against the global
// Vacancy table, create rows for new ones, and record that this SearchConfig
// (and therefore its CV profile) discovered each vacancy.
async function persistDiscoveries(
  searchConfig: SearchConfig,
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
        vacancyId_searchConfigId: {
          vacancyId: vacancyRecord.id,
          searchConfigId: searchConfig.id,
        },
      },
      create: {
        vacancyId: vacancyRecord.id,
        searchConfigId: searchConfig.id,
      },
      update: {},
    });
  }

  return { found, created };
}

export async function ingestSearchConfig(
  searchConfig: SearchConfig,
): Promise<IngestResult> {
  const terms = splitKeywordTerms(searchConfig.keywords);
  const expLevels = searchConfig.expLevels
    ? searchConfig.expLevels.split(",").map((level) => level.trim()).filter(Boolean)
    : undefined;

  const vacancyBySourceUrl = new Map<string, FetchedVacancy>();
  for (const term of terms) {
    const vacancies =
      searchConfig.source === "DOU"
        ? await fetchDouVacancies(term, {
            requireReservation: searchConfig.requireReservation,
          })
        : await fetchDjinniVacancies(term, {
            expLevels,
            requireReservation: searchConfig.requireReservation,
          });

    for (const vacancy of vacancies) {
      if (!vacancyBySourceUrl.has(vacancy.sourceUrl)) {
        vacancyBySourceUrl.set(vacancy.sourceUrl, vacancy);
      }
    }

    // dou.ua is scraped HTML, not a public feed API — stay conservative
    // between requests rather than firing one per term back to back.
    if (searchConfig.source === "DOU" && terms.length > 1) {
      await sleep(2000);
    }
  }

  const { found, created } = await persistDiscoveries(
    searchConfig,
    vacancyBySourceUrl.values(),
  );

  return {
    searchConfigId: searchConfig.id,
    keywords: searchConfig.keywords,
    found,
    created,
  };
}

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// The OTHER source has no site to scrape — it's a broad web search, gated by
// a shared daily cap (not per-CV) so an LLM web-search run can't blow the
// Claude API budget. Reached from the cron path (see runActiveSearches) and
// from the per-CV "Запустити «Інші» зараз" streaming trigger — never from
// the general manual "run search now" button.
export async function ingestOtherSearchConfig(
  searchConfig: SearchConfig,
  callbacks?: { onText?: (delta: string) => void },
): Promise<IngestResult> {
  const createdToday = await prisma.vacancy.count({
    where: { source: "OTHER", foundAt: { gte: startOfTodayUTC() } },
  });
  const remaining = OTHER_DAILY_VACANCY_CAP - createdToday;

  const vacancies = await fetchOtherVacancies({
    maxResults: remaining,
    onText: callbacks?.onText,
  });
  const { found, created } = await persistDiscoveries(searchConfig, vacancies);

  return {
    searchConfigId: searchConfig.id,
    keywords: searchConfig.keywords,
    found,
    created,
  };
}

// System-wide: used by the daily cron job, which scans every user's active
// searches in one run — not scoped to a session. Includes managed configs
// (the "Інші" otherMode's DJINNI/DOU/OTHER legs), unlike the manual trigger.
export async function runActiveSearches(): Promise<IngestResult[]> {
  const configs = await prisma.searchConfig.findMany({
    where: { active: true },
  });

  const results: IngestResult[] = [];
  for (const config of configs) {
    results.push(
      config.source === "OTHER"
        ? await ingestOtherSearchConfig(config)
        : await ingestSearchConfig(config),
    );
  }
  return results;
}

// Scoped to one user's own configs — used by the manual "Запустити пошук
// зараз" button, which must never run another user's searches. Excludes
// managed configs: "Інші" mode only ever scans via the daily cron.
export async function runActiveSearchesForUser(
  userId: string,
): Promise<IngestResult[]> {
  const configs = await prisma.searchConfig.findMany({
    where: { active: true, managed: false, cvProfile: { userId } },
  });

  const results: IngestResult[] = [];
  for (const config of configs) {
    results.push(await ingestSearchConfig(config));
  }
  return results;
}

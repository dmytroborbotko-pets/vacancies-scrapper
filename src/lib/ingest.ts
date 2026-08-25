import { prisma } from "@/lib/prisma";
import { fetchDjinniVacancies } from "@/lib/sources/djinni";
import { fetchDouVacancies } from "@/lib/sources/dou";
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

  let created = 0;
  for (const vacancy of vacancyBySourceUrl.values()) {
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

    // Record that this search (and therefore its CV profile) surfaced the
    // vacancy, even if another CV's search found it first.
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

  return {
    searchConfigId: searchConfig.id,
    keywords: searchConfig.keywords,
    found: vacancyBySourceUrl.size,
    created,
  };
}

export async function runActiveSearches(): Promise<IngestResult[]> {
  const configs = await prisma.searchConfig.findMany({
    where: { active: true },
  });

  const results: IngestResult[] = [];
  for (const config of configs) {
    results.push(await ingestSearchConfig(config));
  }
  return results;
}

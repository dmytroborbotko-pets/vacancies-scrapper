import * as cheerio from "cheerio";
import type { FetchedVacancy } from "@/lib/sources/types";

const SEARCH_URL = "https://jobs.dou.ua/vacancies/";

export interface FetchDouOptions {
  // DOU has no separate curated "reservation" filter like Djinni's
  // editorial=reservation — its own site UI suggests searching the plain
  // keyword "бронювання" instead. Its `search` param ANDs space-separated
  // words against the full vacancy text, so appending it narrows results
  // to postings that mention both the skill and reservation (confirmed:
  // "React" alone → 21 results, "React бронювання" combined → 4).
  requireReservation?: boolean;
}

// dou.ua's Terms of Use reportedly prohibit automated collection without
// the administration's consent (unverified directly — the page 404'd when
// checked — but referenced across multiple DOU community threads). This
// source is therefore off by default (SearchConfig.source must be
// explicitly set to DOU) and deliberately conservative: one request per
// keyword, first page of results only, no pagination follow-through.
export async function fetchDouVacancies(
  keyword: string,
  options: FetchDouOptions = {},
): Promise<FetchedVacancy[]> {
  const searchTerm = options.requireReservation
    ? `${keyword} бронювання`
    : keyword;
  const url = `${SEARCH_URL}?${new URLSearchParams({ search: searchTerm })}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  if (!response.ok) {
    throw new Error(`dou.ua request failed: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const vacancies: FetchedVacancy[] = [];
  $("li.l-vacancy").each((_, el) => {
    const titleLink = $(el).find("a.vt").first();
    const rawHref = titleLink.attr("href");
    const title = titleLink.text().trim();
    if (!rawHref || !title) return;

    // Strip tracking params (e.g. "?from=list_hot") so the same posting
    // dedupes to one sourceUrl regardless of which listing surfaced it.
    const sourceUrl = rawHref.split("?")[0];

    const company = $(el).find("a.company").first().text().trim() || null;
    const description = $(el).find("div.sh-info").first().text().trim();

    vacancies.push({
      source: "DOU" as const,
      sourceUrl,
      title,
      company,
      rawText: [title, company, description].filter(Boolean).join("\n\n"),
    });
  });

  return vacancies;
}

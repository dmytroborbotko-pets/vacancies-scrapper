import Parser from "rss-parser";
import { convert } from "html-to-text";

const RSS_BASE_URL = "https://djinni.co/jobs/rss/";

export interface FetchedVacancy {
  source: "DJINNI";
  sourceUrl: string;
  title: string;
  company: string | null;
  rawText: string;
}

const parser = new Parser();

export interface FetchDjinniOptions {
  // Djinni exp_level checkbox values: "no_exp", "1y".."10y". Passed as
  // repeated query params — Djinni ORs them (matches any listed level).
  expLevels?: string[];
  // Djinni's curated "Бронювання" collection (editorial=reservation) —
  // companies Djinni has verified offer military draft reservation.
  requireReservation?: boolean;
}

export async function fetchDjinniVacancies(
  keyword: string,
  options: FetchDjinniOptions = {},
): Promise<FetchedVacancy[]> {
  const params = new URLSearchParams();
  params.set("all_keywords", keyword);
  for (const level of options.expLevels ?? []) {
    params.append("exp_level", level);
  }
  if (options.requireReservation) {
    params.set("editorial", "reservation");
  }

  const url = `${RSS_BASE_URL}?${params.toString()}`;
  const feed = await parser.parseURL(url);

  return (feed.items ?? [])
    .filter((item) => item.link && item.title)
    .map((item) => {
      const description = convert(item.content ?? item.contentSnippet ?? "", {
        wordwrap: false,
      }).trim();

      return {
        source: "DJINNI" as const,
        sourceUrl: item.link!,
        title: item.title!,
        company: null,
        rawText: `${item.title}\n\n${description}`,
      };
    });
}

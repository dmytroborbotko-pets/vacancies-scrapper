import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { FetchedVacancy } from "@/lib/sources/types";
import { DEFENSE_KEYWORDS, OTHER_MAX_VACANCY_AGE_DAYS } from "@/lib/defense-keywords";

const client = new Anthropic();

const SEARCH_SYSTEM_PROMPT = `You search the public web for current job vacancies in Ukraine's defense and military-tech sector that explicitly offer a reservation from mobilization ("бронювання").

Search broadly — job boards, company career pages, aggregators, anywhere — not limited to any single site. For each distinct vacancy you find, report:
- its title
- the direct URL to the posting
- the employer/company if known
- a short excerpt describing the role and requirements
- how many days ago it was posted, if the page states or implies this (e.g. "posted 3 days ago", an explicit date, "today", "this week")

List every distinct vacancy you found, one per paragraph, with all of the above. If you cannot determine how many days ago a vacancy was posted, say so explicitly rather than guessing.`;

const CandidateSchema = z.object({
  vacancies: z.array(
    z.object({
      title: z.string(),
      sourceUrl: z.string().describe("Direct URL to the vacancy posting"),
      company: z.string().nullable(),
      rawText: z.string().describe("Short excerpt describing the role and requirements"),
      publishedDaysAgo: z
        .number()
        .int()
        .nullable()
        .describe("Days since the vacancy was posted, or null if undeterminable"),
    }),
  ),
});

// Broad, site-agnostic search for defense/military-tech vacancies with a
// reservation. Two-step: (1) let Claude search the web and write up what it
// found in prose, (2) a separate structured-output call extracts a clean
// list from that prose. Filters out anything older than
// OTHER_MAX_VACANCY_AGE_DAYS or with an undeterminable publish date.
export async function fetchOtherVacancies(options: {
  maxResults: number;
}): Promise<FetchedVacancy[]> {
  if (options.maxResults <= 0) return [];

  const searchResponse = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system: SEARCH_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Find defense/military-tech vacancies in Ukraine with a mobilization reservation, posted within the last ${OTHER_MAX_VACANCY_AGE_DAYS} days. Relevant topics/terms: ${DEFENSE_KEYWORDS}.`,
      },
    ],
    tools: [
      {
        type: "web_search_20260318",
        name: "web_search",
        max_uses: 10,
      },
    ],
  });

  const textBlocks = searchResponse.content.filter(
    (block) => block.type === "text",
  );
  const searchSummary = textBlocks.map((block) => block.text).join("\n\n");
  if (!searchSummary.trim()) return [];

  const extraction = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system:
      "Extract a structured list of vacancies from the given research notes. Only include vacancies that are clearly distinct postings with a URL.",
    messages: [{ role: "user", content: searchSummary }],
    output_config: {
      format: zodOutputFormat(CandidateSchema),
    },
  });

  if (!extraction.parsed_output) return [];

  const fresh = extraction.parsed_output.vacancies.filter(
    (candidate) =>
      candidate.publishedDaysAgo !== null &&
      candidate.publishedDaysAgo <= OTHER_MAX_VACANCY_AGE_DAYS,
  );

  return fresh.slice(0, options.maxResults).map((candidate) => ({
    source: "OTHER" as const,
    sourceUrl: candidate.sourceUrl,
    title: candidate.title,
    company: candidate.company,
    rawText: candidate.rawText,
  }));
}

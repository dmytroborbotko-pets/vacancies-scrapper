import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { FetchedVacancy } from "@/lib/sources/types";

const client = new Anthropic();

// A vacancy discovered by this web-search leg is excluded only when Claude
// found an estimated publish date AND it's older than this many days — an
// undeterminable date is allowed through rather than treated as too old.
export const OTHER_MAX_VACANCY_AGE_DAYS = 14;

// Global cap (not per-CV) on new OTHER-source vacancies created per day,
// across the whole app — protects the Claude API budget.
export const OTHER_DAILY_VACANCY_CAP = 100;

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

function buildSearchSystemPrompt(requireReservation: boolean): string {
  return `Do NOT use code execution or write/run scripts of any kind. Call the web_search tool directly, one query at a time. This restriction is critical — violating it wastes budget and time.

You search the public web for current IT/tech job vacancies in Ukraine that match the given candidate's skills and domain.
${
  requireReservation
    ? "\nOnly report vacancies that explicitly offer a reservation from mobilization (\"бронювання\") — skip anything that does not mention it.\n"
    : ""
}
Search broadly — job boards, company career pages, aggregators, anywhere — not limited to any single site. For each distinct vacancy you find, report:
- its title
- the direct URL to the posting
- the employer/company if known
- a short excerpt describing the role and requirements
- how many days ago it was posted, if the page states or implies this (e.g. "posted 3 days ago", an explicit date, "today", "this week")

Do 4-6 targeted searches, then write a final summary listing every distinct vacancy you found, one per paragraph, with all of the above — keep each paragraph brief, this is a list not an essay. If you cannot determine how many days ago a vacancy was posted, say so explicitly rather than guessing.`;
}

// Broad, site-agnostic search driven by the CV's own extracted terms
// (see CvProfile.searchTerms), with an optional reservation-from-mobilization
// filter — not tied to any fixed topic. Two-step: (1) let Claude search the
// web and write up what it found in prose, (2) a separate structured-output
// call extracts a clean list from that prose. Filters out anything with a
// known publish date older than OTHER_MAX_VACANCY_AGE_DAYS; an undeterminable
// publish date passes through unfiltered.
//
// Deliberately no `thinking` config: tested with adaptive thinking enabled,
// it never surfaced usable text (thinking blocks came back empty — the
// content is redacted/billed but not returned) while roughly quadrupling
// input-token cost (~500K vs ~130K tokens/call) and making the model far
// more likely to reach for an unrequested code_execution tool to batch
// searches, which is both slower and less reliable.
export async function fetchOtherVacancies(options: {
  cvSearchTerms: string[];
  requireReservation: boolean;
  maxResults: number;
}): Promise<FetchedVacancy[]> {
  if (options.maxResults <= 0) return [];

  const searchStream = client.messages.stream(
    {
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: buildSearchSystemPrompt(options.requireReservation),
      messages: [
        {
          role: "user",
          content: `Find vacancies posted within the last ${OTHER_MAX_VACANCY_AGE_DAYS} days matching this candidate profile. Relevant skills/terms: ${options.cvSearchTerms.join(", ")}.`,
        },
      ],
      tools: [
        {
          type: "web_search_20260318",
          name: "web_search",
          max_uses: 8,
        },
      ],
    },
    // Without this, a stalled request (network hiccup, Anthropic-side
    // stall) hangs indefinitely — the route's try/catch never fires, so
    // the client never gets an error/done event and the overlay just
    // freezes forever with no explanation.
    { timeout: 120_000 },
  );

  const searchResponse = await searchStream.finalMessage();

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

  // Only exclude a candidate when Claude found a date AND it's stale — an
  // undeterminable date passes through. In practice company career pages
  // (the OTHER leg's main source, unlike Djinni/DOU's structured listings)
  // almost never expose a "posted N days ago" marker, so treating
  // "undeterminable" as "reject" was silently discarding every result.
  const fresh = extraction.parsed_output.vacancies.filter(
    (candidate) =>
      candidate.publishedDaysAgo === null ||
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

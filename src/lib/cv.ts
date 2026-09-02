// Import the internal module directly: pdf-parse's index.js runs a
// require-time self-test (reading a bundled fixture PDF) whenever
// `module.parent` is undefined, which is always true once bundled —
// this throws ENOENT under Next.js/Turbopack. lib/pdf-parse.js skips it.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export async function extractTextFromFile(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "pdf") {
    const result = await pdfParse(buffer);
    return result.text.trim();
  }

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  throw new Error(`Непідтримуваний формат файлу: .${ext}`);
}

const client = new Anthropic();

const SearchTermsSchema = z.object({
  terms: z
    .array(z.string())
    .min(3)
    .max(15)
    .describe(
      "Short skill/technology/domain terms suitable as job-board keyword-search queries",
    ),
});

const SEARCH_TERMS_SYSTEM_PROMPT = `You extract short search-engine keywords from a candidate's CV, suitable for querying a job board's keyword search (like "Python", "FastAPI", "computer vision", "embedded systems"). Prefer specific technologies, frameworks, and named domains over generic soft-skill words ("teamwork", "communication"). Return 3-15 terms, ranked by how central they are to the candidate's profile, no duplicates, no explanations.`;

// Cached once on CvProfile.searchTerms at upload time (see
// settings/actions.ts#uploadCvProfile) and reused as DOU/Djinni query terms
// for every search of that CV, instead of a user-typed keyword list.
export async function extractSearchTerms(cvText: string): Promise<string[]> {
  if (!cvText.trim()) return [];

  const response = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: SEARCH_TERMS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `CV:\n${cvText}` }],
    output_config: {
      format: zodOutputFormat(SearchTermsSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return parseable search terms");
  }
  return [
    ...new Set(
      response.parsed_output.terms.map((t) => t.trim()).filter(Boolean),
    ),
  ];
}

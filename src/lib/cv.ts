// Import the internal module directly: pdf-parse's index.js runs a
// require-time self-test (reading a bundled fixture PDF) whenever
// `module.parent` is undefined, which is always true once bundled —
// this throws ENOENT under Next.js/Turbopack. lib/pdf-parse.js skips it.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

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

const client = new OpenAI({
  apiKey: process.env.QWEN_API_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

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

  const response = await client.chat.completions.parse({
    model: "qwen3.7-flash",
    max_tokens: 1024,
    messages: [
      { role: "system", content: SEARCH_TERMS_SYSTEM_PROMPT },
      { role: "user", content: `CV:\n${cvText}` },
    ],
    response_format: zodResponseFormat(SearchTermsSchema, "search_terms"),
  });

  const parsed = response.choices[0]?.message.parsed;
  if (!parsed) {
    throw new Error("Qwen did not return parseable search terms");
  }
  return [...new Set(parsed.terms.map((t) => t.trim()).filter(Boolean))];
}

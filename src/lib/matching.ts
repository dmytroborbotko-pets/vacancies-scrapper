import OpenAI from "openai";
import { z } from "zod";
import { tryParseJson } from "@/lib/ai-json";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

const MatchResultSchema = z.object({
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe(
      "Percentage match between the CV and the vacancy requirements, 0-100",
    ),
  matchedRequirements: z
    .array(z.string())
    .describe("Short phrases: requirements the CV clearly satisfies"),
  missingRequirements: z
    .array(z.string())
    .describe("Short phrases: requirements the CV does not show evidence of"),
});

export type MatchResult = z.infer<typeof MatchResultSchema>;

const SYSTEM_PROMPT = `You score how well a candidate's CV matches a job vacancy's requirements.

Score 0-100 based on overlap between what the vacancy asks for (skills, stack, seniority, domain) and what the CV demonstrates. Weigh explicit technical requirements most heavily; treat "nice to have" items as minor. A candidate missing one or two secondary requirements but strong on the core stack should still score reasonably high (60-80). A candidate with a fundamentally different stack or seniority level should score low (0-30).

List matched and missing requirements as short phrases, not full sentences.

Respond with a JSON object of this exact shape: {"score": 75, "matchedRequirements": ["..."], "missingRequirements": ["..."]}`;

export async function scoreMatch(
  cvText: string,
  vacancyText: string,
): Promise<MatchResult> {
  const response = await client.chat.completions.create({
    model: "deepseek-flash",
    max_tokens: 2048,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `CV:\n${cvText}\n\n---\n\nVacancy:\n${vacancyText}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const parsed = tryParseJson(response.choices[0]?.message.content, MatchResultSchema);
  if (!parsed) {
    throw new Error("DeepSeek did not return a parseable match result");
  }
  return parsed;
}

const COVER_LETTER_SYSTEM_PROMPT = `You write short, specific cover letters (motivational letters) for IT job applications on djinni.co.

Rules:
- Write the letter in the language given by the "Letter language" instruction in the user message — this overrides whatever language the CV or vacancy happen to be in.
- 80-130 words, professional but direct tone typical for the Ukrainian IT job market — no generic filler ("I am writing to express my interest...").
- Open with the one or two things from the CV that most directly match the vacancy's core requirements.
- Mention the specific technology/domain overlap, not vague enthusiasm.
- End with a short, concrete closing line (availability to discuss, not a generic sign-off).
- Output only the letter text, no subject line, no greeting placeholders like "[Name]".`;

// Heuristic language detection: the letter should match the vacancy's
// language, not the CV's — Claude was unreliable inferring this from prose
// instructions alone, so it's decided in code and stated explicitly.
function detectLetterLanguage(vacancyText: string): "Ukrainian" | "English" {
  const cyrillic = vacancyText.match(/[а-яіїєґА-ЯІЇЄҐ]/g)?.length ?? 0;
  const latin = vacancyText.match(/[a-zA-Z]/g)?.length ?? 0;
  return cyrillic > latin * 0.3 ? "Ukrainian" : "English";
}

export async function generateCoverLetter(
  cvText: string,
  vacancyText: string,
): Promise<string> {
  const letterLanguage = detectLetterLanguage(vacancyText);

  const response = await client.chat.completions.create({
    model: "deepseek-flash",
    max_tokens: 1024,
    messages: [
      { role: "system", content: COVER_LETTER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Letter language: ${letterLanguage}\n\nCV:\n${cvText}\n\n---\n\nVacancy:\n${vacancyText}`,
      },
    ],
  });

  const text = response.choices[0]?.message.content;
  if (!text) {
    throw new Error("DeepSeek did not return a text cover letter");
  }
  return text.trim();
}

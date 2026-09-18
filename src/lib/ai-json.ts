import type { z } from "zod";

// DeepSeek's JSON mode (unlike Anthropic/OpenAI structured outputs) only
// guarantees syntactically valid JSON, not a specific shape — the model can
// still return valid JSON that doesn't match what we asked for, or (per
// DeepSeek's own docs) occasionally empty content. Validate defensively
// instead of trusting the response.
export function tryParseJson<T>(
  content: string | null | undefined,
  schema: z.ZodType<T>,
): T | null {
  if (!content) return null;
  try {
    const result = schema.safeParse(JSON.parse(content));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

import type OpenAI from "openai";
import type { z } from "zod";

// deepseek-flash is a reasoning model: by default it spends completion
// tokens on a hidden chain-of-thought (returned as reasoning_content)
// before writing the actual answer. On a low/exhausted max_tokens budget
// (easy to hit on real, long CV/vacancy text) the budget runs out mid-thought
// and `content` comes back empty with finish_reason "length" — reproduced
// directly against the live API. Disabling thinking (DeepSeek-specific,
// outside the OpenAI SDK's types) skips the chain-of-thought entirely so the
// full budget goes to the answer.
export function noThinking(
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
  return {
    ...params,
    thinking: { type: "disabled" },
  } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
}

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

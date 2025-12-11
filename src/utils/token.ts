import { encodingForModel } from "js-tiktoken";

// Cache the encoder instance to avoid recreating it frequently
// However, js-tiktoken handles this relatively efficiently.
// We'll use a standard GPT-4/3.5 compatible encoding (cl100k_base) as a default fallback
// since it covers most modern models.
let encoder: any = null;

export function getEncoder() {
  if (!encoder) {
    try {
      encoder = encodingForModel("gpt-3.5-turbo");
    } catch (e) {
      console.warn("Failed to initialize tiktoken encoder, fallback to simple estimation", e);
    }
  }
  return encoder;
}

/**
 * Estimate token count for a text string.
 * Uses js-tiktoken if available, otherwise falls back to a simple char/4 estimation.
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  const enc = getEncoder();
  if (enc) {
    return enc.encode(text).length;
  }
  // Fallback: rough estimation
  return Math.ceil(text.length / 4);
}

/**
 * Calculate total tokens for a conversation context.
 * This is an approximation as exact formatting (chat template) adds overhead.
 */
export function countContextTokens(messages: { role: string; content: string }[]): number {
  if (!messages || messages.length === 0) return 0;
  const enc = getEncoder();
  if (!enc) {
    return messages.reduce((acc, m) => acc + countTokens(m.content), 0);
  }

  // OpenAI chat format overhead approximation (cl100k_base)
  // ~4 tokens per message (role, content, etc.) + 3 tokens for the assistant reply prime
  let numTokens = 0;
  for (const message of messages) {
    numTokens += 4; // every message follows <im_start>{role/name}\n{content}<im_end>\n
    numTokens += countTokens(message.content);
  }
  numTokens += 3; // every reply is primed with <im_start>assistant
  return numTokens;
}

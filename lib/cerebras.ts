// Thin client for the Cerebras Inference API (OpenAI-compatible).
// Docs: https://inference-docs.cerebras.ai

const BASE_URL = "https://api.cerebras.ai/v1";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function apiKey(): string {
  const key = process.env.CEREBRAS_API_KEY;
  if (!key) throw new Error("CEREBRAS_API_KEY is not set");
  return key;
}

export const PLANNER_MODEL = process.env.CEREBRAS_PLANNER_MODEL || "llama3.1-8b";
export const WRITER_MODEL = process.env.CEREBRAS_WRITER_MODEL || "llama-3.3-70b";

// Non-streaming completion. Used for the fast planning step.
export async function chat(
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number; jsonMode?: boolean } = {}
): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: opts.model || WRITER_MODEL,
      messages,
      temperature: opts.temperature ?? 0.2,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Cerebras error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// Streaming completion. Yields content deltas as they arrive.
export async function* chatStream(
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number } = {}
): AsyncGenerator<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: opts.model || WRITER_MODEL,
      messages,
      temperature: opts.temperature ?? 0.3,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Cerebras stream error ${res.status}: ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // ignore keep-alive / partial chunks
      }
    }
  }
}

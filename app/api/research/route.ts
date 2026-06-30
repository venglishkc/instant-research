import { NextRequest } from "next/server";
import { chat, chatStream, PLANNER_MODEL, WRITER_MODEL } from "@/lib/cerebras";
import { searchAll, SubQueryResult } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each line we push down the stream is a JSON event the client renders live.
type Event =
  | { type: "stage"; stage: string; ms?: number; model?: string }
  | { type: "subqueries"; queries: string[]; ms: number }
  | { type: "sources"; results: SubQueryResult[]; ms: number; count: number }
  | { type: "token"; text: string }
  | { type: "done"; totalMs: number; ttftMs: number; sourceCount: number }
  | { type: "error"; message: string };

const PLANNER_SYSTEM = `You are a research planner. Given a user's question, break it into 4-8 focused web-search queries that together cover the question from multiple angles (definitions, latest data, opposing views, specifics).
Return ONLY a JSON object: {"queries": ["...", "..."]}. No commentary.`;

function writerSystem(sources: SubQueryResult[]): string {
  const numbered: string[] = [];
  let i = 1;
  for (const sq of sources) {
    for (const r of sq.results) {
      numbered.push(`[${i}] ${r.title} — ${r.url}\n${r.content}`);
      i++;
    }
  }
  return `You are a sharp research analyst. Using ONLY the numbered sources below, write a clear, well-structured answer to the user's question.
Cite sources inline with bracketed numbers like [1], [3]. Be specific and concise. If sources conflict, say so. End with a short "Sources" list mapping numbers to URLs.

SOURCES:
${numbered.join("\n\n")}`;
}

export async function POST(req: NextRequest) {
  const { question } = await req.json().catch(() => ({ question: "" }));
  if (!question || typeof question !== "string") {
    return new Response(JSON.stringify({ error: "Missing 'question'" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const t0 = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Event) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));

      try {
        // 1) PLAN — fast model decomposes the question into parallel sub-queries.
        send({ type: "stage", stage: "planning", model: PLANNER_MODEL });
        const planStart = Date.now();
        const planRaw = await chat(
          [
            { role: "system", content: PLANNER_SYSTEM },
            { role: "user", content: question },
          ],
          { model: PLANNER_MODEL, temperature: 0.3, jsonMode: true }
        );
        let queries: string[] = [];
        try {
          queries = JSON.parse(planRaw).queries ?? [];
        } catch {
          queries = [question];
        }
        queries = queries.filter(Boolean).slice(0, 8);
        if (queries.length === 0) queries = [question];
        send({ type: "subqueries", queries, ms: Date.now() - planStart });

        // 2) SEARCH — every sub-query in parallel.
        send({ type: "stage", stage: "searching" });
        const searchStart = Date.now();
        const results = await searchAll(queries, 4);
        const sourceCount = results.reduce((n, r) => n + r.results.length, 0);
        send({
          type: "sources",
          results,
          ms: Date.now() - searchStart,
          count: sourceCount,
        });

        // 3) SYNTHESIZE — stream a cited answer token by token.
        send({ type: "stage", stage: "synthesizing", model: WRITER_MODEL });
        let ttftMs = 0;
        let gotFirst = false;
        for await (const delta of chatStream(
          [
            { role: "system", content: writerSystem(results) },
            { role: "user", content: question },
          ],
          { model: WRITER_MODEL, temperature: 0.3 }
        )) {
          if (!gotFirst) {
            gotFirst = true;
            ttftMs = Date.now() - t0;
          }
          send({ type: "token", text: delta });
        }

        send({
          type: "done",
          totalMs: Date.now() - t0,
          ttftMs,
          sourceCount,
        });
      } catch (err: any) {
        send({ type: "error", message: err?.message || "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

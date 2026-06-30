"use client";

import { useRef, useState } from "react";

type SubQueryResult = {
  query: string;
  results: { title: string; url: string; content: string }[];
  ms: number;
};

const STAGES = ["planning", "searching", "synthesizing"] as const;
type Stage = (typeof STAGES)[number];

const EXAMPLES = [
  "What are the tradeoffs of wafer-scale chips vs. GPU clusters for LLM inference?",
  "How fast is Cerebras inference compared to typical GPU serving, and why?",
  "What's the current state of open-weight models good enough for agents?",
];

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function Page() {
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [doneStages, setDoneStages] = useState<Set<string>>(new Set());
  const [subqueries, setSubqueries] = useState<string[]>([]);
  const [planMs, setPlanMs] = useState<number | null>(null);
  const [sources, setSources] = useState<SubQueryResult[]>([]);
  const [searchMs, setSearchMs] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [ttft, setTtft] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [sourceCount, setSourceCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  async function run(q: string) {
    if (!q.trim() || running) return;
    setRunning(true);
    setStage(null);
    setDoneStages(new Set());
    setSubqueries([]);
    setPlanMs(null);
    setSources([]);
    setSearchMs(null);
    setAnswer("");
    setTtft(null);
    setTotal(null);
    setSourceCount(null);
    setError(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          switch (e.type) {
            case "stage":
              setStage(e.stage);
              setDoneStages((prev) => {
                const next = new Set(prev);
                const idx = STAGES.indexOf(e.stage);
                for (let i = 0; i < idx; i++) next.add(STAGES[i]);
                return next;
              });
              break;
            case "subqueries":
              setSubqueries(e.queries);
              setPlanMs(e.ms);
              break;
            case "sources":
              setSources(e.results);
              setSearchMs(e.ms);
              setSourceCount(e.count);
              break;
            case "token":
              setAnswer((a) => a + e.text);
              requestAnimationFrame(() => {
                answerRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
              });
              break;
            case "done":
              setTotal(e.totalMs);
              setTtft(e.ttftMs);
              setSourceCount(e.sourceCount);
              setDoneStages(new Set(STAGES));
              setStage(null);
              break;
            case "error":
              setError(e.message);
              break;
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="wrap">
      <div className="hero">
        <h1>
          Instant <span className="grad">Research</span>
        </h1>
        <p>
          Ask anything. The agent fans out a handful of web searches in parallel and writes a
          cited answer — in seconds, on the Cerebras Inference API.
        </p>
      </div>

      <div className="searchbar">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run(question)}
          placeholder="Ask a research question…"
          disabled={running}
        />
        <button onClick={() => run(question)} disabled={running || !question.trim()}>
          {running ? "Researching…" : "Research"}
        </button>
      </div>

      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            className="chip"
            onClick={() => {
              setQuestion(ex);
              run(ex);
            }}
            disabled={running}
          >
            {ex.length > 52 ? ex.slice(0, 52) + "…" : ex}
          </button>
        ))}
      </div>

      {(running || total !== null) && (
        <>
          <div className="metrics">
            <div className="metric">
              <div className="label">Time to first token</div>
              <div className="value accent">{ttft !== null ? `${(ttft / 1000).toFixed(2)}s` : "…"}</div>
            </div>
            <div className="metric">
              <div className="label">Total time</div>
              <div className="value good">{total !== null ? `${(total / 1000).toFixed(2)}s` : "…"}</div>
            </div>
            <div className="metric">
              <div className="label">Sub-queries</div>
              <div className="value">{subqueries.length || "…"}</div>
            </div>
            <div className="metric">
              <div className="label">Sources read</div>
              <div className="value">{sourceCount ?? "…"}</div>
            </div>
          </div>

          <div className="stages">
            {STAGES.map((s) => (
              <div
                key={s}
                className={
                  "stage " + (stage === s ? "active " : "") + (doneStages.has(s) ? "done" : "")
                }
              >
                <span className="dot" />
                {s[0].toUpperCase() + s.slice(1)}
                {s === "planning" && planMs !== null ? ` · ${planMs}ms` : ""}
                {s === "searching" && searchMs !== null ? ` · ${searchMs}ms` : ""}
              </div>
            ))}
          </div>
        </>
      )}

      {error && <div className="err">⚠ {error}</div>}

      {subqueries.length > 0 && (
        <>
          <div className="section-title">Parallel sub-queries</div>
          <div className="subqueries">
            {subqueries.map((q, i) => (
              <div className="sq" key={i}>
                <span className="q">{q}</span>
                <span className="n">#{i + 1}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {sources.length > 0 && (
        <>
          <div className="section-title">Sources</div>
          <div className="sources">
            {sources.flatMap((sq) =>
              sq.results.map((r, i) => (
                <div className="src" key={`${sq.query}-${i}`}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                  <div className="host">{host(r.url)}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {(answer || stage === "synthesizing") && (
        <>
          <div className="section-title">Answer</div>
          <div className="answer" ref={answerRef}>
            {answer}
            {running && stage === "synthesizing" && <span className="cursor" />}
          </div>
        </>
      )}

      <div className="foot">
        Built on the{" "}
        <a href="https://inference-docs.cerebras.ai" target="_blank" rel="noreferrer">
          Cerebras Inference API
        </a>{" "}
        · search by Tavily
      </div>
    </div>
  );
}

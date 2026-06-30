# ⚡ Instant Research

**An agentic research tool that answers in seconds — not minutes — by exploiting near-instant LLM inference.**

Ask a question and the agent:

1. **Plans** — a fast model decomposes your question into 4–8 focused web-search queries.
2. **Searches** — every sub-query fires **in parallel** against a live web search API.
3. **Synthesizes** — a larger model streams a single, **inline-cited** answer token by token.

The whole loop — plan → multi-search → cited synthesis — typically finishes in **~2–4 seconds**, with the answer starting to stream almost immediately. On a conventional GPU-served stack the same multi-call loop usually takes 20–40s, long enough that products hide it behind a spinner. Here the speed *is* the product: multi-step agentic reasoning becomes interactive.

> Powered by the [Cerebras Inference API](https://inference-docs.cerebras.ai). The point of this repo is to show what becomes possible when inference is no longer the bottleneck — you can afford to make *many* model + retrieval calls per user action and still feel instant.

---

## Why this shows off Cerebras

Most "research agents" are slow because they chain many LLM calls, and each call costs seconds. Cerebras inference runs at thousands of tokens/sec, so the agent can be *deliberately* multi-step — decompose, fan out, synthesize — and still return before the user looks away. The UI surfaces the numbers that make this obvious:

- **Time to first token** (how fast the answer starts)
- **Total time** for the full plan → search → cited answer loop
- **Sub-queries fired** and **sources read** in parallel

Swap `CEREBRAS_*` for any OpenAI-compatible endpoint and the same app gets visibly slower — that contrast is the demo.

---

## Quickstart

```bash
git clone https://github.com/venglishkc/instant-research.git
cd instant-research
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev                  # http://localhost:3000
```

### Required keys

| Variable | Where to get it |
| --- | --- |
| `CEREBRAS_API_KEY` | https://cloud.cerebras.ai |
| `TAVILY_API_KEY` | https://tavily.com (free tier is plenty) |

Optional model overrides:

```
CEREBRAS_PLANNER_MODEL=llama3.1-8b      # fast, used for query decomposition
CEREBRAS_WRITER_MODEL=llama-3.3-70b     # used for the streamed, cited synthesis
```

---

## How it works

```
                      ┌──────────────────────────────────────────┐
  question ──────────▶│  /api/research  (Next.js route, streaming) │
                      └──────────────────────────────────────────┘
                                        │
          1. PLAN  (Cerebras, llama3.1-8b, JSON mode)
                                        │  → ["q1", "q2", ... "qN"]
                                        ▼
          2. SEARCH  (Tavily, all N queries via Promise.all) ── parallel ──▶ sources
                                        │
          3. SYNTHESIZE (Cerebras, llama-3.3-70b, streamed)
                                        │  inline [1][2] citations
                                        ▼
        NDJSON event stream ──▶ live UI (stages, sub-queries, sources, answer, timings)
```

The server streams newline-delimited JSON events (`stage`, `subqueries`, `sources`, `token`, `done`) so the frontend can render each phase the instant it happens.

### Key files

| File | Role |
| --- | --- |
| `app/api/research/route.ts` | The agent: plan → parallel search → streamed cited synthesis |
| `lib/cerebras.ts` | OpenAI-compatible Cerebras client (`chat` + `chatStream`) |
| `lib/search.ts` | Parallel Tavily web search |
| `app/page.tsx` | Live pipeline UI with prominent latency metrics |

---

## Deploy

One-click on [Vercel](https://vercel.com/new): import the repo, add the two env vars, deploy. Works on any Node host (`npm run build && npm start`).

---

## Ideas to extend

- Add a **provider toggle** (Cerebras vs. a GPU-served endpoint) to show the latency gap side by side.
- **Follow-up questions** that reuse already-fetched sources.
- A **speculative branch** mode: generate several candidate answers in parallel and let the user pick.

---

## License

MIT

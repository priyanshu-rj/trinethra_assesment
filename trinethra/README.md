# Trinethra — Supervisor Feedback Analyzer

> **Trinethra** ("Three Eyes" in Sanskrit) is the management layer of PDGMS. This tool is the AI-assisted workflow for processing Fellow performance transcripts — taking a 45-60 minute manual task down to ~10 minutes.

---

## What It Does

A psychology intern pastes a supervisor transcript → clicks **Run Analysis** → gets a structured draft containing:

1. **Rubric Score (1–10)** with justification and bias flags
2. **Extracted Evidence** — specific quotes tagged by signal and dimension
3. **KPI Mapping** — Fellow's work linked to business outcomes
4. **Coverage Gaps** — what the supervisor didn't cover
5. **Follow-up Questions** — ready for the next call

The AI drafts. The intern decides. The tool is designed to prevent automation bias — it shows confidence levels, flags detected supervisor biases, and labels everything as a draft.

---

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- [Ollama](https://ollama.com) installed and running

### Step 1 — Install Ollama & Pull a Model

```bash
# After installing Ollama from https://ollama.com:
ollama pull llama3.2

# Verify it works:
ollama run llama3.2 "Hello"
```

> **Why llama3.2?** It's the best quality-to-speed tradeoff for 8-16GB RAM machines. 3B parameters, fast on CPU, reliable JSON output. Mistral is a good alternative if you have 8+ GB RAM to spare.

### Step 2 — Clone & Install Dependencies

```bash
git clone <your-repo-url>
cd trinethra/backend
npm install
```

### Step 3 — Start the Backend

```bash
cd trinethra/backend
node server.js
```

You should see:
```
🟢 Trinethra backend running on http://localhost:3001
   Ollama URL: http://localhost:11434
   Default model: llama3.2
```

### Step 4 — Open the Frontend

Navigate to: **http://localhost:3001**

The frontend is served by the same Express server (no separate frontend server needed).

---

## Environment Variables (Optional)

```bash
PORT=3001           # Backend port (default: 3001)
OLLAMA_URL=http://localhost:11434   # Ollama URL (default: localhost)
OLLAMA_MODEL=llama3.2               # Default model (default: llama3.2)
```

---

## Ollama Model Used

**Primary: `llama3.2` (3B)**

Chosen because:
- Runs on laptops with 8GB RAM without swapping
- Returns reasonably clean JSON when temperature is set low (0.1)
- Fast enough for iterative testing (~30-60s per transcript on CPU)

**Alternatives that also work well:**
- `mistral` — better reasoning, needs 8GB RAM, ~90s
- `phi3` — Microsoft's 3.8B, similar quality to llama3.2
- `llama3` (8B) — better quality but needs 16GB RAM

The UI auto-detects all installed models from Ollama and lets the user switch.

---

## Architecture Overview

```
Browser (index.html)
    │
    │  POST /api/analyze  { transcript, model }
    ▼
Express Backend (server.js :3001)
    │  builds structured prompt
    │  via prompt.js + rubric.json
    │
    │  POST /api/generate  { model, prompt, stream:false }
    ▼
Ollama (localhost:11434)
    │  raw LLM text response
    ▼
Backend: JSON extraction + sanitization
    │  structured analysis object
    ▼
Browser renders result sections
```

The frontend and backend are served from the same Express server — no CORS complexity, no separate dev servers. `frontend/public/` is served as static files.

---

## Design Challenges Tackled

### Challenge 1: Structured Output Reliability

LLMs don't always return clean JSON. My approach: **four-layer extraction fallback**

1. Direct `JSON.parse()` on the raw response
2. Regex to find the first `{...}` block
3. Strip markdown code fences (`json`) and retry
4. Substring from first `{` to last `}` and retry

If all four fail, the server returns a `422` with the raw output for debugging. Temperature is set to `0.1` (not zero — that causes repetition loops on some models) to maximize consistency.

The prompt also explicitly says: *"Return ONLY the JSON object. No text before or after it."* — this alone eliminates 80% of parse failures.

### Challenge 2: Distinguishing Score 6 vs 7 (The Critical Boundary)

This is the hardest scoring problem — a 6 does excellent work assigned by others, while a 7 expands scope independently. The prompt addresses this directly:

- Explains Layer 1 (execution) vs Layer 2 (systems building) with concrete definitions
- Includes the exact example pairs from the rubric in the prompt
- Instructs the model: *"A Fellow who only does Layer 1 should score no higher than 6"*
- Asks the model to mention Layer 1 vs Layer 2 explicitly in the justification

### Challenge 3: Supervisor Bias Detection

Supervisors are honest but biased in predictable ways. The prompt lists all 5 documented biases (helpfulness bias, presence bias, halo effect, recency bias, dependency trap) and instructs the model to:
- List detected biases in `biasesDetected` array
- Analyze the EVIDENCE, not the supervisor's sentiment
- Flag when "glowing" praise describes task absorption vs actual systems building

The UI renders bias chips in amber/yellow so the intern immediately sees them at the top of the result.

### Challenge 4: Showing Uncertainty (Preventing Automation Bias)

The tool is designed so the intern treats output as a draft, not a verdict:
- Confidence level (low/medium/high) shown prominently
- Bias chips visually warn about detected supervisor biases
- Section headers say "Extracted Evidence" and "Suggested Questions" — not "Findings" or "Conclusions"
- No submit/approve button — the intern takes the analysis to their own workflow

### Challenge 5: Gap Detection (Reasoning About Absence)

Detecting what a transcript *doesn't* say is harder than extracting what it does. My approach:
- The prompt defines all 4 assessment dimensions explicitly
- Instructs the model to check all 4 and include a gap ONLY if evidence is absent or very weak
- Each gap has a `detail` field requiring a specific statement of what's missing (not just "no change management")

---

## What I'd Improve With More Time

1. **Side-by-side view** — Split pane with transcript on left, analysis on right. Clicking an evidence quote highlights the corresponding sentence in the transcript.

2. **Editable analysis** — Let the intern click any field (score, justification, evidence interpretation) and edit it inline. Track what was changed from AI-suggested to intern-edited.

3. **Retry individual sections** — If the score looks wrong, let the intern click "Re-analyze score only" with additional context they type in.

4. **Multi-turn gap filling** — After the intern reviews the gaps and follow-up questions, they mark which ones they'll actually ask. After the next call, they can load both transcripts and get a combined analysis.

5. **Confidence calibration** — After reviewing 50+ transcripts, correlate AI confidence levels with actual intern override rates to calibrate the model's self-assessment.

6. **Streaming output** — Show results section-by-section as they come in rather than waiting for the full response. Makes the wait feel shorter.

---

## Git Commit Strategy

Commits follow this progression (visible in history):
1. `init: project structure and package.json`
2. `backend: express server with health check and ollama proxy`
3. `backend: rubric.json and sample-transcripts.json`
4. `backend: prompt builder with rubric and KPI context`
5. `backend: JSON extraction fallback logic`
6. `frontend: base layout and input panel`
7. `frontend: result rendering — score and evidence sections`
8. `frontend: KPI mapping, gaps, follow-up questions sections`
9. `frontend: ollama status check and sample transcript loader`
10. `polish: error states, loading overlay, word count`

---

## Testing With Sample Transcripts

Three samples are pre-loaded in the app. Expected scores:

| Fellow | Expected | Trap |
|--------|----------|------|
| Karthik Narayanan | 6–7 | Presence bias. Mostly Layer 1. |
| Meena Krishnamurthy | 7–8 | Supervisor critical. Real systems work masked by presence bias. |
| Anil Menon | 5–6 | Helpfulness bias. Task absorption, not systems building. |

If the tool scores all three within ±1 of the expected range, the prompt is working correctly.

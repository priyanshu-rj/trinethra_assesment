// prompt.js — Builds the LLM prompt for transcript analysis
const rubricData = require('./rubric.json');

function buildPrompt(transcript) {
  const rubricText = rubricData.rubric.bands
    .flatMap(b => b.levels)
    .map(l => `  Score ${l.score} — "${l.label}": ${l.description} Signals: ${l.signals.join(', ')}.`)
    .join('\n');

  const kpiText = rubricData.kpis
    .map(k => `  - ${k.label} (${k.id}): ${k.description}`)
    .join('\n');

  const dimensionsText = rubricData.assessmentDimensions
    .map(d => `  - ${d.label} (${d.id}): ${d.description}`)
    .join('\n');

  return `You are a senior performance analyst at DeepThought, a B2B consulting firm. You are analyzing a supervisor's feedback transcript about a DT Fellow — an early-career professional placed inside a client factory to improve operations.

Your job is to produce a structured assessment that a psychology intern will review, edit, and finalize. You are NOT giving a final verdict — you are producing a DRAFT for human review. Be analytical, not generous.

---
## THE TRANSCRIPT
${transcript}

---
## SCORING RUBRIC (1-10)

A Fellow's work has two layers:
- Layer 1 (Execution): Attending meetings, tracking, coordinating, handling tasks. NECESSARY but NOT sufficient.
- Layer 2 (Systems Building): Creating SOPs, trackers, dashboards, accountability structures that CONTINUE WORKING after the Fellow leaves.

A Fellow who only does Layer 1 should score no higher than 6. Layer 2 evidence is required for scores of 7+.

CRITICAL BOUNDARY — 6 vs 7:
- Score 6: "He does everything I give him. Very reliable." → executes tasks DEFINED BY OTHERS
- Score 7: "She noticed our rejection rate spikes on Mondays and started tracking why." → IDENTIFIES PROBLEMS the supervisor hadn't articulated

${rubricText}

---
## SUPERVISOR BIASES TO WATCH FOR

1. Helpfulness bias: "She handles all my calls now" sounds great but is actually task absorption (score 5-6), NOT systems building.
2. Presence bias: "Always on the floor" rated higher than "builds trackers on laptop" — presence ≠ impact.
3. Halo effect: One big positive story coloring entire assessment.
4. Recency bias: Supervisor describes last 2 weeks, not full tenure.
5. Dependency trap: If the Fellow left tomorrow and everything they do stops — that's a 5, not a 9.

---
## 8 BUSINESS KPIs (map the Fellow's work to these)

${kpiText}

IMPORTANT: Supervisors NEVER say "KPI." They describe outcomes in plain language. You must infer which KPI applies. Mark each as "system" (self-sustaining after Fellow leaves) or "personal" (depends on Fellow's presence).

---
## 4 ASSESSMENT DIMENSIONS (check all 4 for gaps)

${dimensionsText}

If a dimension has NO evidence in the transcript, it is a gap requiring follow-up questions.

---
## YOUR TASK

Analyze the transcript and return ONLY a valid JSON object (no markdown, no explanation, no preamble). The JSON must follow this exact structure:

{
  "score": {
    "value": <integer 1-10>,
    "label": "<score label from rubric>",
    "band": "<Need Attention|Productivity|Performance>",
    "justification": "<one paragraph citing specific transcript evidence — mention Layer 1 vs Layer 2 explicitly>",
    "confidence": "<low|medium|high>",
    "biasesDetected": ["<list any supervisor biases detected — be specific>"]
  },
  "evidence": [
    {
      "quote": "<exact or near-exact phrase from transcript>",
      "signal": "<positive|negative|neutral>",
      "dimension": "<execution|systems_building|kpi_impact|change_management>",
      "interpretation": "<one sentence: what this quote reveals about the Fellow's actual performance level>"
    }
  ],
  "kpiMapping": [
    {
      "kpi": "<kpi label>",
      "kpiId": "<kpi id>",
      "evidence": "<what the supervisor said that maps to this KPI>",
      "systemOrPersonal": "<system|personal>"
    }
  ],
  "gaps": [
    {
      "dimension": "<dimension id>",
      "dimensionLabel": "<dimension label>",
      "detail": "<what specifically is missing from the transcript — be concrete>"
    }
  ],
  "followUpQuestions": [
    {
      "question": "<the actual question to ask the supervisor>",
      "targetGap": "<which gap this addresses>",
      "lookingFor": "<what a good answer vs bad answer looks like>"
    }
  ]
}

RULES:
- Extract 4-8 evidence quotes minimum. Include both positive and negative signals.
- gaps array must include ONLY dimensions with NO or VERY WEAK evidence.
- followUpQuestions: provide exactly 3-5 questions, each targeting a specific gap.
- Do NOT inflate the score because the supervisor is happy. Analyze the EVIDENCE, not the sentiment.
- The justification MUST mention the Layer 1 vs Layer 2 distinction explicitly.
- Return ONLY the JSON object. No text before or after it.`;
}

module.exports = { buildPrompt };

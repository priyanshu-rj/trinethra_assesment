// server.js — Trinethra Supervisor Feedback Analyzer Backend
const express = require('express');
const cors = require('cors');
const path = require('path');
const { buildPrompt } = require('./prompt');

const app = express();
const PORT = process.env.PORT || 3001;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: OLLAMA_MODEL });
});

// Load sample transcripts
app.get('/api/transcripts', (req, res) => {
  try {
    const data = require('./sample-transcripts.json');
    res.json(data.transcripts.map(t => ({
      id: t.id,
      fellowName: t.fellow.name,
      company: t.company.name,
      transcript: t.transcript,
      expectedScoreRange: t.expectedScoreRange
    })));
  } catch (err) {
    res.status(500).json({ error: 'Could not load sample transcripts' });
  }
});

// Check Ollama connectivity
app.get('/api/ollama-status', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const data = await response.json();
      const models = (data.models || []).map(m => m.name);
      res.json({ connected: true, models });
    } else {
      res.json({ connected: false, error: 'Ollama returned non-OK status' });
    }
  } catch (err) {
    res.json({ connected: false, error: 'Cannot reach Ollama at ' + OLLAMA_URL });
  }
});

// Main analysis endpoint
app.post('/api/analyze', async (req, res) => {
  const { transcript, model } = req.body;

  if (!transcript || transcript.trim().length < 50) {
    return res.status(400).json({ error: 'Transcript is too short or missing.' });
  }

  const selectedModel = model || OLLAMA_MODEL;
  const prompt = buildPrompt(transcript.trim());

  try {
    // Call Ollama
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selectedModel,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1,  // Low temp for consistent structured output
          num_predict: 3000
        }
      }),
      signal: AbortSignal.timeout(120000)  // 2 min timeout
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      return res.status(502).json({ error: `Ollama error: ${ollamaRes.status} — ${errText}` });
    }

    const ollamaData = await ollamaRes.json();
    const rawResponse = ollamaData.response || '';

    // Parse JSON from LLM response
    const parsed = extractJSON(rawResponse);

    if (!parsed) {
      return res.status(422).json({
        error: 'Could not parse structured output from LLM.',
        raw: rawResponse.substring(0, 500)
      });
    }

    // Validate and sanitize
    const analysis = sanitizeAnalysis(parsed);

    res.json({ success: true, analysis, model: selectedModel });

  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Ollama timed out. Try a smaller model or check if it is running.' });
    }
    console.error('Analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Extract JSON from LLM response (handles common mess-ups)
function extractJSON(text) {
  // Strategy 1: Try direct parse
  try {
    return JSON.parse(text.trim());
  } catch {}

  // Strategy 2: Find JSON block between {} 
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }

  // Strategy 3: Strip markdown fences
  const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {}

  // Strategy 4: Find first { to last }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(text.substring(first, last + 1));
    } catch {}
  }

  return null;
}

// Ensure required fields exist and types are correct
function sanitizeAnalysis(data) {
  return {
    score: {
      value: Math.min(10, Math.max(1, parseInt(data.score?.value) || 5)),
      label: data.score?.label || 'Unknown',
      band: data.score?.band || 'Productivity',
      justification: data.score?.justification || 'No justification provided.',
      confidence: data.score?.confidence || 'medium',
      biasesDetected: Array.isArray(data.score?.biasesDetected) ? data.score.biasesDetected : []
    },
    evidence: Array.isArray(data.evidence) ? data.evidence.slice(0, 12) : [],
    kpiMapping: Array.isArray(data.kpiMapping) ? data.kpiMapping : [],
    gaps: Array.isArray(data.gaps) ? data.gaps : [],
    followUpQuestions: Array.isArray(data.followUpQuestions) ? data.followUpQuestions.slice(0, 5) : []
  };
}

// Serve frontend for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🟢 Trinethra backend running on http://localhost:${PORT}`);
  console.log(`   Ollama URL: ${OLLAMA_URL}`);
  console.log(`   Default model: ${OLLAMA_MODEL}\n`);
});

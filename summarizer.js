/**
 * summarizer.js
 * Pipeline:
 *   1. Translate messages → English          (Google Translate, auto-detect language)
 *   2. Deduplicate near-identical stories    (Jaccard similarity)
 *   3. Batch into groups of LLM_BATCH_SIZE   (default 50 / request)
 *   4. Summarise each batch via LLM          (multi-provider failover)
 *   5. Render Telegram HTML digest
 */

import { translateToEnglish, logTranslationStats, getDeeplUsage } from "./translator.js";
import { chatCompletion, getActiveProviders } from "./llm_providers.js";

const LLM_BATCH_SIZE = parseInt(process.env.GEMINI_BATCH_SIZE || process.env.LLM_BATCH_SIZE || "50", 10);

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
You are a professional news editor. You receive a JSON array of news messages 
from East Asian Telegram channels (Korean, Chinese, Japanese).
Each item: { "id": number, "original": string, "translated": string }

"original" is the raw message (may be Korean, Chinese, or Japanese).
"translated" is an automatic English translation that may be inaccurate, garbled, or incomplete.

For EACH item produce:
  - "headline": one concise, accurate English headline (≤ 12 words)
  - "summary":  2–3 clear, factual English sentences covering key facts and context

IMPORTANT:
- Always cross-reference the original text with the translation.
- If the translation is garbled or wrong, rely on the original text instead.
- Translate any untranslated terms, names, or jargon properly.
- Never leave romanised or transliterated foreign words in the output.

Return ONLY a JSON array — no markdown, no preamble, no extra keys.
Schema: [{ "id": number, "headline": string, "summary": string }, …]`;

// ── Similarity / dedup ────────────────────────────────────────────────────────

function normalise(str) {
  return str.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
}

function jaccardSimilarity(a, b) {
  const A = new Set(a.split(" "));
  const B = new Set(b.split(" "));
  const intersection = [...A].filter((w) => B.has(w)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : intersection / union;
}

function dedup(items) {
  const kept = [];
  for (const item of items) {
    const norm  = normalise(item.translated);
    const isDup = kept.some((k) => jaccardSimilarity(norm, normalise(k.translated)) > 0.7);
    if (!isDup) kept.push(item);
  }
  return kept;
}

// ── LLM batch call (with multi-provider failover) ─────────────────────────────

/**
 * Summarise one batch of translated messages via LLM providers.
 * Uses automatic failover: Gemini → Groq → Cerebras → Qwen.
 * @param {Array<{ id, text, translated }>} batch
 * @returns {Promise<Map<number, { headline, summary }>>}
 */
async function summariseBatch(batch) {
  const payload = batch.map((item) => ({ id: item.id, original: item.text, translated: item.translated }));
  const userMsg = JSON.stringify(payload);

  let raw;
  try {
    const result = await chatCompletion({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userMsg },
      ],
      temperature: 0.3,
    });

    console.log(`[summarizer] ✓ Batch summarised by ${result.provider} (${result.model})`);
    raw = result.content;
  } catch (err) {
    console.error(`[summarizer] All providers failed: ${err.message}`);
    console.error("[summarizer] Using raw translations as fallback.");
    const fallback = new Map();
    for (const item of batch) {
      fallback.set(item.id, {
        headline: item.translated.slice(0, 60),
        summary:  item.translated,
      });
    }
    return fallback;
  }

  // Parse JSON — strip accidental markdown fences
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[summarizer] JSON parse error: ${err.message}\nRaw:\n${raw}`);
    // Fallback: use raw translated text
    parsed = batch.map((item) => ({
      id:       item.id,
      headline: item.translated.slice(0, 60),
      summary:  item.translated,
    }));
  }

  const map = new Map();
  for (const entry of parsed) map.set(entry.id, entry);
  return map;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {Array<{ channel, date, text, url }>} items
 * @returns {Promise<string>} Telegram HTML-formatted digest
 */
export async function buildDigest(items) {
  // 1. Translate
  console.log(`[summarizer] Translating ${items.length} messages …`);
  const translated = [];
  for (const item of items) {
    const eng = await translateToEnglish(item.text);
    translated.push({ ...item, translated: eng });
  }

  // Translation stats
  logTranslationStats();
  const deeplUsage = await getDeeplUsage();
  if (deeplUsage) {
    const pct = ((deeplUsage.used / deeplUsage.limit) * 100).toFixed(1);
    console.log(`[summarizer] DeepL quota: ${deeplUsage.used.toLocaleString()} / ${deeplUsage.limit.toLocaleString()} chars (${pct}% used)`);
  }

  // 2. Deduplicate
  const unique = dedup(translated);
  console.log(`[summarizer] ${unique.length} unique stories after dedup`);

  // 3. Assign sequential IDs for batch tracking
  const numbered = unique.map((item, i) => ({ ...item, id: i + 1 }));

  // 4. Split into batches and summarise via LLM (with failover)
  const batches = [];
  for (let i = 0; i < numbered.length; i += LLM_BATCH_SIZE) {
    batches.push(numbered.slice(i, i + LLM_BATCH_SIZE));
  }

  const providers = getActiveProviders();
  console.log(
    `[summarizer] ${batches.length} batch(es) × ≤${LLM_BATCH_SIZE} items → LLM providers: ${providers.join(", ")}`
  );

  const summaryMap = new Map();
  for (let b = 0; b < batches.length; b++) {
    console.log(`[summarizer] Batch ${b + 1}/${batches.length} …`);
    const batchMap = await summariseBatch(batches[b]);
    for (const [id, val] of batchMap) summaryMap.set(id, val);
  }

  // 5. Render digest grouped by channel (Telegram HTML)
  const byChannel = {};
  for (const item of numbered) {
    if (!byChannel[item.channel]) byChannel[item.channel] = [];
    byChannel[item.channel].push(item);
  }

  const lines  = [];
  let storyNum = 1;

  for (const [channel, stories] of Object.entries(byChannel)) {
    lines.push(`\n<b>── ${channel} ──</b>`);

    for (const s of stories) {
      const sum      = summaryMap.get(s.id);
      const headline = sum?.headline ?? s.translated.slice(0, 60);
      const summary  = sum?.summary  ?? s.translated;

      lines.push(`<b>${storyNum}. ${headline}</b>`);
      lines.push(summary);
      lines.push(`<a href="${s.url}">🔗 Source</a>  <i>${s.date.slice(0, 10)}</i>`);
      lines.push("");
      storyNum++;
    }
  }

  return lines.join("\n").trim();
}

/**
 * llm_providers.js — Multi-provider LLM failover system.
 *
 * Tries providers in priority order:
 *   1. Gemini   (Google AI Studio — free tier)
 *   2. Groq     (ultra-fast inference — free tier)
 *   3. Cerebras (wafer-scale engine — free tier)
 *   4. Qwen     (Alibaba DashScope — free tier)
 *
 * All providers use OpenAI-compatible endpoints, so we reuse the same SDK.
 * Each provider is optional — if its API key env var is missing, it's skipped.
 */

import OpenAI from "openai";

// ── Provider definitions ──────────────────────────────────────────────────────

const PROVIDER_DEFS = [
  {
    name:    "Gemini",
    envKey:  "GEMINI_API_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model:   process.env.GEMINI_MODEL || "gemini-2.5-flash",
  },
  {
    name:    "Groq",
    envKey:  "GROQ_API_KEY",
    baseURL: "https://api.groq.com/openai/v1",
    model:   process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  },
  {
    name:    "Cerebras",
    envKey:  "CEREBRAS_API_KEY",
    baseURL: "https://api.cerebras.ai/v1",
    model:   process.env.CEREBRAS_MODEL || "llama3.3-70b",
  },
  {
    name:    "Qwen",
    envKey:  "QWEN_API_KEY",
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    model:   process.env.QWEN_MODEL || "qwen-turbo",
  },
];

// ── Build active providers list (only those with API keys set) ────────────────

function buildProviders() {
  const providers = [];
  for (const def of PROVIDER_DEFS) {
    const apiKey = process.env[def.envKey];
    if (!apiKey) {
      console.log(`[llm] ${def.name}: skipped (no ${def.envKey})`);
      continue;
    }
    providers.push({
      name:   def.name,
      model:  def.model,
      client: new OpenAI({ apiKey, baseURL: def.baseURL }),
    });
    console.log(`[llm] ${def.name}: ready (model: ${def.model})`);
  }

  if (providers.length === 0) {
    throw new Error(
      "No LLM providers configured. Set at least one API key: " +
      PROVIDER_DEFS.map((d) => d.envKey).join(", ")
    );
  }

  return providers;
}

// ── Failover chat completion ──────────────────────────────────────────────────

const RETRYABLE_CODES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAY_MS  = 3000;

function isRetryable(err) {
  if (err?.status && RETRYABLE_CODES.has(err.status)) return true;
  if (err?.code === "ECONNRESET" || err?.code === "ETIMEDOUT") return true;
  if (err?.message?.includes("fetch failed")) return true;
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let _providers = null;

/**
 * Send a chat completion request with automatic provider failover.
 *
 * @param {Object} options
 * @param {Array}  options.messages  — OpenAI-format messages
 * @param {number} [options.temperature=0.3]
 * @returns {Promise<{ content: string, provider: string, model: string }>}
 */
export async function chatCompletion({ messages, temperature = 0.3 }) {
  if (!_providers) _providers = buildProviders();

  const errors = [];

  for (const provider of _providers) {
    try {
      console.log(`[llm] Trying ${provider.name} (${provider.model}) …`);

      const response = await provider.client.chat.completions.create({
        model:       provider.model,
        temperature,
        messages,
      });

      const content = response.choices[0]?.message?.content?.trim() ?? "";
      console.log(`[llm] ✓ ${provider.name} responded (${content.length} chars)`);

      return {
        content,
        provider: provider.name,
        model:    provider.model,
      };
    } catch (err) {
      const status = err?.status ?? "N/A";
      console.warn(
        `[llm] ✗ ${provider.name} failed (status ${status}): ${err.message}`
      );
      errors.push({ provider: provider.name, error: err.message, status });

      // Small delay before trying next provider
      if (isRetryable(err)) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // All providers failed
  const summary = errors
    .map((e) => `${e.provider}: ${e.status} — ${e.error}`)
    .join("\n  ");
  throw new Error(`All LLM providers failed:\n  ${summary}`);
}

/**
 * Get the list of active provider names.
 * @returns {string[]}
 */
export function getActiveProviders() {
  if (!_providers) _providers = buildProviders();
  return _providers.map((p) => `${p.name} (${p.model})`);
}

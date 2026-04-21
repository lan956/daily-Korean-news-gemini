/**
 * translator.js — Translation with DeepL → Google Translate failover.
 *
 * Priority:
 *   1. DeepL (official API Free — 500K chars/month, requires DEEPL_API_KEY)
 *   2. Google Translate (unofficial, no key needed, may hit 429s)
 *
 * If DEEPL_API_KEY is not set, DeepL is skipped entirely.
 * If DeepL fails (quota exhausted, network error), falls back to Google.
 */

import translate from "@vitalets/google-translate-api";

// ── Lazy-loaded DeepL client ──────────────────────────────────────────────────

let _deeplTranslator = null;
let _deeplAvailable  = null; // null = unchecked, true/false = resolved

/**
 * Attempt to initialise the DeepL client.
 * Returns the translator instance or null if unavailable.
 */
async function getDeeplClient() {
  if (_deeplAvailable === false) return null;
  if (_deeplTranslator) return _deeplTranslator;

  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    console.log("[translator] DeepL: skipped (no DEEPL_API_KEY)");
    _deeplAvailable = false;
    return null;
  }

  try {
    const deepl = await import("deepl-node");
    _deeplTranslator = new deepl.Translator(apiKey);
    _deeplAvailable  = true;
    console.log("[translator] DeepL: ready");
    return _deeplTranslator;
  } catch (err) {
    console.warn(`[translator] DeepL init failed: ${err.message}`);
    _deeplAvailable = false;
    return null;
  }
}

// ── Configuration ─────────────────────────────────────────────────────────────

const DELAY_MS     = 300;   // ms between Google requests — be polite
const MAX_RETRIES  = 3;
const RETRY_DELAY  = 2000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── DeepL target language mapping ─────────────────────────────────────────────
// DeepL uses specific language codes; "en-US" or "en-GB" for English.

const DEEPL_TARGET_LANG = "en-US";

// ── DeepL translation ─────────────────────────────────────────────────────────

/**
 * Translate text via DeepL.
 * @param {string} text
 * @returns {Promise<string|null>} translated text, or null on failure
 */
async function translateWithDeepl(text) {
  const client = await getDeeplClient();
  if (!client) return null;

  try {
    const result = await client.translateText(text, null, DEEPL_TARGET_LANG);
    return result.text;
  } catch (err) {
    const isQuota = err?.message?.includes("Quota") || err?.message?.includes("quota")
                 || err?.message?.includes("limit") || err?.message?.includes("456");
    if (isQuota) {
      console.warn("[translator] DeepL quota exhausted — disabling for this run.");
      _deeplAvailable = false;
    } else {
      console.warn(`[translator] DeepL error: ${err.message}`);
    }
    return null;
  }
}

// ── Google Translate (fallback) ───────────────────────────────────────────────

/**
 * Translate text via Google Translate with retries.
 * @param {string} text
 * @returns {Promise<string>} translated text (or original on total failure)
 */
async function translateWithGoogle(text) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await translate(text, { from: "auto", to: "en" });
      await sleep(DELAY_MS);
      return result.text;
    } catch (err) {
      const isRateLimit = err?.message?.includes("429") || err?.message?.includes("Too Many");
      console.warn(`[translator] Google attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(isRateLimit ? RETRY_DELAY * attempt : RETRY_DELAY);
      }
    }
  }
  console.error("[translator] Google: all retries exhausted — returning original text.");
  return text;
}

// ── Public API ────────────────────────────────────────────────────────────────

// Track provider usage for logging
let _deeplCount  = 0;
let _googleCount = 0;

/**
 * Translate a single string to English (auto-detects source language).
 * Tries DeepL first, falls back to Google Translate.
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function translateToEnglish(text) {
  // Try DeepL first
  const deeplResult = await translateWithDeepl(text);
  if (deeplResult) {
    _deeplCount++;
    return deeplResult;
  }

  // Fallback to Google
  const googleResult = await translateWithGoogle(text);
  _googleCount++;
  return googleResult;
}

/**
 * Log translation provider usage stats.
 * Call at end of run for visibility.
 */
export function logTranslationStats() {
  const total = _deeplCount + _googleCount;
  console.log(
    `[translator] Stats: ${total} translations — DeepL: ${_deeplCount}, Google: ${_googleCount}`
  );
}

/**
 * Check remaining DeepL usage (if available).
 * @returns {Promise<{used: number, limit: number}|null>}
 */
export async function getDeeplUsage() {
  const client = await getDeeplClient();
  if (!client) return null;

  try {
    const usage = await client.getUsage();
    if (usage.character) {
      return {
        used:  usage.character.count,
        limit: usage.character.limit,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * sender.js — sends the digest to a Telegram chat via Bot API.
 * Splits messages that exceed Telegram's 4096-char limit.
 */

import { BOT_TOKEN, TARGET_CHAT_ID } from "./config.js";

const TG_API  = `https://api.telegram.org/bot${BOT_TOKEN}`;
const MAX_LEN = 4096;
const RETRIES = 3;
const RETRY_DELAY = 5000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function splitMessage(text, maxLen = MAX_LEN) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let current  = "";

  for (const block of text.split("\n\n")) {
    const candidate = current ? current + "\n\n" + block : block;
    if (candidate.length > maxLen) {
      if (current) chunks.push(current.trim());
      current = block;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function postPart(text, attempt = 1) {
  const res = await fetch(`${TG_API}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      chat_id:                  TARGET_CHAT_ID,
      text,
      parse_mode:               "HTML",
      disable_web_page_preview: true,
    }),
  });

  const data = await res.json();
  if (data.ok) return;

  if (attempt < RETRIES) {
    console.warn(`[sender] Retry ${attempt}: ${JSON.stringify(data)}`);
    await sleep(RETRY_DELAY);
    return postPart(text, attempt + 1);
  }

  throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
}

/**
 * @param {string} title  — header line
 * @param {string} digest — HTML body
 */
export async function sendDigest(title, digest) {
  const full   = `${title}\n\n${digest}`;
  const parts  = splitMessage(full);

  console.log(`[sender] Sending digest (${parts.length} part(s)) …`);

  for (let i = 0; i < parts.length; i++) {
    const suffix = parts.length > 1 ? `\n\n<i>(${i + 1}/${parts.length})</i>` : "";
    await postPart(parts[i] + suffix);
    if (i < parts.length - 1) await sleep(1000); // flood-limit guard
  }

  console.log("[sender] Digest sent ✓");
}

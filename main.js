/**
 * main.js — entry point for the Korean News Digest Bot.
 */

import { initReader, fetchRecentMessages, destroyReader } from "./reader.js";
import { buildDigest }         from "./summarizer.js";
import { sendDigest }          from "./sender.js";
import { CHANNELS, DIGEST_TITLE } from "./config.js";

async function run() {
  const runAt = new Date().toUTCString();
  console.log(`=== Korean News Digest — ${runAt} ===`);

  await initReader();
  const allItems = [];

  for (const channel of CHANNELS) {
    try {
      const msgs = await fetchRecentMessages(channel);
      allItems.push(...msgs);
    } catch (err) {
      console.error(`[main] Failed to fetch ${channel}: ${err.message}`);
    }
  }

  // Fully kill GramJS to prevent background _updateLoop timeouts later
  await destroyReader();

  if (allItems.length === 0) {
    console.warn("[main] No messages found — skipping digest.");
    process.exit(0);
  }

  const digest = await buildDigest(allItems);
  const title  = `📰 <b>${DIGEST_TITLE}</b>\n<i>${runAt}</i>`;

  await sendDigest(title, digest);
  process.exit(0);
}

run().catch((err) => {
  console.error("[main] Fatal error:", err);
  process.exit(1);
});

/**
 * reader.js — fetch recent messages from public Telegram channels via GramJS (MTProto).
 * Uses a StringSession so no interactive login is needed in CI.
 */

import { TelegramClient } from "telegram";
import { StringSession }  from "telegram/sessions/index.js";
import {
  TG_API_ID,
  TG_API_HASH,
  TG_SESSION_STRING,
  LOOKBACK_HOURS,
  MAX_MSGS_PER_CH,
} from "./config.js";

const CUTOFF_MS = LOOKBACK_HOURS * 60 * 60 * 1000;

function buildUrl(channel, msgId) {
  const username = channel.replace(/^@/, "");
  return `https://t.me/${username}/${msgId}`;
}

let _client = null;

/**
 * Initialize the Telegram client once.
 */
export async function initReader() {
  if (_client) return;
  const session = new StringSession(TG_SESSION_STRING);
  _client = new TelegramClient(session, TG_API_ID, TG_API_HASH, {
    connectionRetries: 3,
  });
  await _client.connect();
}

/**
 * Destroy the Telegram client to kill background update loops.
 */
export async function destroyReader() {
  if (_client) {
    if (typeof _client.destroy === "function") {
      await _client.destroy();
    } else {
      await _client.disconnect();
    }
    _client = null;
  }
}

/**
 * @returns {Promise<Array<{ channel, messageId, date, text, url }>>}
 */
export async function fetchRecentMessages(channel) {
  if (!_client) throw new Error("Reader not initialized. Call initReader() first.");

  const cutoff = Date.now() - CUTOFF_MS;
  const items  = [];

  const messages = await _client.getMessages(channel, { limit: MAX_MSGS_PER_CH });

  for (const msg of messages) {
    const ts = msg.date * 1000; // GramJS uses Unix seconds
    if (ts < cutoff) continue;

    const text = (msg.message || "").trim();
    if (!text || text.length < 20) continue; // skip stickers / empty

    items.push({
      channel,
      messageId: msg.id,
      date:      new Date(ts).toISOString(),
      text,
      url:       buildUrl(channel, msg.id),
    });
  }

  console.log(`[reader] ${channel}: ${items.length} messages fetched`);
  return items;
}

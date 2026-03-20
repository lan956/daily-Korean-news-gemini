"""
Korean News Digest Bot
Reads from Korean Telegram channels, translates + summarizes via Claude, sends digest.
"""

import asyncio
import logging
from datetime import datetime, timezone

from reader import fetch_recent_messages
from summarizer import translate_and_summarize
from sender import send_digest
from config import CHANNELS, DIGEST_TITLE

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


async def run():
    log.info("=== Korean News Digest — starting run ===")
    run_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    all_items = []

    for channel in CHANNELS:
        log.info(f"Fetching from {channel} …")
        try:
            messages = await fetch_recent_messages(channel)
            log.info(f"  {len(messages)} messages fetched")
            all_items.extend(messages)
        except Exception as exc:
            log.error(f"  Failed to fetch {channel}: {exc}")

    if not all_items:
        log.warning("No messages found — skipping digest.")
        return

    log.info(f"Translating & summarising {len(all_items)} messages …")
    digest = await translate_and_summarize(all_items)

    log.info("Sending digest …")
    await send_digest(
        title=f"📰 {DIGEST_TITLE} — {run_at}",
        digest=digest,
    )
    log.info("Done ✓")


if __name__ == "__main__":
    asyncio.run(run())

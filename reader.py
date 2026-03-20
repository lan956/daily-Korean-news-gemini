"""
reader.py — fetch messages from public Telegram channels via Telethon (MTProto).
Uses a StringSession so no interactive login is needed in CI.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import Message

from config import TG_API_ID, TG_API_HASH, TG_SESSION_STRING, LOOKBACK_HOURS, MAX_MSGS_PER_CH

log = logging.getLogger(__name__)


@dataclass
class NewsItem:
    channel: str
    message_id: int
    date: datetime
    text: str
    url: str


def _build_url(channel: str, msg_id: int) -> str:
    username = channel.lstrip("@")
    return f"https://t.me/{username}/{msg_id}"


async def fetch_recent_messages(channel: str) -> list[NewsItem]:
    """Return up to MAX_MSGS_PER_CH messages from *channel* posted in the last LOOKBACK_HOURS."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)
    items: list[NewsItem] = []

    async with TelegramClient(
        StringSession(TG_SESSION_STRING), TG_API_ID, TG_API_HASH
    ) as client:
        async for msg in client.iter_messages(channel, limit=MAX_MSGS_PER_CH):
            if not isinstance(msg, Message):
                continue
            if msg.date < cutoff:
                break                           # messages are newest-first; stop early
            text = (msg.text or "").strip()
            if not text or len(text) < 20:      # skip stickers / very short service msgs
                continue
            items.append(
                NewsItem(
                    channel=channel,
                    message_id=msg.id,
                    date=msg.date,
                    text=text,
                    url=_build_url(channel, msg.id),
                )
            )
            if len(items) >= MAX_MSGS_PER_CH:
                break

    log.debug(f"{channel}: {len(items)} usable messages since {cutoff.isoformat()}")
    return items

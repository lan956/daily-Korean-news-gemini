"""
sender.py — sends the final digest to a Telegram channel/chat via Bot API.
Splits messages that exceed Telegram's 4096-character limit.
"""

from __future__ import annotations

import asyncio
import logging
import httpx

from config import BOT_TOKEN, TARGET_CHAT_ID

log = logging.getLogger(__name__)

_TG_API = f"https://api.telegram.org/bot{BOT_TOKEN}"
_MAX_LEN = 4096
_RETRY_ATTEMPTS = 3
_RETRY_DELAY = 5   # seconds


def _split_message(text: str, max_len: int = _MAX_LEN) -> list[str]:
    """Split on blank lines to keep topics together; never cut mid-paragraph."""
    if len(text) <= max_len:
        return [text]

    chunks: list[str] = []
    current = ""
    for block in text.split("\n\n"):
        candidate = (current + "\n\n" + block).lstrip()
        if len(candidate) > max_len:
            if current:
                chunks.append(current.strip())
            current = block
        else:
            current = candidate
    if current.strip():
        chunks.append(current.strip())
    return chunks


async def _post(client: httpx.AsyncClient, text: str) -> None:
    payload = {
        "chat_id": TARGET_CHAT_ID,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    for attempt in range(1, _RETRY_ATTEMPTS + 1):
        try:
            resp = await client.post(f"{_TG_API}/sendMessage", json=payload, timeout=30)
            data = resp.json()
            if data.get("ok"):
                return
            log.error(f"Telegram API error: {data}")
        except httpx.RequestError as exc:
            log.warning(f"Request error (attempt {attempt}): {exc}")
        if attempt < _RETRY_ATTEMPTS:
            await asyncio.sleep(_RETRY_DELAY)
    raise RuntimeError("All retry attempts to Telegram API exhausted.")


async def send_digest(title: str, digest: str) -> None:
    """Send title + digest (possibly multi-part) to TARGET_CHAT_ID."""
    full_text = f"{title}\n\n{digest}"
    parts = _split_message(full_text)

    async with httpx.AsyncClient() as client:
        for i, part in enumerate(parts, 1):
            suffix = f"\n\n<i>({i}/{len(parts)})</i>" if len(parts) > 1 else ""
            await _post(client, part + suffix)
            if len(parts) > 1:
                await asyncio.sleep(1)   # avoid flood limits

    log.info(f"Digest sent ({len(parts)} part(s)).")

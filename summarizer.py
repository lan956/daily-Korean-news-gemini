"""
summarizer.py — sends raw Korean messages to Claude for translation + summarization.
Returns a structured digest string ready to be posted.
"""

from __future__ import annotations

import json
import logging
import anthropic

from reader import NewsItem
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL, MAX_TOKENS

log = logging.getLogger(__name__)

_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

_SYSTEM_PROMPT = """\
You are a bilingual Korean-English news editor.
You will receive a JSON list of recent Korean news messages.
Each item has: channel, date, text (Korean), url.

Your task:
1. Group semantically related messages into distinct news topics.
2. For each topic produce:
   - A concise English headline (≤ 12 words)
   - A 2–4 sentence English summary covering key facts, figures, and context.
   - The single most relevant source URL.
3. Return ONLY a JSON array — no markdown fences, no extra text.

Schema per topic:
{
  "headline": "string",
  "summary": "string",
  "source_url": "string"
}

Guidelines:
- Maximum 15 topics total; merge minor duplicates.
- Keep summaries factual and neutral.
- If a message is not news (ad, poll, sticker description), discard it.
"""


def _build_user_payload(items: list[NewsItem]) -> str:
    payload = [
        {
            "channel": item.channel,
            "date": item.date.isoformat(),
            "text": item.text,
            "url": item.url,
        }
        for item in items
    ]
    return json.dumps(payload, ensure_ascii=False)


def _topics_to_digest(topics: list[dict]) -> str:
    """Render topic list to a clean Telegram HTML-safe string."""
    lines: list[str] = []
    for i, t in enumerate(topics, 1):
        lines.append(f"<b>{i}. {t['headline']}</b>")
        lines.append(t["summary"])
        lines.append(f'<a href="{t["source_url"]}">Source</a>')
        lines.append("")          # blank line between topics
    return "\n".join(lines).strip()


async def translate_and_summarize(items: list[NewsItem]) -> str:
    """Call Claude to translate, cluster, and summarise; return formatted digest."""
    user_payload = _build_user_payload(items)

    log.info(f"Calling Claude ({CLAUDE_MODEL}) with {len(items)} messages …")
    response = _client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=MAX_TOKENS,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_payload}],
    )

    raw = response.content[0].text.strip()

    # Strip accidental markdown fences
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        raw = raw.rsplit("```", 1)[0]

    try:
        topics: list[dict] = json.loads(raw)
    except json.JSONDecodeError as exc:
        log.error(f"Failed to parse Claude JSON: {exc}\nRaw output:\n{raw}")
        # Fallback: send raw text
        return raw

    log.info(f"Parsed {len(topics)} topics from Claude.")
    return _topics_to_digest(topics)

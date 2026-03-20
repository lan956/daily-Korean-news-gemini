"""
config.py — all settings pulled from environment variables.
Never hard-code secrets here; set them in .env (local) or GitHub Secrets (CI).
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── Telegram MTProto (Telethon) ──────────────────────────────────────────────
# Obtain from https://my.telegram.org/apps
TG_API_ID   = int(os.environ["TG_API_ID"])
TG_API_HASH = os.environ["TG_API_HASH"]

# A pre-generated .session file string (base64) so CI doesn't need interactive login.
# Generate locally with: python scripts/gen_session.py
TG_SESSION_STRING = os.environ["TG_SESSION_STRING"]

# ── Telegram Bot (for sending) ───────────────────────────────────────────────
BOT_TOKEN      = os.environ["BOT_TOKEN"]
TARGET_CHAT_ID = os.environ["TARGET_CHAT_ID"]   # e.g. "@mychannel" or "-100123456789"

# ── Anthropic Claude ─────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

# ── Source channels ──────────────────────────────────────────────────────────
# Public channel usernames or invite links (must be joined by the user account)
CHANNELS: list[str] = [
    ch.strip()
    for ch in os.getenv(
        "SOURCE_CHANNELS",
        "@yonhap_news_kor,@kbs_news,@mbc_news_korea",
    ).split(",")
    if ch.strip()
]

# ── Behaviour ────────────────────────────────────────────────────────────────
LOOKBACK_HOURS   = int(os.getenv("LOOKBACK_HOURS", "24"))
MAX_MSGS_PER_CH  = int(os.getenv("MAX_MSGS_PER_CH", "30"))   # cap per channel
DIGEST_TITLE     = os.getenv("DIGEST_TITLE", "Korean News Digest")
CLAUDE_MODEL     = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")
MAX_TOKENS       = int(os.getenv("MAX_TOKENS", "4096"))

"""
scripts/gen_session.py
Run this ONCE locally to generate a TG_SESSION_STRING for use in GitHub Secrets.

Usage:
    pip install telethon python-dotenv
    python scripts/gen_session.py

You will be prompted for your phone number and a Telegram login code.
The resulting string goes into your .env and GitHub Secret TG_SESSION_STRING.
"""

import asyncio
from telethon import TelegramClient
from telethon.sessions import StringSession
import os
from dotenv import load_dotenv

load_dotenv()


async def main():
    api_id   = int(input("TG_API_ID  : "))
    api_hash = input("TG_API_HASH: ").strip()

    async with TelegramClient(StringSession(), api_id, api_hash) as client:
        session_string = client.session.save()

    print("\n✅ Session string (copy this into TG_SESSION_STRING):\n")
    print(session_string)
    print()


if __name__ == "__main__":
    asyncio.run(main())

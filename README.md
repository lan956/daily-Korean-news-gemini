# 🗞️ Korean News Digest Bot

A GitHub Actions-powered Telegram bot that:
1. Reads messages from Korean Telegram news channels (via **Telethon**)
2. Translates & summarises them into English (via **Claude**)
3. Sends a clean daily digest to your personal Telegram channel (via **Bot API**)

---

## Project Structure

```
korean-news-bot/
├── main.py               # Entry point
├── reader.py             # Telethon: fetch messages from channels
├── summarizer.py         # Anthropic Claude: translate + summarise
├── sender.py             # Telegram Bot API: send digest
├── config.py             # All settings from env vars
├── requirements.txt
├── .env.example
├── scripts/
│   └── gen_session.py    # One-time helper to generate TG_SESSION_STRING
└── .github/workflows/
    └── daily_digest.yml  # Scheduled GitHub Actions workflow
```

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/korean-news-bot.git
cd korean-news-bot
pip install -r requirements.txt
```

### 2. Telegram credentials

| Credential | How to get |
|---|---|
| `TG_API_ID` / `TG_API_HASH` | [my.telegram.org/apps](https://my.telegram.org/apps) |
| `TG_SESSION_STRING` | Run `python scripts/gen_session.py` once locally |
| `BOT_TOKEN` | Create a bot via [@BotFather](https://t.me/BotFather) |
| `TARGET_CHAT_ID` | Your channel username (`@mychannel`) or numeric ID |

> **Important:** The user account tied to `TG_SESSION_STRING` must have already **joined** all source channels.

### 3. Anthropic API key

Get one at [console.anthropic.com](https://console.anthropic.com).

### 4. Configure `.env` locally

```bash
cp .env.example .env
# fill in all values
```

### 5. Add GitHub Secrets & Variables

Go to **Settings → Secrets and variables → Actions** in your repo.

**Secrets** (sensitive):
- `TG_API_ID`
- `TG_API_HASH`
- `TG_SESSION_STRING`
- `BOT_TOKEN`
- `TARGET_CHAT_ID`
- `ANTHROPIC_API_KEY`

**Variables** (non-sensitive, freely editable):
- `SOURCE_CHANNELS` — comma-separated channel usernames
- `LOOKBACK_HOURS` (default `24`)
- `MAX_MSGS_PER_CH` (default `30`)
- `DIGEST_TITLE`
- `CLAUDE_MODEL`

---

## Scheduling

The workflow runs at **08:00 Hanoi time (01:00 UTC)** daily.  
To change the schedule, edit the `cron` expression in `.github/workflows/daily_digest.yml`.

You can also trigger it manually via **Actions → Daily Korean News Digest → Run workflow**.

---

## Suggested Source Channels

| Channel | Description |
|---|---|
| `@yonhap_news_kor` | Yonhap News Agency |
| `@kbs_news` | KBS News |
| `@mbc_news_korea` | MBC News |
| `@jtbcnews` | JTBC News |
| `@chosunilbo_news` | Chosun Ilbo |

> Channels must be public or the session account must be a member.

---

## Local Test Run

```bash
python main.py
```

---

## License

MIT

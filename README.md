# 🗞️ Korean News Digest Bot

A GitHub Actions-powered Telegram bot that:
1. **Reads** messages from Korean Telegram news channels (via **GramJS** / MTProto)
2. **Translates** them to English (via **@vitalets/google-translate-api** — free, no API key)
3. **Deduplicates** near-identical stories using Jaccard similarity
4. **Summarises** each story with a headline + summary (via **Google Gemini API** — free tier)
5. **Sends** a clean numbered digest to your personal Telegram channel

Zero paid APIs required.

---

## Project Structure

```
korean-news-bot/
├── main.js                      # Entry point
├── reader.js                    # GramJS: fetch messages from channels
├── translator.js                # Google Translate wrapper (retry + rate-limit)
├── summarizer.js                # Translate → dedup → Gemini summarise → digest
├── rate_limiter.js              # Sliding-window limiter (5 RPM, 20 RPD)
├── sender.js                    # Telegram Bot API: send digest
├── config.js                    # All settings from env vars
├── gen_session.js               # One-time helper to generate TG_SESSION_STRING
├── package.json
├── .env.example
└── .github/workflows/
    └── daily_digest.yml         # Scheduled GitHub Actions workflow
```

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/lan956/daily-Korean-news-gemini.git
cd daily-Korean-news-gemini
npm install
```

### 2. Telegram credentials

| Credential | How to get |
|---|---|
| `TG_API_ID` / `TG_API_HASH` | [my.telegram.org/apps](https://my.telegram.org/apps) |
| `TG_SESSION_STRING` | `node gen_session.js` (run once locally) |
| `BOT_TOKEN` | [@BotFather](https://t.me/BotFather) |
| `TARGET_CHAT_ID` | Your channel username or numeric ID |

> **Important:** The user account behind `TG_SESSION_STRING` must have already **joined** all source channels.

### 3. Gemini API key

Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Free tier: **5 req/min (RPM), 20 req/day (RPD), 250 000 tokens/min (TPM)** — the bot is designed around exactly these limits.

### 4. Configure `.env`

```bash
cp .env.example .env
# fill in all values
```

### 5. GitHub Secrets & Variables

Go to **Settings → Secrets and variables → Actions**.

**Secrets** (sensitive):

| Name | Value |
|---|---|
| `TG_API_ID` | from my.telegram.org |
| `TG_API_HASH` | from my.telegram.org |
| `TG_SESSION_STRING` | output of gen_session.js |
| `BOT_TOKEN` | from @BotFather |
| `TARGET_CHAT_ID` | your channel |
| `GEMINI_API_KEY` | from aistudio.google.com |

**Variables** (freely editable):

| Name | Default | Notes |
|---|---|---|
| `SOURCE_CHANNELS` | `@FastStockNews,@HANAchina,@aetherjapanresearch` | comma-separated |
| `LOOKBACK_HOURS` | `4` | how many hours back to look |
| `MAX_MSGS_PER_CH` | `30` | |
| `DIGEST_TITLE` | `Korean News Digest` | |
| `GEMINI_MODEL` | `gemini-2.5-flash-preview-04-17` | any Gemini model via OpenAI-compatible endpoint |
| `GEMINI_BATCH_SIZE` | `50` | messages per Gemini request — Gemini handles large batches well |

---

## Schedule

Runs every **4 hours** (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC). Edit the `cron` line in `.github/workflows/daily_digest.yml` to change it.

Manual trigger: **Actions → Daily Korean News Digest → Run workflow**

---

## Pipeline

```
Korean Telegram channels
      │  GramJS (MTProto)
      ▼
Raw Korean messages
      │  @vitalets/google-translate-api  (free, no key)
      ▼
Translated English messages
      │  Jaccard dedup  (drops >70% similar stories)
      ▼
Unique stories  →  batched at 50/request
      │  Gemini API  (rate-limited: 5 RPM, 20 RPD)
      ▼
{headline, summary} per story
      │  Telegram Bot API
      ▼
Your personal channel
```

### Default Source Channels

| Username | Outlet |
|---|---|
| `@FastStockNews` | Fast Stock News |
| `@HANAchina` | Hana China Research |
| `@aetherjapanresearch` | Aether Japan Research |

---

## Local Test

```bash
node main.js
```

---

## License

MIT

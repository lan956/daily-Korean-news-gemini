/**
 * scripts/gen_session.js
 * Run this ONCE locally to generate TG_SESSION_STRING for GitHub Secrets.
 *
 * Usage:
 *   node scripts/gen_session.js
 *
 * You will be prompted for your phone number and Telegram login code.
 * Copy the printed string into your .env and GitHub Secret TG_SESSION_STRING.
 */

import { TelegramClient } from "telegram";
import { StringSession }  from "telegram/sessions/index.js";
import input              from "input";

const apiId   = parseInt(await input.text("TG_API_ID  : "), 10);
const apiHash = (await input.text("TG_API_HASH: ")).trim();

const session = new StringSession("");
const client  = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3 });

await client.start({
  phoneNumber:   async () => input.text("Phone number (with country code): "),
  password:      async () => input.password("2FA password (if set): "),
  phoneCode:     async () => input.text("Telegram login code: "),
  onError:       (err) => console.error(err),
});

console.log("\n✅ Session string (copy into TG_SESSION_STRING):\n");
console.log(client.session.save());
console.log();

await client.disconnect();
process.exit(0);

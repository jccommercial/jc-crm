const API = 'https://api.telegram.org/bot';

/**
 * Post to the JC Sales chat. Returns { ok } rather than throwing — a Telegram
 * outage must never take down the cron tick or roll back a database write.
 */
export async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chat) {
    console.error('telegram: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing');
    return { ok: false, error: 'not configured' };
  }

  try {
    const res = await fetch(`${API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        text,
      }),
    });
    const json = await res.json();
    if (!json.ok) console.error('telegram:', json.description);
    return json;
  } catch (err) {
    console.error('telegram: request failed', err);
    return { ok: false, error: String(err) };
  }
}

/** Telegram's HTML mode accepts a small tag set; everything else must be escaped. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Mention someone by name. A tg://user link pings their phone; without a
 * captured telegram_user_id it degrades to plain text rather than failing.
 */
export function mention(user) {
  if (!user) return 'Unassigned';
  const name = esc(user.display_name);
  return user.telegram_user_id
    ? `<a href="tg://user?id=${user.telegram_user_id}">${name}</a>`
    : name;
}

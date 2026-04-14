/**
 * POST /api/notify
 * Вызывается Supabase Database Webhook при INSERT в таблицу orders.
 * Отправляет Telegram-уведомление если total > 50 000 ₸.
 */

import https from "https";

const THRESHOLD = 50000;

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  try {
    // Supabase передаёт { type: "INSERT", table: "orders", record: {...} }
    const { record } = req.body || {};

    if (!record) {
      return res.status(400).json({ error: "No record in payload" });
    }

    const total = parseFloat(record.total || 0);

    if (total <= THRESHOLD) {
      return res.status(200).json({ skipped: true, total });
    }

    const name = record.customer_name || "Клиент";
    const phone = record.phone || "—";
    const city = record.city || "не указан";
    const orderId = record.retailcrm_id || "—";
    const utmSource = record.utm_source || "—";

    const message =
      `🔔 *Новый крупный заказ!*\n\n` +
      `💰 Сумма: *${total.toLocaleString("ru-RU")} ₸*\n` +
      `👤 Клиент: ${name}\n` +
      `📞 Телефон: ${phone}\n` +
      `📍 Город: ${city}\n` +
      `📣 Источник: ${utmSource}\n` +
      `🆔 Заказ #${orderId}`;

    const result = await httpsPost(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      { chat_id: CHAT_ID, text: message, parse_mode: "Markdown" }
    );

    if (!result.ok) {
      return res.status(500).json({ error: "Telegram error", detail: result.description });
    }

    return res.status(200).json({ sent: true, total, orderId });
  } catch (err) {
    console.error("Notify error:", err);
    return res.status(500).json({ error: err.message });
  }
}

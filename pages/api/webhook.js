/**
 * POST /api/webhook
 * RetailCRM webhook handler:
 *   1. Upsert заказа в Supabase (дашборд обновляется сразу)
 *   2. Telegram-уведомление если сумма > 50 000 ₸
 *
 * Настройка в RetailCRM:
 *   Настройки → Интеграции → Webhooks → Добавить
 *   URL: https://your-app.vercel.app/api/webhook
 *   Метод: POST
 *   Событие: order_create, order_update
 */

import { createClient } from "@supabase/supabase-js";

const THRESHOLD = 50000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // RetailCRM отправляет application/x-www-form-urlencoded
    // req.body уже разобран Next.js: { clientId: "...", order: "{...}" }
    const body = req.body;
    let order;

    if (typeof body === "string") {
      const params = new URLSearchParams(body);
      order = JSON.parse(params.get("order") || "{}");
    } else if (body?.order) {
      order = typeof body.order === "string" ? JSON.parse(body.order) : body.order;
    } else {
      order = body;
    }

    if (!order?.id) {
      return res.status(400).json({ error: "No order in payload" });
    }

    // --- Подготовка данных ---
    const customer  = order.customer || {};
    const phones    = customer.phones || [];
    const phone     = phones[0]?.number || order.phone || "";
    const address   = order.delivery?.address || {};
    const custom    = order.customFields || {};
    const firstName = order.firstName || customer.firstName || "";
    const lastName  = order.lastName  || customer.lastName  || "";
    const total     = parseFloat(order.summ || order.totalSumm || 0);

    // 1. Upsert в Supabase — дашборд сразу увидит новый заказ
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (SUPABASE_URL && SUPABASE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { error: dbError } = await supabase.from("orders").upsert(
        {
          retailcrm_id:         parseInt(order.id),
          customer_name:        `${firstName} ${lastName}`.trim() || "Неизвестно",
          phone,
          email:                order.email || customer.email || "",
          status:               order.status || "",
          total,
          city:                 address.city || "",
          utm_source:           custom.utm_source || "",
          items:                order.items || [],
          retailcrm_created_at: order.createdAt || null,
          synced_at:            new Date().toISOString(),
        },
        { onConflict: "retailcrm_id" }
      );
      if (dbError) console.error("Supabase upsert error:", dbError);
    } else {
      console.warn("Supabase env vars not set — skipping DB sync");
    }

    // 2. Telegram: уведомляем только если сумма > 50 000 ₸
    if (total <= THRESHOLD) {
      return res.status(200).json({ synced: true, skipped: true, total });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("Telegram env vars not set");
      return res.status(200).json({ synced: true, telegram: "not configured" });
    }

    const name    = `${firstName} ${lastName}`.trim() || "Клиент";
    const orderId = order.id || order.number || "—";
    const city    = address.city || "не указан";
    const tgPhone = phones[0]?.number || order.phone || "—";

    const items = (order.items || [])
      .map((i) =>
        `  • ${i.productName} × ${i.quantity || 1} = ${(
          (i.initialPrice || 0) * (i.quantity || 1)
        ).toLocaleString("ru-RU")} ₸`
      )
      .join("\n");

    const message = [
      `🔔 *Новый крупный заказ!*`,
      ``,
      `💰 Сумма: *${total.toLocaleString("ru-RU")} ₸*`,
      `👤 Клиент: ${name}`,
      `📞 Телефон: ${tgPhone}`,
      `📍 Город: ${city}`,
      `🆔 Заказ #${orderId} (статус: ${order.status || "new"})`,
      items ? `\n📦 Товары:\n${items}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const tgRes  = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: "Markdown" }),
    });
    const tgData = await tgRes.json();

    if (!tgData.ok) {
      console.error("Telegram API error:", tgData);
      return res.status(500).json({ error: "Telegram send failed", tgData });
    }

    return res.status(200).json({ synced: true, sent: true, total, orderId });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message });
  }
}

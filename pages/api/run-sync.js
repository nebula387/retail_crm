/**
 * GET /api/cron
 * 1. Забирает заказы из RetailCRM
 * 2. Синхронизирует их в Supabase
 * 3. Отправляет Telegram-уведомление для новых заказов > 50 000 ₸
 *
 * Запускается автоматически раз в час (vercel.json crons).
 * Также можно вызвать вручную: https://твой-домен.vercel.app/api/cron
 */

import { createClient } from "@supabase/supabase-js";

const THRESHOLD = 50000;

export default async function handler(req, res) {
  const RETAILCRM_URL  = (process.env.RETAILCRM_URL  || "").replace(/\/$/, "");
  const RETAILCRM_KEY  = process.env.RETAILCRM_API_KEY;
  const BOT_TOKEN      = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID        = process.env.TELEGRAM_CHAT_ID;
  const SUPABASE_URL   = process.env.SUPABASE_URL;
  const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!RETAILCRM_URL || !RETAILCRM_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Missing environment variables" });
  }

  try {
    // 1. Получаем заказы из RetailCRM
    const crmRes  = await fetch(
      `${RETAILCRM_URL}/api/v5/orders?apiKey=${RETAILCRM_KEY}&limit=50&page=1`
    );
    const crmData = await crmRes.json();

    if (!crmData.success) {
      return res.status(502).json({ error: crmData.errorMsg });
    }

    const orders   = crmData.orders || [];
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 2. Синхронизируем все заказы в Supabase
    const rows = orders.map((order) => {
      const customer  = order.customer || {};
      const phones    = customer.phones || [];
      const phone     = phones[0]?.number || "";
      const address   = order.delivery?.address || {};
      const custom    = order.customFields || {};
      const firstName = order.firstName || customer.firstName || "";
      const lastName  = order.lastName  || customer.lastName  || "";
      return {
        retailcrm_id:         parseInt(order.id),
        customer_name:        `${firstName} ${lastName}`.trim() || "Неизвестно",
        phone,
        email:                order.email || customer.email || "",
        status:               order.status || "",
        total:                parseFloat(order.summ || 0),
        city:                 address.city || "",
        utm_source:           custom.utm_source || "",
        items:                order.items || [],
        retailcrm_created_at: order.createdAt || null,
        synced_at:            new Date().toISOString(),
      };
    });

    if (rows.length > 0) {
      await supabase.from("orders").upsert(rows, { onConflict: "retailcrm_id" });
    }

    // 3. Telegram: только новые крупные заказы (не повторяем уже отправленные)
    const bigOrders = orders.filter((o) => parseFloat(o.summ || 0) > THRESHOLD);
    let notified    = 0;

    if (bigOrders.length > 0 && BOT_TOKEN && CHAT_ID) {
      const ids = bigOrders.map((o) => String(o.id));
      const { data: alreadySent } = await supabase
        .from("notified_orders")
        .select("retailcrm_id")
        .in("retailcrm_id", ids);

      const sentIds  = new Set((alreadySent || []).map((r) => String(r.retailcrm_id)));
      const toNotify = bigOrders.filter((o) => !sentIds.has(String(o.id)));

      for (const order of toNotify) {
        const total     = parseFloat(order.summ || 0);
        const customer  = order.customer || {};
        const phones    = customer.phones || [];
        const firstName = order.firstName || customer.firstName || "";
        const lastName  = order.lastName  || customer.lastName  || "";
        const name      = `${firstName} ${lastName}`.trim() || "Клиент";
        const phone     = phones[0]?.number || "—";
        const city      = order.delivery?.address?.city || "не указан";

        const items = (order.items || [])
          .map((i) =>
            `• ${i.productName} × ${i.quantity || 1} = ${(
              (i.initialPrice || 0) * (i.quantity || 1)
            ).toLocaleString("ru-RU")} ₸`
          )
          .join("\n");

        const message =
          `🔔 *Новый крупный заказ!*\n\n` +
          `💰 Сумма: *${total.toLocaleString("ru-RU")} ₸*\n` +
          `👤 Клиент: ${name}\n` +
          `📞 Телефон: ${phone}\n` +
          `📍 Город: ${city}\n` +
          `🆔 Заказ #${order.id}` +
          (items ? `\n\n📦 Товары:\n${items}` : "");

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: "Markdown" }),
        });

        const { error: insertError } = await supabase.from("notified_orders").insert({
          retailcrm_id: String(order.id),
          total,
          notified_at:  new Date().toISOString(),
        });

        if (insertError) {
          console.error("notified_orders insert error:", insertError.message);
        } else {
          notified++;
        }
      }
    }

    return res.status(200).json({
      synced:    rows.length,
      bigOrders: bigOrders.length,
      notified,
    });
  } catch (err) {
    console.error("Cron error:", err);
    return res.status(500).json({ error: err.message });
  }
}

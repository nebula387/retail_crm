/**
 * POST /api/webhook
 * RetailCRM webhook handler — отправляет Telegram-уведомление
 * когда появляется заказ на сумму > 50 000 ₸.
 *
 * Настройка в RetailCRM:
 *   Настройки → Интеграции → Webhooks → Добавить
 *   URL: https://your-app.vercel.app/api/webhook
 *   Метод: POST
 *   Событие: order_create, order_update
 */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("Telegram env vars not set");
    return res.status(500).json({ error: "Telegram not configured" });
  }

  try {
    // RetailCRM отправляет данные как application/x-www-form-urlencoded
    // Тело содержит поле "order" с JSON-строкой
    let order;
    const body = req.body;

    if (typeof body === "string") {
      const params = new URLSearchParams(body);
      order = JSON.parse(params.get("order") || "{}");
    } else if (body?.order) {
      order =
        typeof body.order === "string" ? JSON.parse(body.order) : body.order;
    } else {
      order = body;
    }

    const total = parseFloat(order?.summ || order?.totalSumm || 0);
    const threshold = 50000;

    if (total <= threshold) {
      return res.status(200).json({ skipped: true, total });
    }

    // Формируем сообщение
    const firstName = order?.firstName || "";
    const lastName = order?.lastName || "";
    const name = `${firstName} ${lastName}`.trim() || "Клиент";
    const orderId = order?.id || order?.number || "—";
    const status = order?.status || "new";
    const city =
      order?.delivery?.address?.city || "";

    const phones = order?.customer?.phones || [];
    const phone =
      phones[0]?.number || order?.phone || "—";

    const items = (order?.items || [])
      .map(
        (item) =>
          `  • ${item.productName} × ${item.quantity || 1} = ${(
            (item.initialPrice || 0) * (item.quantity || 1)
          ).toLocaleString("ru-RU")} ₸`
      )
      .join("\n");

    const message = [
      `🔔 *Новый крупный заказ!*`,
      ``,
      `💰 Сумма: *${total.toLocaleString("ru-RU")} ₸*`,
      `👤 Клиент: ${name}`,
      `📞 Телефон: ${phone}`,
      `📍 Город: ${city || "не указан"}`,
      `🆔 Заказ #${orderId} (статус: ${status})`,
      ``,
      items ? `📦 Товары:\n${items}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const tgRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: message,
          parse_mode: "Markdown",
        }),
      }
    );

    const tgData = await tgRes.json();

    if (!tgData.ok) {
      console.error("Telegram API error:", tgData);
      return res.status(500).json({ error: "Telegram send failed", tgData });
    }

    return res.status(200).json({ sent: true, total, orderId });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = {
  api: {
    bodyParser: {
      type: ["application/json", "application/x-www-form-urlencoded"],
    },
  },
};

import { createClient } from "@supabase/supabase-js";
import https from "https";

const THRESHOLD = 50000;

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Bad JSON: " + data.slice(0, 100))); }
      });
    }).on("error", reject);
  });
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({}); } });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export default async function handler(req, res) {
  const RETAILCRM_URL = process.env.RETAILCRM_URL;
  const RETAILCRM_KEY = process.env.RETAILCRM_API_KEY;
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const crmData = await httpsGet(
      `${RETAILCRM_URL}/api/v5/orders?apiKey=${RETAILCRM_KEY}&limit=50&page=1`
    );
    if (!crmData.success) {
      return res.status(502).json({ error: crmData.errorMsg });
    }

    const orders = crmData.orders || [];
    const bigOrders = orders.filter((o) => parseFloat(o.summ || 0) > THRESHOLD);

    if (bigOrders.length === 0) {
      return res.status(200).json({ checked: orders.length, notified: 0 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const ids = bigOrders.map((o) => String(o.id));
    const { data: alreadySent } = await supabase
      .from("notified_orders")
      .select("retailcrm_id")
      .in("retailcrm_id", ids);

    const sentIds = new Set((alreadySent || []).map((r) => String(r.retailcrm_id)));
    const toNotify = bigOrders.filter((o) => !sentIds.has(String(o.id)));

    let notified = 0;
    for (const order of toNotify) {
      const total = parseFloat(order.summ || 0);
      const firstName = order.firstName || order.customer?.firstName || "";
      const lastName = order.lastName || order.customer?.lastName || "";
      const name = `${firstName} ${lastName}`.trim() || "Клиент";
      const phones = order.customer?.phones || [];
      const phone = phones[0]?.number || "—";
      const city = order.delivery?.address?.city || "не указан";
      const items = (order.items || [])
        .map((i) => `• ${i.productName} × ${i.quantity || 1} = ${((i.initialPrice || 0) * (i.quantity || 1)).toLocaleString("ru-RU")} ₸`)
        .join("\n");

      const message =
        `🔔 *Новый крупный заказ!*\n\n` +
        `💰 Сумма: *${total.toLocaleString("ru-RU")} ₸*\n` +
        `👤 Клиент: ${name}\n` +
        `📞 Телефон: ${phone}\n` +
        `📍 Город: ${city}\n` +
        `🆔 Заказ #${order.id}` +
        (items ? `\n\n📦 Товары:\n${items}` : "");

      await httpsPost(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      });

      await supabase.from("notified_orders").insert({
        retailcrm_id: String(order.id),
        total,
        notified_at: new Date().toISOString(),
      });

      notified++;
    }

    return res.status(200).json({ checked: orders.length, bigOrders: bigOrders.length, notified });
  } catch (err) {
    console.error("Cron error:", err);
    return res.status(500).json({ error: err.message });
  }
}

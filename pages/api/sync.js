/**
 * POST /api/sync
 * Запускает синхронизацию RetailCRM → Supabase прямо из браузера.
 * Защищён секретным ключом через заголовок Authorization.
 *
 * Вызов: curl -X POST https://your-app.vercel.app/api/sync \
 *   -H "Authorization: Bearer YOUR_SYNC_SECRET"
 */

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const secret = process.env.SYNC_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const RETAILCRM_URL = (process.env.RETAILCRM_URL || "").replace(/\/$/, "");
  const RETAILCRM_KEY = process.env.RETAILCRM_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!RETAILCRM_URL || !RETAILCRM_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: "Missing environment variables" });
  }

  try {
    // Загружаем заказы из RetailCRM (первые 100 для демо)
    const crmRes = await fetch(
      `${RETAILCRM_URL}/api/v5/orders?apiKey=${RETAILCRM_KEY}&limit=100&page=1`,
      { headers: { Accept: "application/json" } }
    );
    const crmData = await crmRes.json();

    if (!crmData.success) {
      return res.status(502).json({ error: crmData.errorMsg });
    }

    const orders = crmData.orders || [];
    if (orders.length === 0) {
      return res.status(200).json({ synced: 0, message: "No orders found" });
    }

    // Конвертируем в строки Supabase
    const rows = orders.map((order) => {
      const customer = order.customer || {};
      const phones = customer.phones || [];
      const phone = phones[0]?.number || "";
      const delivery = order.delivery || {};
      const address = delivery.address || {};
      const custom = order.customFields || {};

      const firstName = order.firstName || customer.firstName || "";
      const lastName = order.lastName || customer.lastName || "";

      return {
        retailcrm_id: parseInt(order.id),
        customer_name: `${firstName} ${lastName}`.trim() || "Неизвестно",
        phone,
        email: order.email || customer.email || "",
        status: order.status || "",
        total: parseFloat(order.summ || 0),
        city: address.city || "",
        utm_source: custom.utm_source || "",
        items: order.items || [],
        retailcrm_created_at: order.createdAt || null,
        synced_at: new Date().toISOString(),
      };
    });

    // Upsert в Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error } = await supabase
      .from("orders")
      .upsert(rows, { onConflict: "retailcrm_id" });

    if (error) throw error;

    return res.status(200).json({
      synced: rows.length,
      message: `Синхронизировано ${rows.length} заказов`,
    });
  } catch (err) {
    console.error("Sync error:", err);
    return res.status(500).json({ error: err.message });
  }
}

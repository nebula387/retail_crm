/**
 * GET /api/orders
 * Возвращает агрегированные данные из Supabase для дашборда.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { data: orders, error } = await supabase
      .from("orders")
      .select(
        "id, retailcrm_id, customer_name, status, total, city, utm_source, retailcrm_created_at"
      )
      .order("retailcrm_created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    // --- Агрегация ---

    // 1. Сводные метрики
    const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const avgOrder = orders.length ? totalRevenue / orders.length : 0;
    const bigOrders = orders.filter((o) => o.total > 50000).length;

    // 2. Заказы по статусам
    const byStatus = {};
    orders.forEach((o) => {
      const s = o.status || "unknown";
      byStatus[s] = (byStatus[s] || 0) + 1;
    });

    // 3. Выручка по городам (топ-7)
    const byCity = {};
    orders.forEach((o) => {
      const c = o.city || "Не указан";
      byCity[c] = (byCity[c] || 0) + (o.total || 0);
    });
    const topCities = Object.entries(byCity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7);

    // 4. Источники трафика
    const byUtm = {};
    orders.forEach((o) => {
      const u = o.utm_source || "direct";
      byUtm[u] = (byUtm[u] || 0) + 1;
    });

    // 5. Заказы по дням (последние 30 дней)
    const byDay = {};
    orders.forEach((o) => {
      if (!o.retailcrm_created_at) return;
      const day = o.retailcrm_created_at.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    });
    const sortedDays = Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30);

    // 6. Последние 10 крупных заказов
    const bigOrdersList = orders
      .filter((o) => o.total > 50000)
      .slice(0, 10);

    return res.status(200).json({
      summary: {
        totalOrders: orders.length,
        totalRevenue: Math.round(totalRevenue),
        avgOrder: Math.round(avgOrder),
        bigOrders,
      },
      byStatus,
      topCities,
      byUtm,
      byDay: sortedDays,
      bigOrdersList,
    });
  } catch (err) {
    console.error("Supabase error:", err);
    return res.status(500).json({ error: err.message });
  }
}

import { useEffect, useState, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Pie } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const COLORS = [
  "#6366f1",
  "#22d3ee",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#f97316",
];

const STATUS_LABELS = {
  new: "Новый",
  "in-progress": "В работе",
  "complete": "Выполнен",
  cancel: "Отменён",
  delivery: "Доставка",
};

function MetricCard({ label, value, sub }) {
  return (
    <div className="card metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  async function loadData() {
    try {
      setLoading(true);
      const res = await fetch("/api/orders");
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const secret = prompt("Введите SYNC_SECRET:");
      if (!secret) return;
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      const d = await res.json();
      alert(d.message || d.error);
      await loadData();
    } catch (e) {
      alert("Ошибка синхронизации: " + e.message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (!mounted) return null;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0f172a; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .header { background: #1e293b; border-bottom: 1px solid #334155; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
        .header h1 { font-size: 20px; font-weight: 700; color: #f1f5f9; }
        .header span { font-size: 13px; color: #94a3b8; }
        .sync-btn { background: #6366f1; color: white; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; transition: background 0.2s; }
        .sync-btn:hover { background: #4f46e5; }
        .sync-btn:disabled { background: #475569; cursor: not-allowed; }
        .container { max-width: 1280px; margin: 0 auto; padding: 24px 16px; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
        .metric { text-align: center; }
        .metric-value { font-size: 32px; font-weight: 800; color: #6366f1; }
        .metric-label { font-size: 13px; color: #94a3b8; margin-top: 4px; }
        .metric-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
        .charts { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 24px; }
        .charts-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .card h2 { font-size: 14px; font-weight: 600; color: #94a3b8; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em; }
        .chart-wrap { position: relative; min-height: 240px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; color: #64748b; font-weight: 500; padding: 8px 12px; border-bottom: 1px solid #334155; }
        td { padding: 10px 12px; border-bottom: 1px solid #1e293b; }
        tr:hover td { background: #263148; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #334155; }
        .badge.new { background: #1d4ed8; color: #bfdbfe; }
        .badge.complete { background: #065f46; color: #a7f3d0; }
        .badge.cancel { background: #7f1d1d; color: #fecaca; }
        .big-amount { color: #f59e0b; font-weight: 700; }
        .loading { text-align: center; padding: 80px; color: #64748b; }
        .error { text-align: center; padding: 40px; color: #ef4444; background: #1e293b; border-radius: 12px; }
        @media (max-width: 768px) {
          .charts, .charts-row2 { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="header">
        <div>
          <h1>GBC Analytics Dashboard</h1>
          <span>RetailCRM → Supabase → Vercel</span>
        </div>
        <button className="sync-btn" onClick={handleSync} disabled={syncing}>
          {syncing ? "Синхронизация..." : "⟳ Синхронизировать"}
        </button>
      </div>

      <div className="container">
        {loading && <div className="loading">Загрузка данных...</div>}
        {error && (
          <div className="error">
            <b>Ошибка:</b> {error}
            <br />
            <small>Проверь переменные окружения SUPABASE_URL и SUPABASE_ANON_KEY</small>
          </div>
        )}

        {data && (
          <>
            {/* Метрики */}
            <div className="metrics">
              <MetricCard
                label="Всего заказов"
                value={data.summary.totalOrders.toLocaleString("ru-RU")}
              />
              <MetricCard
                label="Общая выручка"
                value={`${(data.summary.totalRevenue / 1000).toFixed(0)}K ₸`}
                sub={`${data.summary.totalRevenue.toLocaleString("ru-RU")} ₸`}
              />
              <MetricCard
                label="Средний чек"
                value={`${data.summary.avgOrder.toLocaleString("ru-RU")} ₸`}
              />
              <MetricCard
                label="Крупных заказов"
                value={data.summary.bigOrders}
                sub="более 50 000 ₸"
              />
            </div>

            {/* Графики 1 ряд */}
            <div className="charts">
              <div className="card">
                <h2>Заказы по дням</h2>
                <div className="chart-wrap">
                  <Bar
                    data={{
                      labels: data.byDay.map(([d]) =>
                        new Date(d).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "short",
                        })
                      ),
                      datasets: [
                        {
                          label: "Заказов",
                          data: data.byDay.map(([, v]) => v),
                          backgroundColor: "#6366f1",
                          borderRadius: 4,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { ticks: { color: "#94a3b8", font: { size: 11 } }, grid: { color: "#1e293b" } },
                        y: { ticks: { color: "#94a3b8" }, grid: { color: "#334155" } },
                      },
                    }}
                  />
                </div>
              </div>

              <div className="card">
                <h2>Статусы заказов</h2>
                <div className="chart-wrap">
                  <Pie
                    data={{
                      labels: Object.keys(data.byStatus).map(
                        (s) => STATUS_LABELS[s] || s
                      ),
                      datasets: [
                        {
                          data: Object.values(data.byStatus),
                          backgroundColor: COLORS,
                          borderWidth: 2,
                          borderColor: "#0f172a",
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          labels: { color: "#94a3b8", font: { size: 12 } },
                          position: "bottom",
                        },
                      },
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Графики 2 ряд */}
            <div className="charts-row2">
              <div className="card">
                <h2>Выручка по городам</h2>
                <div className="chart-wrap">
                  <Bar
                    data={{
                      labels: data.topCities.map(([c]) => c),
                      datasets: [
                        {
                          label: "Выручка (₸)",
                          data: data.topCities.map(([, v]) => v),
                          backgroundColor: COLORS,
                          borderRadius: 4,
                        },
                      ],
                    }}
                    options={{
                      indexAxis: "y",
                      responsive: true,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { ticks: { color: "#94a3b8" }, grid: { color: "#334155" } },
                        y: { ticks: { color: "#94a3b8" } },
                      },
                    }}
                  />
                </div>
              </div>

              <div className="card">
                <h2>Источники трафика (UTM)</h2>
                <div className="chart-wrap">
                  <Pie
                    data={{
                      labels: Object.keys(data.byUtm),
                      datasets: [
                        {
                          data: Object.values(data.byUtm),
                          backgroundColor: COLORS,
                          borderWidth: 2,
                          borderColor: "#0f172a",
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          labels: { color: "#94a3b8", font: { size: 12 } },
                          position: "bottom",
                        },
                      },
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Таблица крупных заказов */}
            {data.bigOrdersList.length > 0 && (
              <div className="card">
                <h2>Крупные заказы (&gt;50 000 ₸)</h2>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Клиент</th>
                      <th>Город</th>
                      <th>Источник</th>
                      <th>Статус</th>
                      <th>Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bigOrdersList.map((o) => (
                      <tr key={o.retailcrm_id}>
                        <td style={{ color: "#64748b" }}>{o.retailcrm_id}</td>
                        <td>{o.customer_name}</td>
                        <td>{o.city || "—"}</td>
                        <td>{o.utm_source || "—"}</td>
                        <td>
                          <span className={`badge ${o.status}`}>
                            {STATUS_LABELS[o.status] || o.status}
                          </span>
                        </td>
                        <td className="big-amount">
                          {o.total?.toLocaleString("ru-RU")} ₸
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

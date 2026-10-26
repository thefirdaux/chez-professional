/*
 * GET /api/admin/stats?days=7|30|90   visitors, sources, sales and top products for the admin.
 * Days are Malaysian calendar days. Test payments are left out of the sales figures.
 */
import { ensureSchema, isConfigured } from '../../_lib/orders.js';
import { requireAdmin } from '../../_lib/access.js';
import { json } from '../../_lib/http.js';
import { malaysiaDay } from '../../_lib/visits.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function onRequestGet({ request, env }) {
  if (!isConfigured(env)) return json({ error: 'Orders are not set up yet.' }, 503);
  const admin = await requireAdmin(request, env);
  if (admin.error) return json({ error: admin.error }, admin.status);
  await ensureSchema(env.DB);

  const requested = Number(new URL(request.url).searchParams.get('days'));
  const days = [7, 30, 90].includes(requested) ? requested : 30;
  const now = Date.now();
  const dayList = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(malaysiaDay(now - i * DAY_MS));
  const since = dayList[0];
  // Midnight in Malaysia (UTC+8) at the start of the first day, as an ISO time in UTC
  const sinceIso = new Date(Date.parse(since + 'T00:00:00Z') - 8 * 60 * 60 * 1000).toISOString();

  const db = env.DB;
  const [daily, totals, sources, devices, pages, checkout, paid] = await Promise.all([
    db.prepare('SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM page_views WHERE day >= ? GROUP BY day').bind(since).all(),
    db.prepare('SELECT COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM page_views WHERE day >= ?').bind(since).first(),
    db.prepare("SELECT source AS name, COUNT(DISTINCT visitor) AS count FROM page_views WHERE day >= ? AND source != 'Internal' GROUP BY source ORDER BY count DESC").bind(since).all(),
    db.prepare('SELECT device AS name, COUNT(DISTINCT visitor) AS count FROM page_views WHERE day >= ? GROUP BY device ORDER BY count DESC').bind(since).all(),
    db.prepare('SELECT path AS name, COUNT(*) AS count FROM page_views WHERE day >= ? GROUP BY path ORDER BY count DESC').bind(since).all(),
    db.prepare("SELECT COUNT(DISTINCT visitor) AS visitors FROM page_views WHERE day >= ? AND path = 'Checkout'").bind(since).first(),
    db.prepare("SELECT paid_at, total, items FROM orders WHERE status = 'paid' AND (is_test IS NULL OR is_test = 0) AND paid_at >= ?").bind(sinceIso).all()
  ]);

  const byDay = {};
  dayList.forEach((day) => { byDay[day] = { day, visitors: 0, views: 0, orders: 0, sales: 0 }; });
  daily.results.forEach((row) => { if (byDay[row.day]) Object.assign(byDay[row.day], { visitors: row.visitors, views: row.views }); });

  const products = {};
  let orders = 0;
  let sales = 0;
  paid.results.forEach((order) => {
    const day = malaysiaDay(Date.parse(order.paid_at));
    if (byDay[day]) { byDay[day].orders += 1; byDay[day].sales += order.total; }
    orders += 1;
    sales += order.total;
    let items = [];
    try { items = JSON.parse(order.items); } catch (e) { /* skip unreadable */ }
    items.forEach((item) => {
      const key = item.id || item.name;
      const p = products[key] || (products[key] = { name: item.name, size: item.size, qty: 0, sales: 0 });
      p.qty += item.qty;
      p.sales += item.price * item.qty;
    });
  });

  const visitors = (totals && totals.visitors) || 0;
  return json({
    days,
    since,
    daily: dayList.map((day) => byDay[day]),
    totals: {
      visitors,
      views: (totals && totals.views) || 0,
      checkoutVisitors: (checkout && checkout.visitors) || 0,
      orders,
      sales,
      averageOrder: orders ? Math.round(sales / orders) : 0,
      conversion: visitors ? orders / visitors : 0
    },
    sources: sources.results,
    devices: devices.results,
    pages: pages.results,
    products: Object.values(products).sort((a, b) => b.qty - a.qty || b.sales - a.sales).slice(0, 10)
  });
}

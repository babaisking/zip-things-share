import { escapeHtml } from "./telemetry.server";

export type Breakdown = { label: string; count: number };

function tally(rows: Array<Record<string, unknown>>, key: string, fallback = "Unknown"): Breakdown[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const raw = row[key];
    const label = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : fallback;
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return Array.from(map, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

function refererLabel(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") return "Direct";
  try {
    return new URL(value).hostname;
  } catch {
    return value.slice(0, 60);
  }
}

export async function buildStats() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [visitsAll, downloadsAll, zipsAll, recentVisits, recentDownloads, weekVisits, dlRows] =
    await Promise.all([
      supabaseAdmin.from("visits").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("downloads").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("zips").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("visits")
        .select("id, ip, path, country, city, region, org, device, browser, os, user_agent, referer, is_refresh, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("downloads")
        .select("id, zip_name, ip, country, city, device, user_agent, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("visits")
        .select("created_at, country, city, device, referer, is_refresh")
        .gte("created_at", new Date(Date.now() - 30 * 86400 * 1000).toISOString()),
      supabaseAdmin.from("downloads").select("zip_name"),
    ]);

  const week = (weekVisits.data ?? []) as Array<Record<string, unknown>>;
  const real = week.filter((r) => r["is_refresh"] !== true);

  const byDay = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400 * 1000).toISOString().slice(0, 10);
    byDay.set(d, 0);
  }
  for (const row of week) {
    const d = new Date(row["created_at"] as string).toISOString().slice(0, 10);
    if (byDay.has(d)) byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }

  const origins = tally(
    real.map((r) => ({ origin: refererLabel(r["referer"]) })),
    "origin",
    "Direct",
  );

  return {
    totals: {
      visits: visitsAll.count ?? 0,
      downloads: downloadsAll.count ?? 0,
      zips: zipsAll.count ?? 0,
      refreshes: week.length - real.length,
    },
    recentVisits: recentVisits.data ?? [],
    recentDownloads: recentDownloads.data ?? [],
    dailyVisits: Array.from(byDay, ([day, count]) => ({ day, count })),
    byCountry: tally(real, "country"),
    byCity: tally(real, "city"),
    byDevice: tally(real, "device"),
    byOrigin: origins,
    byZip: tally((dlRows.data ?? []) as Array<Record<string, unknown>>, "zip_name"),
  };
}

function list(items: Breakdown[], limit = 5) {
  if (items.length === 0) return "  <i>no data yet</i>";
  return items
    .slice(0, limit)
    .map((i, idx) => `  ${idx + 1}. ${escapeHtml(i.label)} — <b>${i.count}</b>`)
    .join("\n");
}

export async function statsMessage() {
  const s = await buildStats();
  const today = s.dailyVisits[s.dailyVisits.length - 1]?.count ?? 0;
  return (
    `<b>📊 THING.zip stats</b>\n` +
    `<code>────────────────────</code>\n` +
    `👣 <b>Visits:</b> ${s.totals.visits}  (today ${today})\n` +
    `⬇️ <b>Downloads:</b> ${s.totals.downloads}\n` +
    `📦 <b>Archives:</b> ${s.totals.zips}\n` +
    `🔄 <b>Refreshes (30d):</b> ${s.totals.refreshes}\n\n` +
    `<b>🌍 Top countries</b>\n${list(s.byCountry)}\n\n` +
    `<b>🏙 Top cities</b>\n${list(s.byCity)}\n\n` +
    `<b>🖥 Devices</b>\n${list(s.byDevice)}\n\n` +
    `<b>↩️ Top origins</b>\n${list(s.byOrigin)}\n\n` +
    `<b>📦 Most downloaded</b>\n${list(s.byZip)}\n` +
    `<code>────────────────────</code>\n<i>${new Date().toUTCString()}</i>`
  );
}

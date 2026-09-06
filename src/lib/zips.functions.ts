import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requestMeta,
  sendTelegram,
  sendVisitPing,
  telegramEnabled,
  escapeHtml,
  lookupGeo,
} from "./telemetry.server";

export const listZips = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("zips")
    .select("id, name, description, size_bytes, download_count, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const recordVisit = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        path: z.string().max(500).default("/"),
        isRefresh: z.boolean().default(false),
        screen: z.string().max(40).optional(),
        timezone: z.string().max(80).optional(),
        touch: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const meta = requestMeta();
    const geo = await lookupGeo(meta.ip);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("visits").insert({
      ip: meta.ip,
      user_agent: meta.user_agent,
      referer: meta.referer,
      country: geo.country ?? meta.country,
      city: geo.city,
      region: geo.region,
      org: geo.org,
      device: meta.device,
      browser: meta.browser,
      os: meta.os,
      language: meta.language,
      path: data.path,
      is_refresh: data.isRefresh,
      screen: data.screen ?? null,
      timezone: data.timezone ?? null,
    });

    // Page refreshes are logged but never notified and never counted as a revisit.
    if (data.isRefresh) return { ok: true };

    if (await telegramEnabled()) {
      const place = [geo.city, geo.region, geo.country].filter(Boolean).join(", ") || "Unknown";
      const flagIcon = meta.device === "Desktop" ? "🖥" : meta.device === "Tablet" ? "📲" : "📱";
      const text =
        `<b>🔥 New visit — THING.zip</b>\n` +
        `<code>────────────────────</code>\n` +
        `📄 <b>Page:</b> <code>${escapeHtml(data.path)}</code>\n` +
        `${flagIcon} <b>Device:</b> ${escapeHtml(meta.device)} · ${escapeHtml(meta.os)} · ${escapeHtml(meta.browser)}\n` +
        `🌍 <b>Location:</b> ${escapeHtml(place)}${geo.country_code ? ` (${escapeHtml(geo.country_code)})` : ""}\n` +
        `🛰 <b>IP:</b> <code>${escapeHtml(meta.ip)}</code>\n` +
        `🏢 <b>Network:</b> ${escapeHtml(geo.org ?? "?")}\n` +
        `🕒 <b>Timezone:</b> ${escapeHtml(data.timezone ?? "?")}\n` +
        `🖥 <b>Screen:</b> ${escapeHtml(data.screen ?? "?")}\n` +
        `🗣 <b>Language:</b> ${escapeHtml((meta.language ?? "?").split(",")[0] ?? "?")}\n` +
        `↩️ <b>Came from:</b> ${escapeHtml(meta.referer ?? "direct")}\n` +
        `🧾 <b>UA:</b> <code>${escapeHtml(meta.user_agent.slice(0, 180))}</code>\n` +
        `<code>────────────────────</code>\n` +
        `<i>${new Date().toUTCString()}</i>`;
      await sendVisitPing(meta.ip, data.path, text).catch(() => undefined);
    }
    return { ok: true };
  });

export const requestDownload = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: zip, error } = await supabaseAdmin
      .from("zips")
      .select("id, name, storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !zip) throw new Error("Zip not found");

    const fileName = zip.name.toLowerCase().endsWith(".zip") ? zip.name : `${zip.name}.zip`;
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("zips")
      .createSignedUrl(zip.storage_path, 60 * 5, { download: fileName });
    if (signErr || !signed) throw new Error(signErr?.message ?? "Failed to sign URL");

    const meta = requestMeta();
    const geo = await lookupGeo(meta.ip);
    await supabaseAdmin.from("downloads").insert({
      zip_id: zip.id,
      zip_name: zip.name,
      ip: meta.ip,
      user_agent: meta.user_agent,
      country: geo.country ?? meta.country,
      city: geo.city,
      device: meta.device,
    });
    const { data: current } = await supabaseAdmin
      .from("zips")
      .select("download_count")
      .eq("id", zip.id)
      .maybeSingle();
    if (current) {
      await supabaseAdmin
        .from("zips")
        .update({ download_count: (current.download_count ?? 0) + 1 })
        .eq("id", zip.id);
    }

    if (await telegramEnabled()) {
      const place = [geo.city, geo.region, geo.country].filter(Boolean).join(", ") || "Unknown";
      const text =
        `<b>⬇️ Download — THING.zip</b>\n` +
        `<code>────────────────────</code>\n` +
        `📦 <b>Archive:</b> ${escapeHtml(zip.name)}\n` +
        `🌍 <b>Location:</b> ${escapeHtml(place)}\n` +
        `🛰 <b>IP:</b> <code>${escapeHtml(meta.ip)}</code>\n` +
        `🖥 <b>Device:</b> ${escapeHtml(meta.device)} · ${escapeHtml(meta.os)} · ${escapeHtml(meta.browser)}\n` +
        `🏢 <b>Network:</b> ${escapeHtml(geo.org ?? "?")}\n` +
        `🧾 <b>UA:</b> <code>${escapeHtml(meta.user_agent.slice(0, 180))}</code>\n` +
        `<code>────────────────────</code>\n` +
        `<i>${new Date().toUTCString()}</i>`;
      await sendTelegram(text).catch(() => undefined);
    }

    return { url: signed.signedUrl };
  });

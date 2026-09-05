import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requestMeta, sendTelegram, telegramEnabled, escapeHtml } from "./telemetry.server";

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
    z.object({ path: z.string().max(500).default("/") }).parse(data),
  )
  .handler(async ({ data }) => {
    const meta = requestMeta();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("visits").insert({
      ip: meta.ip,
      user_agent: meta.user_agent,
      referer: meta.referer,
      country: meta.country,
      path: data.path,
    });

    if (await telegramEnabled()) {
      const text =
        `<b>🔍 New visit</b>\n` +
        `<b>Path:</b> ${escapeHtml(data.path)}\n` +
        `<b>IP:</b> ${escapeHtml(meta.ip)}\n` +
        `<b>Country:</b> ${escapeHtml(meta.country ?? "?")}\n` +
        `<b>Lang:</b> ${escapeHtml(meta.language ?? "?")}\n` +
        `<b>Referer:</b> ${escapeHtml(meta.referer ?? "direct")}\n` +
        `<b>UA:</b> ${escapeHtml(meta.user_agent.slice(0, 200))}`;
      await sendTelegram(text).catch(() => undefined);
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
    await supabaseAdmin.from("downloads").insert({
      zip_id: zip.id,
      zip_name: zip.name,
      ip: meta.ip,
      user_agent: meta.user_agent,
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
      const text =
        `<b>⬇️ Download</b>\n` +
        `<b>Zip:</b> ${escapeHtml(zip.name)}\n` +
        `<b>IP:</b> ${escapeHtml(meta.ip)}\n` +
        `<b>Country:</b> ${escapeHtml(meta.country ?? "?")}\n` +
        `<b>UA:</b> ${escapeHtml(meta.user_agent.slice(0, 200))}`;
      await sendTelegram(text).catch(() => undefined);
    }

    return { url: signed.signedUrl };
  });

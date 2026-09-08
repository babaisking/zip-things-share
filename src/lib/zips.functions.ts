import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requestMeta,
  sendTelegram,
  sendVisitPing,
  telegramEnabled,
  escapeHtml,
  lookupGeo,
  describeReferer,
} from "./telemetry.server";
import {
  creditReferrersFor,
  getOrCreateReferral,
  registerReferralClick,
} from "./referrals.server";

/** Automated clients get nothing: no listing, no downloads, no telemetry noise. */
function blockAutomated(meta: ReturnType<typeof requestMeta>) {
  if (meta.isBot || meta.isHeadless) {
    throw new Error("Automated clients are not allowed.");
  }
}

export const listZips = createServerFn({ method: "GET" }).handler(async () => {
  const meta = requestMeta();
  blockAutomated(meta);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("zips")
    .select("id, name, description, size_bytes, download_count, created_at, is_locked, unlock_referrals")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const referral = await getOrCreateReferral(meta.ip);
  const credits = referral?.credits ?? 0;

  return {
    referral: { code: referral?.code ?? null, credits },
    zips: (data ?? []).map((z) => ({
      ...z,
      unlocked: !z.is_locked || credits >= (z.unlock_referrals ?? 1),
    })),
  };
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
        ref: z.string().max(32).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const meta = requestMeta();
    if (meta.isBot || meta.isHeadless) return { ok: false, blocked: true };

    const geo = await lookupGeo(meta.ip);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.ref) await registerReferralClick(data.ref, meta.ip).catch(() => undefined);

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

    // Refreshes are logged but never pinged. Mobile visits are logged but never pinged.
    if (data.isRefresh) return { ok: true, blocked: false };
    if (meta.isMobile) return { ok: true, blocked: false };

    if (await telegramEnabled()) {
      const place = [geo.city, geo.region, geo.country].filter(Boolean).join(", ") || "Unknown";
      const src = describeReferer(meta.referer);
      const text =
        `🖥 <b>Visit</b> · ${escapeHtml(data.path)}\n` +
        `📍 ${escapeHtml(place)}\n` +
        `🌐 <code>${escapeHtml(meta.ip)}</code>\n` +
        `💻 ${escapeHtml(meta.os)} · ${escapeHtml(meta.browser)}\n` +
        `🧬 <code>${escapeHtml(meta.user_agent.slice(0, 200))}</code>\n` +
        `📡 ${escapeHtml(geo.org ?? "unknown network")}\n` +
        `↩️ ${escapeHtml(src.label)} (${src.kind})` +
        (data.ref ? `\n🎟 referred by <code>${escapeHtml(data.ref)}</code>` : "");
      await sendVisitPing(meta.ip, data.path, text).catch(() => undefined);
    }
    return { ok: true, blocked: false };
  });

export const requestDownload = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const meta = requestMeta();
    blockAutomated(meta);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: zip, error } = await supabaseAdmin
      .from("zips")
      .select("id, name, storage_path, is_locked, unlock_referrals")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !zip) throw new Error("Zip not found");

    const referral = await getOrCreateReferral(meta.ip);
    const credits = referral?.credits ?? 0;
    const need = zip.unlock_referrals ?? 1;
    if (zip.is_locked && credits < need) {
      throw new Error(
        `Locked archive. You need ${need} referral download${need === 1 ? "" : "s"} to unlock it (you have ${credits}).`,
      );
    }

    const fileName = zip.name.toLowerCase().endsWith(".zip") ? zip.name : `${zip.name}.zip`;
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("zips")
      .createSignedUrl(zip.storage_path, 60 * 5, { download: fileName });
    if (signErr || !signed) throw new Error(signErr?.message ?? "Failed to sign URL");

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

    await creditReferrersFor(meta.ip).catch(() => undefined);

    if (!meta.isMobile && (await telegramEnabled())) {
      const place = [geo.city, geo.region, geo.country].filter(Boolean).join(", ") || "Unknown";
      const src = describeReferer(meta.referer);
      const text =
        `⬇️ <b>Download</b> · ${escapeHtml(zip.name)}\n` +
        `📍 ${escapeHtml(place)}\n` +
        `🌐 <code>${escapeHtml(meta.ip)}</code>\n` +
        `💻 ${escapeHtml(meta.os)} · ${escapeHtml(meta.browser)}\n` +
        `🧬 <code>${escapeHtml(meta.user_agent.slice(0, 200))}</code>\n` +
        `📡 ${escapeHtml(geo.org ?? "unknown network")}\n` +
        `↩️ ${escapeHtml(src.label)} (${src.kind})`;
      await sendTelegram(text).catch(() => undefined);
    }

    return { url: signed.signedUrl };
  });

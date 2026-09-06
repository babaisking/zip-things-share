import { getRequestHeader } from "@tanstack/react-start/server";

export function clientIp(): string {
  const candidates = [
    getRequestHeader("cf-connecting-ip"),
    getRequestHeader("x-real-ip"),
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim(),
  ];
  return candidates.find((v) => v && v.length > 0) ?? "unknown";
}

export type Ua = { device: string; browser: string; os: string };

export function parseUserAgent(ua: string): Ua {
  const s = ua ?? "";
  const isTablet = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s);
  const isMobile = !isTablet && /Mobi|Android|iPhone|iPod|Windows Phone|IEMobile|BlackBerry/i.test(s);
  const device = isTablet ? "Tablet" : isMobile ? "Mobile" : "Desktop";

  let browser = "Unknown";
  if (/Edg\//i.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(s)) browser = "Opera";
  else if (/SamsungBrowser/i.test(s)) browser = "Samsung Internet";
  else if (/Firefox\//i.test(s)) browser = "Firefox";
  else if (/Chrome\//i.test(s)) browser = "Chrome";
  else if (/Safari\//i.test(s)) browser = "Safari";
  else if (/bot|crawler|spider|curl|wget|python/i.test(s)) browser = "Bot / script";

  let os = "Unknown";
  if (/Windows NT 10/i.test(s)) os = "Windows 10/11";
  else if (/Windows/i.test(s)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(s)) os = "iOS";
  else if (/Mac OS X/i.test(s)) os = "macOS";
  else if (/Android/i.test(s)) os = "Android";
  else if (/CrOS/i.test(s)) os = "ChromeOS";
  else if (/Linux/i.test(s)) os = "Linux";

  return { device, browser, os };
}

export function requestMeta() {
  const ua = getRequestHeader("user-agent") ?? "unknown";
  return {
    ip: clientIp(),
    user_agent: ua,
    referer: getRequestHeader("referer") ?? null,
    country: getRequestHeader("cf-ipcountry") ?? null,
    language: getRequestHeader("accept-language") ?? null,
    ...parseUserAgent(ua),
  };
}

export type Geo = {
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  org: string | null;
};

const EMPTY_GEO: Geo = { country: null, country_code: null, region: null, city: null, org: null };

export async function lookupGeo(ip: string): Promise<Geo> {
  if (!ip || ip === "unknown" || ip.startsWith("127.") || ip.startsWith("192.168.") || ip === "::1") {
    return EMPTY_GEO;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cached } = await supabaseAdmin
    .from("geo_cache")
    .select("country, country_code, region, city, org")
    .eq("ip", ip)
    .maybeSingle();
  if (cached) return cached as Geo;

  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (!res.ok) return EMPTY_GEO;
    const body = (await res.json()) as {
      success?: boolean;
      country?: string;
      country_code?: string;
      region?: string;
      city?: string;
      latitude?: number;
      longitude?: number;
      connection?: { org?: string; isp?: string };
    };
    if (!body.success) return EMPTY_GEO;
    const geo: Geo = {
      country: body.country ?? null,
      country_code: body.country_code ?? null,
      region: body.region ?? null,
      city: body.city ?? null,
      org: body.connection?.org ?? body.connection?.isp ?? null,
    };
    await supabaseAdmin.from("geo_cache").upsert({
      ip,
      ...geo,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
    });
    return geo;
  } catch {
    return EMPTY_GEO;
  }
}

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

async function telegramCall(
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; result?: { message_id?: number }; error?: string }> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const telegramKey = process.env["TELEGRAM_API_KEY"];
  if (!lovableKey || !telegramKey) {
    return { ok: false, error: "Telegram connector is not configured" };
  }
  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Telegram gateway ${method} failed [${res.status}]: ${text}`);
    return { ok: false, error: `Telegram error [${res.status}]: ${text}` };
  }
  try {
    const parsed = JSON.parse(text) as { ok?: boolean; description?: string; result?: { message_id?: number } };
    if (parsed.ok === false) return { ok: false, error: parsed.description ?? "Telegram rejected the message" };
    return { ok: true, result: parsed.result };
  } catch {
    return { ok: true };
  }
}

export async function getChatId(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "telegram_chat_id")
    .maybeSingle();
  const id = (data?.value ?? "").trim();
  return id.length > 0 ? id : null;
}

export async function sendTelegram(
  text: string,
  chatIdOverride?: string,
): Promise<{ ok: boolean; error?: string; messageId?: number }> {
  const chatId = chatIdOverride ?? (await getChatId());
  if (!chatId) return { ok: false, error: "No Telegram chat ID saved yet" };
  const res = await telegramCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  return { ok: res.ok, error: res.error, messageId: res.result?.message_id };
}

/**
 * Sends a message, but if the same ip+path pinged recently it edits the previous
 * message and appends a "Revisit xN" line instead of sending a new notification.
 */
const BURST_WINDOW_MS = 120_000;

export async function sendVisitPing(ip: string, path: string, text: string): Promise<void> {
  const chatId = await getChatId();
  if (!chatId) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing } = await supabaseAdmin
    .from("visit_pings")
    .select("id, telegram_message_id, revisit_count, base_text, last_sent_at")
    .eq("ip", ip)
    .eq("path", path)
    .maybeSingle();

  const fresh =
    existing?.telegram_message_id &&
    Date.now() - new Date(existing.last_sent_at as string).getTime() < BURST_WINDOW_MS;

  if (existing && fresh) {
    const count = (existing.revisit_count ?? 0) + 1;
    const edited = `${existing.base_text}\n\n<b>🔁 Revisit ×${count}</b>  <i>(last ${new Date().toUTCString().slice(17, 25)} UTC)</i>`;
    const res = await telegramCall("editMessageText", {
      chat_id: chatId,
      message_id: existing.telegram_message_id,
      text: edited,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    await supabaseAdmin
      .from("visit_pings")
      .update({
        revisit_count: count,
        last_sent_at: new Date().toISOString(),
        ...(res.ok ? {} : { telegram_message_id: null }),
      })
      .eq("id", existing.id);
    return;
  }

  const sent = await sendTelegram(text, chatId);
  await supabaseAdmin.from("visit_pings").upsert(
    {
      ip,
      path,
      telegram_message_id: sent.messageId ?? null,
      revisit_count: 0,
      base_text: text,
      last_sent_at: new Date().toISOString(),
    },
    { onConflict: "ip,path" },
  );
}

export async function telegramEnabled(): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "telegram_enabled")
    .maybeSingle();
  return data?.value === "true";
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

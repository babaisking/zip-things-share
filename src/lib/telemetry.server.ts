import { getRequestHeader } from "@tanstack/react-start/server";

export function clientIp(): string {
  const candidates = [
    getRequestHeader("cf-connecting-ip"),
    getRequestHeader("x-real-ip"),
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim(),
  ];
  return candidates.find((v) => v && v.length > 0) ?? "unknown";
}

export type Ua = {
  device: string;
  browser: string;
  os: string;
  isMobile: boolean;
  isBot: boolean;
  isHeadless: boolean;
};

export function parseUserAgent(ua: string): Ua {
  const s = ua ?? "";
  const isTablet = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s);
  const isPhone = !isTablet && /Mobi|Android|iPhone|iPod|Windows Phone|IEMobile|BlackBerry/i.test(s);
  const device = isTablet ? "Tablet" : isPhone ? "Mobile" : "Desktop";

  const isHeadless = /HeadlessChrome|Headless|PhantomJS|Puppeteer|Playwright|Electron/i.test(s);
  const isBot = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|twitterbot|linkedinbot|embedly|curl|wget|python-requests|axios|node-fetch|go-http-client/i.test(s);

  let browser = "Unknown";
  if (isHeadless) {
    if (/HeadlessChrome/i.test(s)) browser = "Headless Chrome";
    else if (/Puppeteer/i.test(s)) browser = "Puppeteer";
    else if (/Playwright/i.test(s)) browser = "Playwright";
    else if (/PhantomJS/i.test(s)) browser = "PhantomJS";
    else if (/Electron/i.test(s)) browser = "Electron";
    else browser = "Headless browser";
  } else if (/Edg\//i.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(s)) browser = "Opera";
  else if (/SamsungBrowser/i.test(s)) browser = "Samsung Internet";
  else if (/Firefox\//i.test(s)) browser = "Firefox";
  else if (/Chrome\//i.test(s)) browser = "Chrome";
  else if (/Safari\//i.test(s)) browser = "Safari";
  else if (isBot) browser = "Bot / script";

  let os = "Unknown";
  if (/Windows NT 10/i.test(s)) os = "Windows 10/11";
  else if (/Windows/i.test(s)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(s)) os = "iOS";
  else if (/Mac OS X/i.test(s)) os = "macOS";
  else if (/Android/i.test(s)) os = "Android";
  else if (/CrOS/i.test(s)) os = "ChromeOS";
  else if (/Linux/i.test(s)) os = "Linux";

  return { device, browser, os, isMobile: isPhone || isTablet, isBot, isHeadless };
}

/** Best-effort friendly source label from a referer URL. */
export function describeReferer(referer: string | null): { label: string; kind: "direct" | "app" | "site" | "search" | "social" } {
  if (!referer) return { label: "direct", kind: "direct" };
  let host = "";
  try {
    host = new URL(referer).hostname.replace(/^www\./, "");
  } catch {
    return { label: referer, kind: "site" };
  }
  const apps: Record<string, string> = {
    "l.facebook.com": "Facebook app",
    "lm.facebook.com": "Facebook app",
    "m.facebook.com": "Facebook mobile",
    "facebook.com": "Facebook",
    "l.instagram.com": "Instagram app",
    "instagram.com": "Instagram",
    "t.co": "X/Twitter app",
    "x.com": "X/Twitter",
    "twitter.com": "X/Twitter",
    "out.reddit.com": "Reddit app",
    "reddit.com": "Reddit",
    "old.reddit.com": "Reddit",
    "discord.com": "Discord",
    "discordapp.com": "Discord app",
    "t.me": "Telegram app",
    "web.telegram.org": "Telegram web",
    "youtube.com": "YouTube",
    "m.youtube.com": "YouTube mobile",
    "youtu.be": "YouTube link",
    "tiktok.com": "TikTok",
    "snapchat.com": "Snapchat",
    "linkedin.com": "LinkedIn",
    "lnkd.in": "LinkedIn app",
    "pinterest.com": "Pinterest",
    "whatsapp.com": "WhatsApp",
    "wa.me": "WhatsApp link",
  };
  const searches = ["google.", "bing.com", "duckduckgo.com", "yahoo.", "yandex.", "ecosia.org", "brave.com"];
  const socials = ["facebook", "instagram", "twitter", "x.com", "reddit", "tiktok", "snapchat", "linkedin", "pinterest", "discord", "telegram", "whatsapp", "youtube"];

  if (apps[host]) {
    const label = apps[host];
    const kind = /app|mobile|link/i.test(label) ? "app" : "social";
    return { label, kind: kind as "app" | "social" };
  }
  if (searches.some((s) => host.includes(s))) return { label: `${host} (search)`, kind: "search" };
  if (socials.some((s) => host.includes(s))) return { label: host, kind: "social" };
  return { label: host, kind: "site" };
}

export function requestMeta() {
  const ua = getRequestHeader("user-agent") ?? "unknown";
  const parsed = parseUserAgent(ua);
  return {
    ip: clientIp(),
    user_agent: ua,
    referer: getRequestHeader("referer") ?? null,
    country: getRequestHeader("cf-ipcountry") ?? null,
    language: getRequestHeader("accept-language") ?? null,
    ...parsed,
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

/** Race a promise against a timeout. Rejects on timeout so Promise.any can try the next provider. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

type GeoProvider = { name: string; fetch: (ip: string) => Promise<Geo> };

const providers: GeoProvider[] = [
  {
    name: "ipwho.is",
    fetch: async (ip) => {
      const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
      if (!r.ok) throw new Error(String(r.status));
      const b = await r.json() as { success?: boolean; country?: string; country_code?: string; region?: string; city?: string; connection?: { org?: string; isp?: string } };
      if (!b.success) throw new Error("not ok");
      return { country: b.country ?? null, country_code: b.country_code ?? null, region: b.region ?? null, city: b.city ?? null, org: b.connection?.org ?? b.connection?.isp ?? null };
    },
  },
  {
    name: "ipapi.co",
    fetch: async (ip) => {
      const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
      if (!r.ok) throw new Error(String(r.status));
      const b = await r.json() as { error?: boolean; country_name?: string; country_code?: string; region?: string; city?: string; org?: string };
      if (b.error) throw new Error("not ok");
      return { country: b.country_name ?? null, country_code: b.country_code ?? null, region: b.region ?? null, city: b.city ?? null, org: b.org ?? null };
    },
  },
  {
    name: "ip-api.com",
    fetch: async (ip) => {
      const r = await fetch(`https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,isp,org,as`);
      if (!r.ok) throw new Error(String(r.status));
      const b = await r.json() as { status?: string; country?: string; countryCode?: string; regionName?: string; city?: string; isp?: string; org?: string; as?: string };
      if (b.status !== "success") throw new Error("not ok");
      return { country: b.country ?? null, country_code: b.countryCode ?? null, region: b.regionName ?? null, city: b.city ?? null, org: b.org ?? b.isp ?? b.as ?? null };
    },
  },
  {
    name: "freeipapi.com",
    fetch: async (ip) => {
      const r = await fetch(`https://free.freeipapi.com/api/json/${encodeURIComponent(ip)}`);
      if (!r.ok) throw new Error(String(r.status));
      const b = await r.json() as { countryName?: string; countryCode?: string; regionName?: string; cityName?: string };
      return { country: b.countryName ?? null, country_code: b.countryCode ?? null, region: b.regionName ?? null, city: b.cityName ?? null, org: null };
    },
  },
];

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

  // Race all providers; take the first that succeeds within 2.5s each.
  let geo: Geo = EMPTY_GEO;
  try {
    geo = await Promise.any(providers.map((p) => withTimeout(p.fetch(ip), 2500)));
  } catch {
    // All providers failed; try sequentially with a longer timeout as a last resort.
    for (const p of providers) {
      try {
        geo = await withTimeout(p.fetch(ip), 4000);
        break;
      } catch {
        // try next
      }
    }
  }

  if (geo.country || geo.city) {
    await supabaseAdmin.from("geo_cache").upsert({ ip, ...geo, latitude: null, longitude: null }).then(() => undefined, () => undefined);
  }
  return geo;
}

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

async function telegramCall(
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; result?: { message_id?: number } | undefined; error?: string | undefined }> {
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
): Promise<{ ok: boolean; error?: string | undefined; messageId?: number | undefined }> {
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
    const edited = `${existing.base_text}\n\n🔁 <b>REVISIT ×${count}</b> · last ${new Date().toUTCString().slice(17, 25)} UTC`;
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

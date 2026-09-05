import { getRequestHeader } from "@tanstack/react-start/server";

export function clientIp(): string {
  const candidates = [
    getRequestHeader("cf-connecting-ip"),
    getRequestHeader("x-real-ip"),
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim(),
  ];
  return candidates.find((v) => v && v.length > 0) ?? "unknown";
}

export function requestMeta() {
  return {
    ip: clientIp(),
    user_agent: getRequestHeader("user-agent") ?? "unknown",
    referer: getRequestHeader("referer") ?? null,
    country: getRequestHeader("cf-ipcountry") ?? null,
    language: getRequestHeader("accept-language") ?? null,
  };
}

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export async function sendTelegram(text: string): Promise<{ ok: boolean; error?: string }> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const telegramKey = process.env["TELEGRAM_API_KEY"];
  if (!lovableKey || !telegramKey) {
    return { ok: false, error: "Telegram connector is not configured" };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", ["telegram_chat_id", "telegram_enabled"]);

  const map = Object.fromEntries((settings ?? []).map((r) => [r.key, r.value ?? ""]));
  const chatId = map["telegram_chat_id"];
  if (!chatId) return { ok: false, error: "No Telegram chat ID saved yet" };

  const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`Telegram gateway failed [${res.status}]: ${body}`);
    return { ok: false, error: `Telegram error [${res.status}]: ${body}` };
  }
  try {
    const parsed = JSON.parse(body) as { ok?: boolean; description?: string };
    if (parsed.ok === false) return { ok: false, error: parsed.description ?? "Telegram rejected the message" };
  } catch {
    /* non-JSON success body */
  }
  return { ok: true };
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

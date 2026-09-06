import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

function deriveSecret(key: string) {
  return createHash("sha256").update(`telegram-webhook:${key}`).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const telegramKey = process.env["TELEGRAM_API_KEY"];
        if (!telegramKey) return new Response("Not configured", { status: 503 });

        const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(provided, deriveSecret(telegramKey))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json()) as {
          message?: { chat?: { id?: number }; text?: string };
        };
        const chatId = update.message?.chat?.id;
        const text = (update.message?.text ?? "").trim().toLowerCase();
        if (!chatId) return Response.json({ ok: true, ignored: true });

        const { sendTelegram, getChatId } = await import("@/lib/telemetry.server");
        const allowed = await getChatId();

        if (text.startsWith("/start") || text.startsWith("/id")) {
          await sendTelegram(
            `<b>THING.zip telemetry bot</b>\nThis chat ID is <code>${chatId}</code>.\nPaste it into the admin panel, then send /visited for stats.`,
            String(chatId),
          );
          return Response.json({ ok: true });
        }

        if (text.startsWith("/visited") || text.startsWith("/stats")) {
          if (allowed && String(chatId) !== allowed) {
            await sendTelegram("Not authorized for this bot.", String(chatId));
            return Response.json({ ok: true });
          }
          const { statsMessage } = await import("@/lib/stats.server");
          await sendTelegram(await statsMessage(), String(chatId));
          return Response.json({ ok: true });
        }

        return Response.json({ ok: true, ignored: true });
      },
    },
  },
});

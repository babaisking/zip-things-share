import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { credentialsMatch, getAdminSession, requireAdmin } from "./admin.server";
import { sendTelegram } from "./telemetry.server";

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(128) }).parse(data),
  )
  .handler(async ({ data }) => {
    if (!credentialsMatch(data.username, data.password)) {
      return { ok: false as const };
    }
    const session = await getAdminSession();
    await session.update({ admin: true });
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await getAdminSession();
  await session.clear();
  return { ok: true };
});

export const adminStatus = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getAdminSession();
  return { admin: Boolean(session.data.admin) };
});

export const adminMetrics = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { buildStats } = await import("./stats.server");
  return await buildStats();
});


export const adminListZips = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("zips")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const adminUpsertZip = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(1000).default(""),
        fileBase64: z.string().optional(),
        fileName: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let uploaded: { path: string; size: number } | null = null;

    if (data.fileBase64 && data.fileName) {
      const buffer = Buffer.from(data.fileBase64, "base64");
      const path = `${crypto.randomUUID()}-${data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from("zips")
        .upload(path, buffer, { contentType: "application/zip", upsert: false });
      if (upErr) throw new Error(upErr.message);
      uploaded = { path, size: buffer.byteLength };
    }

    if (data.id) {
      const patch = uploaded
        ? {
            name: data.name,
            description: data.description,
            updated_at: new Date().toISOString(),
            storage_path: uploaded.path,
            size_bytes: uploaded.size,
          }
        : {
            name: data.name,
            description: data.description,
            updated_at: new Date().toISOString(),
          };
      const { error } = await supabaseAdmin.from("zips").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }

    if (!uploaded) throw new Error("A zip file is required for new entries");
    const { data: inserted, error } = await supabaseAdmin
      .from("zips")
      .insert({
        name: data.name,
        description: data.description,
        storage_path: uploaded.path,
        size_bytes: uploaded.size,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const adminDeleteZip = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: zip } = await supabaseAdmin
      .from("zips")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (zip?.storage_path) {
      await supabaseAdmin.storage.from("zips").remove([zip.storage_path]);
    }
    const { error } = await supabaseAdmin.from("zips").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGetSettings = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_settings").select("key, value");
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value ?? "";
  return {
    telegram_chat_id: map["telegram_chat_id"] ?? "",
    telegram_enabled: map["telegram_enabled"] === "true",
    telegram_configured: Boolean(process.env["TELEGRAM_API_KEY"] && process.env["LOVABLE_API_KEY"]),
  };
});

export const adminSaveSettings = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        telegram_chat_id: z.string().trim().max(64),
        telegram_enabled: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("app_settings").upsert([
      { key: "telegram_chat_id", value: data.telegram_chat_id },
      { key: "telegram_enabled", value: data.telegram_enabled ? "true" : "false" },
    ]);
    return { ok: true };
  });

export const adminSendTelegramTest = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  return await sendTelegram("<b>✅ Test</b>\nTelemetry is wired up correctly.");
});

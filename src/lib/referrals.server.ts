/** Referral bookkeeping. Every visitor IP owns one referral code; each unique
 *  IP that arrives through that code and downloads something grants one credit.
 *  Credits are what unlock locked archives. */

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8);
}

export type Referral = { code: string; credits: number };

export async function getOrCreateReferral(ip: string): Promise<Referral | null> {
  if (!ip || ip === "unknown") return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing } = await supabaseAdmin
    .from("referrals")
    .select("code, credits")
    .eq("ip", ip)
    .maybeSingle();
  if (existing) return existing as Referral;

  const { data: created } = await supabaseAdmin
    .from("referrals")
    .insert({ code: newCode(), ip })
    .select("code, credits")
    .maybeSingle();
  if (created) return created as Referral;

  // Raced with another request; read again.
  const { data: retry } = await supabaseAdmin
    .from("referrals")
    .select("code, credits")
    .eq("ip", ip)
    .maybeSingle();
  return (retry as Referral | null) ?? null;
}

export async function getCredits(ip: string): Promise<number> {
  const ref = await getOrCreateReferral(ip);
  return ref?.credits ?? 0;
}

/** Records that this visitor arrived through someone else's referral link. */
export async function registerReferralClick(code: string, visitorIp: string): Promise<void> {
  if (!code || !visitorIp || visitorIp === "unknown") return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: owner } = await supabaseAdmin
    .from("referrals")
    .select("code, ip")
    .eq("code", code)
    .maybeSingle();
  if (!owner || owner.ip === visitorIp) return; // no self-referrals
  await supabaseAdmin
    .from("referral_clicks")
    .upsert({ code, visitor_ip: visitorIp }, { onConflict: "code,visitor_ip", ignoreDuplicates: true })
    .then(() => undefined, () => undefined);
}

/** Called after a successful download: converts pending clicks into credits. */
export async function creditReferrersFor(visitorIp: string): Promise<void> {
  if (!visitorIp || visitorIp === "unknown") return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: pending } = await supabaseAdmin
    .from("referral_clicks")
    .select("id, code")
    .eq("visitor_ip", visitorIp)
    .eq("downloaded", false);
  for (const row of pending ?? []) {
    await supabaseAdmin.from("referral_clicks").update({ downloaded: true }).eq("id", row.id);
    const { data: ref } = await supabaseAdmin
      .from("referrals")
      .select("credits")
      .eq("code", row.code)
      .maybeSingle();
    await supabaseAdmin
      .from("referrals")
      .update({ credits: (ref?.credits ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq("code", row.code);
  }
}

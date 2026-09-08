ALTER TABLE public.zips
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlock_referrals integer NOT NULL DEFAULT 1;

UPDATE public.zips SET is_locked = false;

CREATE TABLE IF NOT EXISTS public.referrals (
  code text PRIMARY KEY,
  ip text NOT NULL UNIQUE,
  credits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no client access to referrals" ON public.referrals
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.referral_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL REFERENCES public.referrals(code) ON DELETE CASCADE,
  visitor_ip text NOT NULL,
  downloaded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, visitor_ip)
);

GRANT ALL ON public.referral_clicks TO service_role;
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no client access to referral_clicks" ON public.referral_clicks
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS referral_clicks_visitor_idx ON public.referral_clicks (visitor_ip);
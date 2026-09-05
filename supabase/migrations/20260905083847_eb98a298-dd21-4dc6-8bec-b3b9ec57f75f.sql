
CREATE POLICY "no client access" ON public.visits FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no client access" ON public.downloads FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no client access" ON public.app_settings FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

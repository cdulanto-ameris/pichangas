
-- 1. Vista con security_invoker (respeta RLS del usuario que consulta)
ALTER VIEW public.ranking_jugadores SET (security_invoker = true);

-- 2. Endurecer policy de calificaciones: el partido debe existir
DROP POLICY IF EXISTS "calif_insert_auth" ON public.calificaciones;
CREATE POLICY "calif_insert_auth" ON public.calificaciones
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.partidos pa WHERE pa.id = partido_id)
    AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = calificado_id)
  );

-- 3. Revocar EXECUTE en SECURITY DEFINER functions de roles públicos
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
-- has_role debe quedar ejecutable por authenticated (las policies lo usan)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

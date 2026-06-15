ALTER VIEW public.ranking_jugadores SET (security_invoker = true);
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
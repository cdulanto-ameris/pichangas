
-- 1) Profiles: drop email column (admin obtiene emails vía supabaseAdmin/auth.users)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;

-- Update handle_new_user trigger to not insert email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, sobrenombre)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'sobrenombre', split_part(NEW.email,'@',1))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'jugador')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2) Calificaciones: helper to check participation in match
CREATE OR REPLACE FUNCTION public.is_participant(_user_id uuid, _partido_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partidos p
    WHERE p.id = _partido_id
      AND (
        p.equipo_blanco @> jsonb_build_array(jsonb_build_object('jugador_id', _user_id::text))
        OR p.equipo_negro @> jsonb_build_array(jsonb_build_object('jugador_id', _user_id::text))
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_participant(uuid, uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "calif_insert_auth" ON public.calificaciones;

CREATE POLICY "calif_insert_participant"
ON public.calificaciones
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_participant(auth.uid(), partido_id)
  AND auth.uid() <> calificado_id
  AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = calificado_id)
);

-- 3) Lock down has_role: solo se ejecuta desde políticas (definer)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

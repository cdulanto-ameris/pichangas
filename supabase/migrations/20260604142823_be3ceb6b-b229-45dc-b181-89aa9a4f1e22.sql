
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'jugador', 'parche');
CREATE TYPE public.sector_cancha AS ENUM ('DEL_IZQ','DEL_CEN','DEL_DER','MED_IZQ','MED_CEN','MED_DER','DEF_IZQ','DEF_CEN','DEF_DER');
CREATE TYPE public.equipo_color AS ENUM ('blanco','negro');
CREATE TYPE public.resultado_partido AS ENUM ('blanco','negro','empate');
CREATE TYPE public.estado_partido AS ENUM ('abierto','cerrado','conflicto');

-- UTIL: updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  sobrenombre TEXT NOT NULL,
  es_parche BOOLEAN NOT NULL DEFAULT false,
  sector_1 public.sector_cancha,
  sector_2 public.sector_cancha,
  sector_3 public.sector_cancha,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- PROFILES POLICIES
CREATE POLICY "profiles_select_all_auth" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- USER ROLES POLICIES
CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_manage" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- PARTIDOS
CREATE TABLE public.partidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  ganador public.resultado_partido,
  estado public.estado_partido NOT NULL DEFAULT 'abierto',
  equipo_blanco JSONB NOT NULL DEFAULT '[]'::jsonb,
  equipo_negro JSONB NOT NULL DEFAULT '[]'::jsonb,
  goles_blanco_total INT NOT NULL DEFAULT 0,
  goles_negro_total INT NOT NULL DEFAULT 0,
  creado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partidos TO authenticated;
GRANT ALL ON public.partidos TO service_role;
ALTER TABLE public.partidos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_partidos_updated BEFORE UPDATE ON public.partidos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "partidos_select_all" ON public.partidos FOR SELECT TO authenticated USING (true);
CREATE POLICY "partidos_admin_all" ON public.partidos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ESTADISTICAS PARTIDO
CREATE TABLE public.estadisticas_partido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partido_id UUID NOT NULL REFERENCES public.partidos(id) ON DELETE CASCADE,
  jugador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  equipo public.equipo_color NOT NULL,
  goles INT NOT NULL DEFAULT 0,
  asistencias INT NOT NULL DEFAULT 0,
  declarado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(partido_id, jugador_id)
);
GRANT SELECT, INSERT, UPDATE ON public.estadisticas_partido TO authenticated;
GRANT ALL ON public.estadisticas_partido TO service_role;
ALTER TABLE public.estadisticas_partido ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_stats_updated BEFORE UPDATE ON public.estadisticas_partido
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "stats_select_all" ON public.estadisticas_partido FOR SELECT TO authenticated USING (true);
CREATE POLICY "stats_update_own" ON public.estadisticas_partido FOR UPDATE TO authenticated
  USING (auth.uid() = jugador_id) WITH CHECK (auth.uid() = jugador_id);
CREATE POLICY "stats_admin_all" ON public.estadisticas_partido FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- CALIFICACIONES (anónimas)
CREATE TABLE public.calificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partido_id UUID NOT NULL REFERENCES public.partidos(id) ON DELETE CASCADE,
  calificado_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nota NUMERIC(3,1) NOT NULL CHECK (nota >= 1 AND nota <= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.calificaciones TO authenticated;
GRANT ALL ON public.calificaciones TO service_role;
ALTER TABLE public.calificaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calif_insert_auth" ON public.calificaciones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "calif_admin_select" ON public.calificaciones FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- CONFIGURACION
CREATE TABLE public.configuracion_global (
  clave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.configuracion_global TO authenticated, anon;
GRANT ALL ON public.configuracion_global TO service_role;
ALTER TABLE public.configuracion_global ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_select_all" ON public.configuracion_global FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "config_admin_write" ON public.configuracion_global FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.configuracion_global(clave, valor) VALUES
  ('REGISTRO_ABIERTO','true'::jsonb),
  ('MOSTRAR_NOTAS_PUBLICAS','false'::jsonb);

-- TRIGGER: auto-crear profile + rol jugador al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, sobrenombre)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'sobrenombre', split_part(NEW.email,'@',1))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'jugador')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- VISTA RANKING (agregada, accesible a todos los autenticados)
CREATE OR REPLACE VIEW public.ranking_jugadores AS
SELECT
  p.id,
  p.sobrenombre,
  COUNT(DISTINCT s.partido_id) FILTER (WHERE pa.estado = 'cerrado') AS pj,
  COUNT(DISTINCT s.partido_id) FILTER (WHERE pa.estado = 'cerrado' AND ((s.equipo='blanco' AND pa.ganador='blanco') OR (s.equipo='negro' AND pa.ganador='negro'))) AS pg,
  COUNT(DISTINCT s.partido_id) FILTER (WHERE pa.estado = 'cerrado' AND pa.ganador = 'empate') AS pe,
  COUNT(DISTINCT s.partido_id) FILTER (WHERE pa.estado = 'cerrado' AND ((s.equipo='blanco' AND pa.ganador='negro') OR (s.equipo='negro' AND pa.ganador='blanco'))) AS pp,
  COALESCE(SUM(s.goles) FILTER (WHERE pa.estado='cerrado'),0)::INT AS goles,
  COALESCE(SUM(s.asistencias) FILTER (WHERE pa.estado='cerrado'),0)::INT AS asistencias
FROM public.profiles p
LEFT JOIN public.estadisticas_partido s ON s.jugador_id = p.id
LEFT JOIN public.partidos pa ON pa.id = s.partido_id
GROUP BY p.id, p.sobrenombre;

GRANT SELECT ON public.ranking_jugadores TO authenticated, anon;

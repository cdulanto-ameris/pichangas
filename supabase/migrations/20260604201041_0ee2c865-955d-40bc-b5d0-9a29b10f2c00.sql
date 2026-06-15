
ALTER TABLE public.calificaciones ADD COLUMN IF NOT EXISTS votante_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
DELETE FROM public.calificaciones WHERE votante_id IS NULL;
ALTER TABLE public.calificaciones ALTER COLUMN votante_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS calificaciones_unique_voto ON public.calificaciones (partido_id, votante_id, calificado_id);

DROP POLICY IF EXISTS "calif_insert_participant" ON public.calificaciones;
CREATE POLICY "calif_insert_participant" ON public.calificaciones
  FOR INSERT TO authenticated
  WITH CHECK (
    is_participant(auth.uid(), partido_id)
    AND auth.uid() <> calificado_id
    AND auth.uid() = votante_id
    AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = calificaciones.calificado_id)
  );

CREATE POLICY "calif_update_own" ON public.calificaciones
  FOR UPDATE TO authenticated
  USING (auth.uid() = votante_id)
  WITH CHECK (auth.uid() = votante_id);

CREATE POLICY "calif_select_own" ON public.calificaciones
  FOR SELECT TO authenticated
  USING (auth.uid() = votante_id);

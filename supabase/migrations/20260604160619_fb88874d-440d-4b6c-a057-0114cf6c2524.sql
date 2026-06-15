DELETE FROM public.calificaciones;
ALTER TABLE public.calificaciones DROP CONSTRAINT IF EXISTS calificaciones_nota_check;
ALTER TABLE public.calificaciones ALTER COLUMN nota TYPE numeric(3,1);
ALTER TABLE public.calificaciones ADD CONSTRAINT calificaciones_nota_check CHECK (nota >= 1 AND nota <= 10);
ALTER TABLE public.calificaciones DROP CONSTRAINT calificaciones_nota_check;
ALTER TABLE public.calificaciones ADD CONSTRAINT calificaciones_nota_check CHECK (nota >= 0 AND nota <= 100);
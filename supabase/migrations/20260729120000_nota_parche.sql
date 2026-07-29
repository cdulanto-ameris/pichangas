-- Nota manual para parches.
-- Los parches no reciben calificaciones (calificar() los excluye), así que el
-- armador les asignaba siempre 6.5 y los equipos quedaban desparejos. Con esto
-- el admin les fija un nivel a mano.
-- NULL = sin nota fijada → el armador vuelve al 6.5 por defecto.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nota_manual NUMERIC(3,1);

-- Mismo rango y mismo paso de 0.5 que las notas que se dan entre jugadores.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_nota_manual_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_nota_manual_check
  CHECK (
    nota_manual IS NULL
    OR (nota_manual >= 1 AND nota_manual <= 10 AND mod(nota_manual * 10, 5) = 0)
  );

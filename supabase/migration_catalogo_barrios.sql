-- =====================================================================
-- MillaOps Hub — Migración: Catálogo persistente de barrios
-- =====================================================================
-- Problema que resuelve:
--   Los chips de "Gestión Territorial" se calculaban solo a partir de
--   `servicios` activos + `reglas_asignacion` + semilla estática. Si un barrio
--   se le quitaba a un técnico y no tenía órdenes abiertas en el corte, dejaba
--   de existir en pantalla y quedaba INACCESIBLE para asignarlo a otro técnico.
--
-- Solución:
--   Catálogo maestro que se nutre automáticamente de cualquier archivo que se
--   ingeste (abiertos, cerrados o crudo) y de las reglas sincronizadas. Un
--   barrio entra una sola vez y NUNCA se borra, aunque quede con 0 órdenes y
--   0 técnicos asignados.
--
-- Idempotente: se puede ejecutar varias veces sin efectos secundarios.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.catalogo_barrios (
  ciudad TEXT NOT NULL,
  barrio TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ciudad, barrio)
);

-- Comentario de dominio para quien inspeccione el esquema.
COMMENT ON TABLE public.catalogo_barrios IS
  'Catálogo maestro de barrios por ciudad. Se nutre automáticamente de la ingesta y de las reglas; nunca se borra, para que un barrio desasignado siga visible en Gestión Territorial.';

-- RLS permisivo (mismo modelo que el resto de tablas operativas del Hub).
ALTER TABLE public.catalogo_barrios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo en catalogo_barrios" ON public.catalogo_barrios;
CREATE POLICY "Permitir todo en catalogo_barrios" ON public.catalogo_barrios
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Índice para búsquedas por ciudad (carga del catálogo en la UI).
CREATE INDEX IF NOT EXISTS idx_catalogo_barrios_ciudad
  ON public.catalogo_barrios (ciudad);

-- =====================================================================
-- Semilla inicial: rellena el catálogo con TODO lo que ya existe hoy,
-- para no empezar en frío y recuperar de inmediato los barrios que
-- quedaron huérfanos (ej. La Paila y Zarzal).
-- =====================================================================

-- 1) Barrios presentes en la matriz de reglas.
INSERT INTO public.catalogo_barrios (ciudad, barrio)
SELECT DISTINCT ciudad, barrio
FROM public.reglas_asignacion
WHERE barrio IS NOT NULL AND btrim(barrio) <> '' AND btrim(ciudad) <> ''
ON CONFLICT (ciudad, barrio) DO NOTHING;

-- 2) Barrios presentes en los servicios cargados (abiertos o cerrados).
INSERT INTO public.catalogo_barrios (ciudad, barrio)
SELECT DISTINCT ciudad, barrio
FROM public.servicios
WHERE barrio IS NOT NULL AND btrim(barrio) <> '' AND btrim(ciudad) <> ''
ON CONFLICT (ciudad, barrio) DO NOTHING;

-- =====================================================================
-- Verificación sugerida tras ejecutar:
--   SELECT ciudad, count(*) AS barrios
--   FROM public.catalogo_barrios
--   GROUP BY ciudad
--   ORDER BY barrios DESC;
-- =====================================================================

-- =====================================================================
-- MillaOps Hub — Migración: Cierres técnicos (última semana)
-- =====================================================================
-- Propósito:
--   Auditoría de las ejecuciones reales de la última semana. A diferencia del
--   despacho (que solo guarda órdenes ABIERTAS), aquí interesan las CERRADAS,
--   con su fecha de cierre y el técnico que las ejecutó en Sigma.
--
-- Modelo de carga:
--   VENTANA DESLIZANTE. En cada reporte se conservan únicamente las órdenes
--   cerradas cuya `fecha_cierre` cae dentro de los 7 días previos a la fecha
--   de cierre MÁS RECIENTE del propio archivo (no la de hoy: un reporte
--   atrasado sigue teniendo sentido). El conjunto se reemplaza en cada carga.
--
-- Volumen estimado: ~1.000 a 1.500 filas por carga.
--
-- Idempotente: se puede ejecutar varias veces sin efectos secundarios.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.servicios_cierres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id TEXT NOT NULL,
  ciudad TEXT NOT NULL,
  barrio TEXT,
  direccion TEXT,
  cliente_nombre TEXT,
  telefono TEXT,
  tipo_servicio TEXT,
  dias_abierta INTEGER DEFAULT 0,
  fecha_cierre DATE NOT NULL,
  tecnico_cierre TEXT, -- Técnico que ejecutó el cierre en Sigma (Columna C)
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.servicios_cierres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso publico servicios_cierres" ON public.servicios_cierres;
CREATE POLICY "Acceso publico servicios_cierres" ON public.servicios_cierres FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_cierres_ciudad ON public.servicios_cierres(ciudad);
CREATE INDEX IF NOT EXISTS idx_cierres_fecha ON public.servicios_cierres(fecha_cierre);
CREATE INDEX IF NOT EXISTS idx_cierres_orden ON public.servicios_cierres(orden_id);

COMMIT;

-- =====================================================================
-- Verificación sugerida tras ejecutar:
--   SELECT fecha_cierre, count(*) AS cierres
--   FROM public.servicios_cierres
--   GROUP BY fecha_cierre
--   ORDER BY fecha_cierre DESC;
-- =====================================================================

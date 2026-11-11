-- =====================================================================
-- MillaOps Hub — Migración: Persistencia cíclica de instalaciones
-- =====================================================================
-- Problema que resuelve:
--   Las órdenes de "Instalaciones y Traslados" se mantenían solo en memoria
--   de React: al refrescar (F5) se perdían y había que re-subir el Excel de
--   Sigma. Este módulo las persiste para sobrevivir recargas y permitir que
--   varios usuarios vean el mismo tablero.
--
-- Modelo de carga:
--   REEMPLAZO TOTAL (cíclico). Cada reporte de Sigma borra el conjunto
--   anterior e inserta el nuevo. No hay historial: el tablero siempre
--   refleja el último reporte cargado.
--   ⚠️ Consecuencia: los usuarios de distintos cortes/ciudades se pisan
--   entre sí. Si más adelante se necesita trabajo multiusuario simultáneo,
--   conviene añadir `lote_nombre` + `cargado_por` y filtrar por lote activo.
--
-- Volumen estimado: ~355 filas (~120 KB), muy por debajo del tier gratuito.
--
-- Idempotente: se puede ejecutar varias veces sin efectos secundarios.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.servicios_instalaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id TEXT NOT NULL,
  ciudad TEXT NOT NULL,
  barrio TEXT,
  direccion TEXT,
  cliente_nombre TEXT,
  telefono TEXT,
  tipo_servicio TEXT,
  dias_abierta INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.servicios_instalaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso publico servicios_instalaciones" ON public.servicios_instalaciones;
CREATE POLICY "Acceso publico servicios_instalaciones" ON public.servicios_instalaciones FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_inst_ciudad ON public.servicios_instalaciones(ciudad);
CREATE INDEX IF NOT EXISTS idx_inst_orden ON public.servicios_instalaciones(orden_id);

COMMIT;

-- =====================================================================
-- Verificación sugerida tras ejecutar:
--   SELECT ciudad, count(*) AS instalaciones
--   FROM public.servicios_instalaciones
--   GROUP BY ciudad
--   ORDER BY instalaciones DESC;
-- =====================================================================

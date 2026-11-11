-- =====================================================================
-- MillaOps Hub — Módulo: Control de Instalaciones y Puertos
-- =====================================================================
-- Propósito:
--   Bitácora de bloqueos de instalación (puerto NAP, ampliación de red,
--   cobertura, cliente no contactado). Una orden de instalación puede tener
--   como máximo UNA novedad vigente, por eso `orden_id` es la clave primaria
--   y el guardado desde la UI es un upsert por esa clave.
--
-- Nota de retención:
--   Las órdenes de instalación NO se persisten en `servicios`: viven en
--   memoria del navegador. Esta tabla guarda únicamente la novedad (texto
--   corto), por lo que su crecimiento es despreciable.
--
-- Idempotente: se puede ejecutar varias veces sin efectos secundarios.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.novedades_instalaciones (
  orden_id TEXT PRIMARY KEY,
  tipo_novedad TEXT NOT NULL CHECK (tipo_novedad IN (
    'pendiente_puerto',    -- 🔌 Pendiente Liberar Puerto (Caja NAP)
    'ampliacion_nap',      -- 📦 Requiere Ampliación NAP
    'sin_cobertura',       -- 📍 Sin Cobertura / Red Saturada
    'cliente_no_contacta', -- 📞 Cliente No Contactado / Reagendado
    'otra'                 -- ⚠️ Otra Novedad
  )),
  caja_nap TEXT,                                      -- Ej: 'NAP-04', 'Puerto 3'
  comentario TEXT,                                    -- Descripción del bloqueo
  estado_gestion TEXT DEFAULT 'pendiente' CHECK (estado_gestion IN ('pendiente', 'en_gestion', 'resuelto')),
  usuario TEXT,                                       -- Usuario que registra la nota
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS abierto para la aplicación
ALTER TABLE public.novedades_instalaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso publico novedades_instalaciones" ON public.novedades_instalaciones;
CREATE POLICY "Acceso publico novedades_instalaciones" ON public.novedades_instalaciones 
FOR ALL USING (true) WITH CHECK (true);

-- Índices de aceleración
CREATE INDEX IF NOT EXISTS idx_novedades_tipo ON public.novedades_instalaciones(tipo_novedad);
CREATE INDEX IF NOT EXISTS idx_novedades_estado ON public.novedades_instalaciones(estado_gestion);

COMMIT;

-- =====================================================================
-- Verificación sugerida tras ejecutar:
--   SELECT tipo_novedad, estado_gestion, count(*)
--   FROM public.novedades_instalaciones
--   GROUP BY tipo_novedad, estado_gestion
--   ORDER BY 3 DESC;
-- =====================================================================

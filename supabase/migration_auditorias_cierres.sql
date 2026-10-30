-- =====================================================================
-- MillaOps Hub — Migración: Persistencia multiusuario de auditorías de cierres
-- =====================================================================
-- Tabla que guarda el histórico y la última auditoría de cierres, para
-- hidratar la UI automáticamente (persistencia tras F5 y entre usuarios).
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS auditorias_cierres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_archivo_anterior TEXT NOT NULL,
  fecha_corte_anterior TIMESTAMPTZ NOT NULL,
  nombre_archivo_actual TEXT NOT NULL,
  fecha_corte_actual TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_cerrados INTEGER NOT NULL DEFAULT 0,
  total_nuevos INTEGER NOT NULL DEFAULT 0,
  datos_resultado JSONB NOT NULL, -- Objeto completo { cerrados, nuevos, metricasPorTecnico, balancePorCiudad }
  creado_por TEXT DEFAULT 'Daniel Córdoba',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS permisivo (mismo modelo que el resto de tablas operativas).
ALTER TABLE auditorias_cierres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo en auditorias_cierres" ON auditorias_cierres;
CREATE POLICY "Permitir todo en auditorias_cierres" ON auditorias_cierres
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Índice para consultar la última auditoría en O(1).
CREATE INDEX IF NOT EXISTS idx_auditorias_fecha ON auditorias_cierres (created_at DESC);

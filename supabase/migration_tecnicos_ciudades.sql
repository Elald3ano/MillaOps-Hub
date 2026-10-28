-- =====================================================================
-- MillaOps Hub — Ciudades activas por técnico (Gestión Territorial)
-- =====================================================================
-- Tabla para persistir qué ciudades se muestran en el tablero de cada
-- técnico (módulo de Gestión Territorial). Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS tecnicos_ciudades (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tecnico_id UUID NOT NULL REFERENCES tecnicos (id) ON DELETE CASCADE,
  ciudad     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tecnico_ciudad UNIQUE (tecnico_id, ciudad)
);

CREATE INDEX IF NOT EXISTS idx_tecnicos_ciudades_tecnico
  ON tecnicos_ciudades (tecnico_id);

-- Política de acceso (mismo modelo permisivo que el resto de tablas).
ALTER TABLE tecnicos_ciudades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tecnicos_ciudades_acceso_publico" ON tecnicos_ciudades;
CREATE POLICY "tecnicos_ciudades_acceso_publico" ON tecnicos_ciudades
  FOR ALL TO anon, authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

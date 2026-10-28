-- =====================================================================
-- MillaOps Hub — Migración: campos del reporte Sigma
-- =====================================================================
-- Agrega las columnas con datos del cliente provenientes del reporte Sigma.
-- Seguro de re-ejecutar: usa IF NOT EXISTS.
-- =====================================================================

ALTER TABLE servicios
  ADD COLUMN IF NOT EXISTS nombre_cliente TEXT,
  ADD COLUMN IF NOT EXISTS telefono_cliente TEXT,
  ADD COLUMN IF NOT EXISTS referencia_pago TEXT,
  ADD COLUMN IF NOT EXISTS identificacion TEXT,
  ADD COLUMN IF NOT EXISTS estado_sigma TEXT;

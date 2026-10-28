-- =====================================================================
-- MillaOps Hub — Migración: campo de documento del técnico
-- =====================================================================
-- Agrega la columna `documento` (cédula / documento de identidad) a la
-- tabla `tecnicos`. Seguro de re-ejecutar: usa IF NOT EXISTS.
-- =====================================================================

ALTER TABLE tecnicos
  ADD COLUMN IF NOT EXISTS documento TEXT;

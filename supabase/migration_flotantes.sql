-- =====================================================================
-- MillaOps Hub — Migración: Cuadrillas Flotantes / Especializadas
-- =====================================================================
-- Permite que un mismo barrio conviva entre:
--   - 1 Técnico general (Carro):  tipo_servicio = NULL  → prioridad 2
--   - 1+ Técnicos flotantes (Moto) para servicios específicos:
--       tipo_servicio = 'Cambio de clave' → prioridad 1
--
-- El índice anterior `idx_regla_ciudad_barrio_unica` forzaba "1 barrio =
-- 1 técnico" a nivel de base de datos. Este nuevo índice relaja esa regla:
-- ahora la unicidad es por (ciudad, barrio, tipo_servicio), de modo que solo
-- puede existir UNA regla general (tipo_servicio NULL → '') por barrio, pero
-- tantas reglas flotantes como servicios distintos existan.
--
-- ⚠️ Requisito previo (verificado 27/10/2026): no debe haber reglas
--    duplicadas en (ciudad, barrio, COALESCE(tipo_servicio, '')). Si hay
--    duplicados, deduplica antes de crear el índice.
-- =====================================================================

-- Elimina el índice restrictivo anterior si existe.
DROP INDEX IF EXISTS idx_regla_ciudad_barrio_unica;

-- Crea el índice único compuesto que permite convivencia por especialidad:
CREATE UNIQUE INDEX IF NOT EXISTS idx_regla_especialidad_unica
  ON reglas_asignacion (ciudad, barrio, COALESCE(tipo_servicio, ''));

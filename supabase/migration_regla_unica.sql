-- =====================================================================
-- MillaOps Hub — Índice único de integridad territorial
-- =====================================================================
-- Regla KISS: 1 Barrio = 1 Técnico. Garantiza a nivel de base de datos
-- que no existan dos reglas para el mismo (ciudad, barrio).
--
-- ⚠️ Requisito previo: deduplicar las reglas históricas. Si hay duplicados,
--    ejecuta antes `npx tsx scripts/sanear_database.ts`.
-- =====================================================================

-- Nota: `barrio` puede ser NULL (reglas "solo ciudad" heredadas). El índice
-- sobre (ciudad, barrio) no restringe los NULL (PostgreSQL los trata como
-- distintos). Si en el futuro se quiere incluir los barrios vacíos:
--   CREATE UNIQUE INDEX ... ON reglas_asignacion (ciudad, COALESCE(barrio, ''));
CREATE UNIQUE INDEX IF NOT EXISTS idx_regla_ciudad_barrio_unica
  ON reglas_asignacion (ciudad, barrio);

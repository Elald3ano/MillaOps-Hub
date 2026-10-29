-- =====================================================================
-- MillaOps Hub — Migración: Cobertura Christian Foronda (Toro Valle + La Union Valle)
-- =====================================================================
-- Corrige la cobertura territorial de Christian Estiben Foronda Pined:
--   1. Sigma envía la sucursal como "Toro Valle", pero las reglas estaban
--      bajo "Toro" (alias que ahora unifica `zonasPermitidas.ts`).
--   2. Sigma envía "La Union Valle" (antes descartada por la lista blanca).
--
-- Idempotente: `ON CONFLICT DO NOTHING` evita duplicados al re-ejecutar.
-- ⚠️ Las reglas históricas bajo "Toro" / "La Union" quedan como respaldo;
--    la app las unifica vía `ciudadCanonica` (alias) sin duplicar cobertura.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Los 19 barrios oficiales de Toro, bajo la ciudad canónica "Toro Valle".
-- ---------------------------------------------------------------------
WITH tecnico AS (
  SELECT id
  FROM tecnicos
  WHERE nombre IN ('Christian Estiben Foronda Pined', 'Christian Estiben Foronda Pineda')
  ORDER BY nombre
  LIMIT 1
)
INSERT INTO reglas_asignacion (tecnico_id, ciudad, barrio, tipo_servicio, prioridad)
SELECT tecnico.id, 'Toro Valle', m.barrio, NULL, 2
FROM (VALUES
  ('CENTRO'),
  ('CHIMINANGOS'),
  ('EL CHANCO'),
  ('EL HOBO'),
  ('EL LAZARO'),
  ('EL PORVENIR'),
  ('JUAN PABLO II'),
  ('LA TIZA'),
  ('LA TRONCADA'),
  ('LAS AURAS'),
  ('PALERMO'),
  ('REMANSO'),
  ('SAN ANTONIO'),
  ('SAN JOSE'),
  ('SANTA ELENA'),
  ('VALLANO'),
  ('VILLA CLARIBET'),
  ('VILLA LOURDES'),
  ('VILLA PAMELA')
) AS m(barrio)
CROSS JOIN tecnico
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 2) Reglas de La Unión, bajo la ciudad canónica "La Union Valle".
-- ---------------------------------------------------------------------
WITH tecnico AS (
  SELECT id
  FROM tecnicos
  WHERE nombre IN ('Christian Estiben Foronda Pined', 'Christian Estiben Foronda Pineda')
  ORDER BY nombre
  LIMIT 1
)
INSERT INTO reglas_asignacion (tecnico_id, ciudad, barrio, tipo_servicio, prioridad)
SELECT tecnico.id, 'La Union Valle', m.barrio, NULL, 2
FROM (VALUES
  ('U1 BELEN'),
  ('U1 CIUDADELA'),
  ('U1 EL PRADO'),
  ('U1 FATIMA'),
  ('U1 GUACIMO'),
  ('U1 LA CRUZ'),
  ('U1 LAS LAJAS'),
  ('U1 LAS PALMAS'),
  ('U2 EL CARMEN'),
  ('U2 JARDIN'),
  ('U2 LAS BRISAS'),
  ('U2 POPULAR'),
  ('U2 SAN PEDRO'),
  ('U2 URB.EL AMPARO'),
  ('U2 URB.PRADOS DEL NORTE'),
  ('U2 URBANIZACION VILLA BETEL')
) AS m(barrio)
CROSS JOIN tecnico
ON CONFLICT DO NOTHING;

COMMIT;

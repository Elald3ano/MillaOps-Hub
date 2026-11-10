-- =====================================================================
-- MillaOps Hub — Migración: Recuperación de barrios huérfanos
-- =====================================================================
-- Barrios que hoy existen en `reglas_asignacion` pero YA NO tienen órdenes
-- abiertas en el corte. Al desasignarlos desaparecían de la pantalla de
-- Gestión Territorial y quedaban inaccesibles.
--
-- Este script los deja registrados en el catálogo maestro para que sigan
-- siendo asignables a cualquier técnico de su ciudad.
--
-- Requiere haber ejecutado antes:
--   supabase/migration_catalogo_barrios.sql
--
-- Idempotente (ON CONFLICT DO NOTHING): se puede ejecutar N veces.
-- =====================================================================

-- 1) Todo barrio presente en la matriz (incluye los que no tienen órdenes).
INSERT INTO public.catalogo_barrios (ciudad, barrio)
SELECT DISTINCT ciudad, barrio
FROM public.reglas_asignacion
WHERE barrio IS NOT NULL
  AND btrim(barrio) <> ''
  AND btrim(ciudad) <> ''
ON CONFLICT (ciudad, barrio) DO NOTHING;

-- 2) Todo barrio presente en los servicios cargados (abiertos o cerrados).
INSERT INTO public.catalogo_barrios (ciudad, barrio)
SELECT DISTINCT ciudad, barrio
FROM public.servicios
WHERE barrio IS NOT NULL
  AND btrim(barrio) <> ''
  AND btrim(ciudad) <> ''
ON CONFLICT (ciudad, barrio) DO NOTHING;

-- 3) Semilla estática de las ciudades con cold start (Roldanillo, Poblado
--    Valle). Se mantiene sincronizada con `src/lib/catalogoBarrios.ts`.
INSERT INTO public.catalogo_barrios (ciudad, barrio) VALUES
  ('Roldanillo', 'ALCAZAR'),
  ('Roldanillo', 'EL PRADO'),
  ('Roldanillo', 'EL REY'),
  ('Roldanillo', 'EUSTAQUIO PALACIOS'),
  ('Roldanillo', 'IRRUPA'),
  ('Roldanillo', 'JOSE M. BARBOSA'),
  ('Roldanillo', 'LA ASUNCION'),
  ('Roldanillo', 'LOS PINOS'),
  ('Roldanillo', 'SAN NICOLAS'),
  ('Roldanillo', 'SAN SEBASTIAN'),
  ('Roldanillo', 'TIERRA BLANCA'),
  ('Roldanillo', 'TORRIJOS'),
  ('Roldanillo', 'UNION DE VIVIENDA'),
  ('Roldanillo', 'ARRAYANES'),
  ('Roldanillo', 'CACERES'),
  ('Roldanillo', 'DONA EMMA'),
  ('Roldanillo', 'GUERRERO'),
  ('Roldanillo', 'IPIRA'),
  ('Roldanillo', 'J. J. JARAMILLO'),
  ('Roldanillo', 'LA CEIBA'),
  ('Roldanillo', 'LA ERMITA'),
  ('Roldanillo', 'LLANITOS'),
  ('Roldanillo', 'NUEVA ERMITA'),
  ('Roldanillo', 'OBRERO'),
  ('Roldanillo', 'SAN JOSE OBRERO'),
  ('Roldanillo', 'SIMON BOLIVAR'),
  ('Roldanillo', 'VILLA EMMA'),
  ('Poblado Valle', 'Arboleda'),
  ('Poblado Valle', 'Poblado')
ON CONFLICT (ciudad, barrio) DO NOTHING;

-- =====================================================================
-- VERIFICACIÓN — barrios huérfanos recuperados
-- =====================================================================
-- SELECT ciudad, count(*) AS barrios
-- FROM public.catalogo_barrios
-- WHERE ciudad IN ('La Paila', 'Zarzal')
-- GROUP BY ciudad;
--
-- Resultado esperado:
--   La Paila  -> 5   (VILLA DEL RIO + BELISARIO CAICEDO, GENERAL,
--                     LA FRUTERA, VILLA DLE SOL)
--   Zarzal    -> 8   (INSTITUTO, ZARZALITO, BOLIVAR, GONZALO ECHEVERRY,
--                     CIUDAD JARDIN, GUAMAL, LIBRAIDA, LOS ALMENDROS)
-- =====================================================================

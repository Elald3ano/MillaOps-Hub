-- =====================================================================
-- MillaOps Hub — Esquema de Base de Datos (Supabase / PostgreSQL)
-- Script de inicialización completo
-- =====================================================================
-- Uso: ejecutar completo en el SQL Editor de Supabase (o vía `supabase db push`).
-- El script es idempotente: puede volver a ejecutarse sin errores.
-- =====================================================================

-- Extensión para generación de UUIDs (v4).
-- En PostgreSQL >= 13 `gen_random_uuid()` es nativo; se declara por
-- compatibilidad y claridad.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TABLAS Y RELACIONES
-- ---------------------------------------------------------------------

-- Técnicos disponibles para asignación
CREATE TABLE IF NOT EXISTS tecnicos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     TEXT NOT NULL,
  telefono   TEXT,
  documento  TEXT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reglas de asignación automática (matriz ciudad/barrio/servicio -> técnico)
CREATE TABLE IF NOT EXISTS reglas_asignacion (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tecnico_id    UUID NOT NULL REFERENCES tecnicos (id) ON DELETE CASCADE,
  ciudad        TEXT NOT NULL,
  barrio        TEXT,
  tipo_servicio TEXT,
  -- 1: Ciudad+Barrio+Servicio · 2: Ciudad+Barrio · 3: Solo Ciudad
  prioridad     INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lotes de carga: cada importación de Excel / snapshot
CREATE TABLE IF NOT EXISTS lotes_carga (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          TEXT NOT NULL,
  fecha_corte     TIMESTAMPTZ NOT NULL,
  es_linea_base   BOOLEAN NOT NULL DEFAULT FALSE,
  total_servicios INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Servicios (órdenes) importadas por lote
CREATE TABLE IF NOT EXISTS servicios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id         UUID NOT NULL REFERENCES lotes_carga (id) ON DELETE CASCADE,
  numero_orden    TEXT NOT NULL,
  ciudad          TEXT NOT NULL,
  barrio          TEXT NOT NULL,
  direccion       TEXT,
  tipo_servicio   TEXT NOT NULL,
  nombre_cliente     TEXT,
  telefono_cliente   TEXT,
  referencia_pago    TEXT,
  identificacion     TEXT,
  estado_sigma       TEXT,
  fecha_creacion  TIMESTAMPTZ NOT NULL,
  dias_antiguedad INTEGER NOT NULL DEFAULT 0,
  tecnico_id      UUID REFERENCES tecnicos (id) ON DELETE SET NULL,
  estado          TEXT NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'CERRADO')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. CONSTRAINTS DE NEGOCIO CRÍTICOS
-- ---------------------------------------------------------------------

-- Índice único parcial: solo puede existir un lote con es_linea_base = TRUE
CREATE UNIQUE INDEX IF NOT EXISTS idx_unico_lote_linea_base
  ON lotes_carga (es_linea_base)
  WHERE es_linea_base = TRUE;

-- ---------------------------------------------------------------------
-- 3. ÍNDICES DE ALTO RENDIMIENTO
-- ---------------------------------------------------------------------

-- Búsqueda y diff de órdenes por número de orden
CREATE INDEX IF NOT EXISTS idx_servicios_numero_orden ON servicios (numero_orden);

-- Filtrado por lote y estado
CREATE INDEX IF NOT EXISTS idx_servicios_lote_estado ON servicios (lote_id, estado);

-- Asignación por técnico
CREATE INDEX IF NOT EXISTS idx_servicios_tecnico_id ON servicios (tecnico_id);

-- Búsqueda en la matriz de asignación
CREATE INDEX IF NOT EXISTS idx_reglas_busqueda ON reglas_asignacion (ciudad, barrio, tipo_servicio);

-- ---------------------------------------------------------------------
-- 4. POLÍTICAS DE SEGURIDAD (RLS - Row Level Security)
-- ---------------------------------------------------------------------
-- Entorno operativo interno consumido desde una SPA estática en GitHub Pages:
-- se habilitan políticas permisivas para los roles `anon` y `authenticated`.

ALTER TABLE tecnicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reglas_asignacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes_carga ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tecnicos_acceso_publico" ON tecnicos;
CREATE POLICY "tecnicos_acceso_publico" ON tecnicos
  FOR ALL TO anon, authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "reglas_acceso_publico" ON reglas_asignacion;
CREATE POLICY "reglas_acceso_publico" ON reglas_asignacion
  FOR ALL TO anon, authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "lotes_acceso_publico" ON lotes_carga;
CREATE POLICY "lotes_acceso_publico" ON lotes_carga
  FOR ALL TO anon, authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "servicios_acceso_publico" ON servicios;
CREATE POLICY "servicios_acceso_publico" ON servicios
  FOR ALL TO anon, authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- ---------------------------------------------------------------------
-- 5. SEMILLA DE PRUEBA (Seed Data)
-- ---------------------------------------------------------------------

-- Técnicos ficticios (IDs fijos para poder referenciarlos en las reglas)
INSERT INTO tecnicos (id, nombre, telefono) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Carlos Mario Restrepo', '3001234567'),
  ('22222222-2222-4222-8222-222222222222', 'Andrés Felipe Henao',  '3109876543'),
  ('33333333-3333-4333-8333-333333333333', 'Julián David Morales', '3155555555')
ON CONFLICT (id) DO NOTHING;

-- Reglas de ejemplo que demuestran la cascada de especificidad
INSERT INTO reglas_asignacion (id, tecnico_id, ciudad, barrio, tipo_servicio, prioridad) VALUES
  -- Prioridad 1: Ciudad + Barrio + Servicio (la más específica)
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'Medellín', 'Belén', 'Instalación', 1),
  -- Prioridad 2: Ciudad + Barrio
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '22222222-2222-4222-8222-222222222222', 'Medellín', 'Belén', NULL, 2),
  -- Prioridad 3: Solo Ciudad (general)
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '33333333-3333-4333-8333-333333333333', 'Medellín', NULL, NULL, 3)
ON CONFLICT (id) DO NOTHING;

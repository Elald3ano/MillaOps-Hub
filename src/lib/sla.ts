/**
 * Clasificación de antigüedad / SLA compartida por métricas, badges y filtros.
 * Una única fuente de verdad evita inconsistencias entre la tabla y las tarjetas.
 */
export type SlaLevel = 'ok' | 'warn' | 'critical'

export const SLA_MAX_OK = 2 // 1 a 2 días
export const SLA_MAX_WARN = 5 // 3 a 5 días

export function clasificarSla(dias: number): SlaLevel {
  if (dias <= SLA_MAX_OK) return 'ok'
  if (dias <= SLA_MAX_WARN) return 'warn'
  return 'critical'
}

/** Órdenes "críticas": más de 5 días (alimenta badge, KPI y filtro de PDF). */
export function esCritica(dias: number): boolean {
  return dias > SLA_MAX_WARN
}

export const SLA_LABELS: Record<SlaLevel, string> = {
  ok: '1 a 2 días',
  warn: '3 a 5 días',
  critical: '+5 días (Crítico)',
}

/** Clases de Tailwind por nivel de SLA (badges y textos). */
export const SLA_BADGE_CLASSES: Record<SlaLevel, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  critical: 'bg-red-50 text-red-700 ring-1 ring-red-200',
}

/** Rango de días de los filtros de SLA. */
export type RangoSla = 'todos' | 'ok' | 'warn' | 'critical'

export function coincideRangoSla(dias: number, rango: RangoSla): boolean {
  if (rango === 'todos') return true
  return clasificarSla(dias) === rango
}

/** Ciudades sugeridas para el filtro de carga. */
export const CIUDADES_SUGERIDAS = [
  'Pereira',
  'Cali',
  'Manizales',
  'Medellín',
  'Bogotá',
  'Armenia',
] as const

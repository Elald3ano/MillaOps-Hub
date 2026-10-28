/**
 * Clasificación de antigüedad / SLA compartida por métricas, bloques y filtros.
 * Una única fuente de verdad evita inconsistencias entre la tabla y las tarjetas.
 */
export type SlaLevel = 'ok' | 'warn' | 'critical'

/**
 * Semáforo de SLA (estilo Looker Studio):
 *  🟢 verde    → <= 1 día  (al día)
 *  🟡 amarillo → 2 días    (atención)
 *  🔴 rojo     → >= 3 días (crítico)
 */
export function clasificarSla(dias: number): SlaLevel {
  if (dias <= 1) return 'ok'
  if (dias === 2) return 'warn'
  return 'critical'
}

/** Órdenes "críticas": 3 o más días (alimenta bloque, KPI y filtro de PDF). */
export function esCritica(dias: number): boolean {
  return dias >= 3
}

export const SLA_LABELS: Record<SlaLevel, string> = {
  ok: '1 día',
  warn: '2 días',
  critical: '3+ días',
}

/** Clases de Tailwind del bloque sólido por nivel de SLA (semáforo). */
export const SLA_BADGE_CLASSES: Record<SlaLevel, string> = {
  ok: 'bg-emerald-600 text-white',
  warn: 'bg-yellow-400 text-slate-900',
  critical: 'bg-red-600 text-white',
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

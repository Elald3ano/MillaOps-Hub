// Tipos de dominio para TechDispatch Hub

export interface Tecnico {
  id: string
  nombre: string
  telefono?: string
  activo: boolean
}

export interface ReglaAsignacion {
  id: string
  tecnico_id: string
  ciudad: string
  barrio?: string
  tipo_servicio?: string
  prioridad: number
}

export interface LoteCarga {
  id: string
  nombre: string
  fecha_corte: string
  es_linea_base: boolean
  total_servicios: number
  created_at: string
}

export type EstadoServicio = 'ABIERTO' | 'CERRADO'

export interface Servicio {
  id: string
  lote_id: string
  numero_orden: string
  ciudad: string
  barrio: string
  direccion?: string
  tipo_servicio: string
  fecha_creacion: string
  dias_antiguedad: number
  tecnico_id: string | null
  estado: EstadoServicio
}

export interface ResumenMetricas {
  totalAbiertos: number
  cerrados: number
  criticosMas5Dias: number
  ordenesPorTecnico: Record<string, number>
}

// Servicio aún no persistido: sin `id` ni `lote_id` (se generan al guardar).
export type ServicioNuevo = Omit<Servicio, 'id' | 'lote_id'>

// Regla de asignación con su técnico relacionado (join de lectura).
export interface ReglaConTecnico extends ReglaAsignacion {
  tecnico: Tecnico
}

// Datos para crear una regla de asignación (sin `id`).
export type NuevaRegla = Omit<ReglaAsignacion, 'id'>

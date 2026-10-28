// Tipos de dominio para MillaOps Hub

export interface Tecnico {
  id: string
  nombre: string
  telefono?: string
  documento?: string
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

export type EstadoServicio = 'ABIERTO' | 'CERRADO'

export interface Servicio {
  id: string
  lote_id: string
  numero_orden: string // ← columna Sigma "Servicio"
  ciudad: string // ← columna Sigma "Sucursal"
  barrio: string // ← columna Sigma "Barrio"
  direccion?: string // ← columna Sigma "Dirección"
  tipo_servicio: string // ← columna Sigma "Tipo de solicitud"
  nombre_cliente?: string // ← columna Sigma "Nombre"
  telefono_cliente?: string // ← columna Sigma "Teléfono"
  referencia_pago?: string // ← columna Sigma "Referencia de pago"
  identificacion?: string // ← columna Sigma "Identificación"
  estado_sigma?: string // ← columna Sigma "Estado en Sigma"
  fecha_creacion: string // ← columna Sigma "Fecha de creación"
  dias_antiguedad: number // ← columna Sigma "Días abierta" (fallback a cálculo)
  tecnico_id: string | null // asignado por el motor de cascada
  estado: EstadoServicio
}

// Servicio aún no persistido: sin `id` ni `lote_id` (se generan al guardar).
export type ServicioNuevo = Omit<Servicio, 'id' | 'lote_id'>

// Regla de asignación con su técnico relacionado (join de lectura).
export interface ReglaConTecnico extends ReglaAsignacion {
  tecnico: Tecnico
}

// Datos para crear una regla de asignación (sin `id`).
export type NuevaRegla = Omit<ReglaAsignacion, 'id'>

// Modalidad de una cuadrilla territorial.
export type ModalidadCuadrilla = 'general' | 'flotante'

// Configuración de una cuadrilla para una ciudad (se persiste como reglas).
export interface ConfigCuadrilla {
  modalidad: ModalidadCuadrilla
  // Solo relevante para cuadrilla flotante (una regla P1 por servicio × barrio).
  servicios: string[]
  // Barrios que cubre el técnico en esa ciudad.
  barrios: string[]
}


// Fila de la matriz de asignación leída desde Excel (importación masiva).
export interface FilaMatrizImport {
  sucursal: string
  barrio: string
  tecnico: string
  tipo_servicio?: string
}

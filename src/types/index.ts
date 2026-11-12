// Tipos de dominio para MillaOps Hub

export type RolTecnico = 'patrulla' | 'operador'

export interface Tecnico {
  id: string
  nombre: string
  documento?: string
  telefono?: string
  placa?: string
  rol?: RolTecnico | null
  patrulla_id?: string | null
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
  /** Técnico que reporta Sigma (informativo; el motor asigna tecnico_id). */
  tecnico_sigma?: string
  /** Fecha de cierre reportada por Sigma (solo órdenes cerradas). */
  fecha_cierre?: string
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

/** Categoría de servicio (clasificación de Intake del Centro de Mando). */
export interface CategoriaServicio {
  id: string
  nombre: string
  modulo_destino: string
  color: string
  activo_despacho: boolean
  created_at: string
}

/** Mapeo tipo de solicitud → categoría (tabla mapeo_servicios). */
export interface MapeoServicio {
  tipo_solicitud: string
  categoria_id: string
  updated_at: string
}

/** Categoría con sus tipos de servicio ya resueltos (join en memoria). */
export interface CategoriaConServicios extends CategoriaServicio {
  tipos_servicio: MapeoServicio[]
}

/** Asignación editable en la UI de categorización. */
export interface AsignacionServicio {
  tipo_solicitud: string
  categoria_id: string | null
  /** true si el tipo no existe en mapeo_servicios (fail-open → entra al despacho). */
  sin_clasificar: boolean
}

// ---- Control de Instalaciones y Puertos ----

/** Motivo de bloqueo de una orden de instalación. */
export type TipoNovedadInstalacion =
  | 'pendiente_puerto'
  | 'ampliacion_nap'
  | 'sin_cobertura'
  | 'cliente_no_contacta'
  | 'otra'

/** Estado del seguimiento de la novedad. */
export type EstadoGestionNovedad = 'pendiente' | 'en_gestion' | 'resuelto'

/**
 * Novedad vigente de una orden de instalación (tabla `novedades_instalaciones`).
 * `orden_id` es el número de orden de Sigma y actúa como clave única: una orden
 * tiene como máximo una novedad, que se sobrescribe con cada guardado.
 */
export interface NovedadInstalacion {
  orden_id: string
  tipo_novedad: TipoNovedadInstalacion
  caja_nap?: string
  comentario?: string
  estado_gestion: EstadoGestionNovedad
  usuario?: string
  created_at: string
  updated_at: string
}

/** Datos editables al registrar una novedad (sin marcas de tiempo). */
export type EntradaNovedadInstalacion = Pick<
  NovedadInstalacion,
  'orden_id' | 'tipo_novedad' | 'estado_gestion'
> &
  Partial<Pick<NovedadInstalacion, 'caja_nap' | 'comentario' | 'usuario'>>

/** Etiqueta de un tipo de novedad: icono + texto para badges y filtros. */
export interface EtiquetaNovedad {
  tipo: TipoNovedadInstalacion
  icono: string
  etiqueta: string
  descripcion: string
}

// ---- Cierres técnicos (última semana) ----

/**
 * Orden cerrada en Sigma dentro de la ventana de 7 días.
 *
 * Extiende `ServicioNuevo` añadiendo los dos campos informativos del reporte
 * que NO viven en la tabla `servicios`: la fecha de cierre (aquí es
 * obligatoria) y el técnico que ejecutó el cierre.
 */
export interface CierreTecnico extends ServicioNuevo {
  /** Fecha de cierre (`YYYY-MM-DD`), ya recortada al día. */
  fecha_cierre: string
  /** Técnico que cerró en Sigma; `undefined` si el reporte no lo trae. */
  tecnico_cierre?: string
}

/** Origen de un cierre según quién lo ejecutó. */
export type OrigenCierre = 'titular' | 'externo' | 'sin_dueno'



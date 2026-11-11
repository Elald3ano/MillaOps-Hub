import type { EstadoServicio } from './index'
import type { ResultadoCierres } from '../services/reconciliationService'

/**
 * Tipos de la base de datos de Supabase (esquema `public`).
 * Permiten que `createClient<Database>()` infiera filas, inserciones y
 * actualizaciones de forma estricta, sin recurrir a `any`.
 *
 * `Relationships` se declara vacío porque el servicio resuelve los joins en
 * memoria (dos consultas en paralelo + `Map`), en lugar de embebidos `(*)`.
 */
export type Database = {
  public: {
    Tables: {
      tecnicos: {
        Row: {
          id: string
          nombre: string
          telefono: string | null
          documento: string | null
          activo: boolean
          created_at: string
          rol: string | null
          placa: string | null
          patrulla_id: string | null
        }
        Insert: {
          id?: string
          nombre: string
          telefono?: string | null
          documento?: string | null
          activo?: boolean
          created_at?: string
          rol?: string | null
          placa?: string | null
          patrulla_id?: string | null
        }
        Update: {
          id?: string
          nombre?: string
          telefono?: string | null
          documento?: string | null
          activo?: boolean
          created_at?: string
          rol?: string | null
          placa?: string | null
          patrulla_id?: string | null
        }
        Relationships: []
      }
      catalogo_barrios: {
        Row: {
          ciudad: string
          barrio: string
          created_at: string
        }
        Insert: {
          ciudad: string
          barrio: string
          created_at?: string
        }
        Update: {
          ciudad?: string
          barrio?: string
          created_at?: string
        }
        Relationships: []
      }
      reglas_asignacion: {
        Row: {
          id: string
          tecnico_id: string
          ciudad: string
          barrio: string | null
          tipo_servicio: string | null
          prioridad: number
          created_at: string
        }
        Insert: {
          id?: string
          tecnico_id: string
          ciudad: string
          barrio?: string | null
          tipo_servicio?: string | null
          prioridad?: number
          created_at?: string
        }
        Update: {
          id?: string
          tecnico_id?: string
          ciudad?: string
          barrio?: string | null
          tipo_servicio?: string | null
          prioridad?: number
          created_at?: string
        }
        Relationships: []
      }
      tecnicos_ciudades: {
        Row: {
          id: string
          tecnico_id: string
          ciudad: string
          created_at: string
        }
        Insert: {
          id?: string
          tecnico_id: string
          ciudad: string
          created_at?: string
        }
        Update: {
          id?: string
          tecnico_id?: string
          ciudad?: string
          created_at?: string
        }
        Relationships: []
      }
      lotes_carga: {
        Row: {
          id: string
          nombre: string
          fecha_corte: string
          es_linea_base: boolean
          total_servicios: number
          created_at: string
        }
        Insert: {
          id?: string
          nombre: string
          fecha_corte: string
          es_linea_base?: boolean
          total_servicios?: number
          created_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          fecha_corte?: string
          es_linea_base?: boolean
          total_servicios?: number
          created_at?: string
        }
        Relationships: []
      }
      servicios: {
        Row: {
          id: string
          lote_id: string
          numero_orden: string
          ciudad: string
          barrio: string
          direccion: string | null
          tipo_servicio: string
          nombre_cliente: string | null
          telefono_cliente: string | null
          referencia_pago: string | null
          identificacion: string | null
          estado_sigma: string | null
          fecha_creacion: string
          dias_antiguedad: number
          tecnico_id: string | null
          estado: EstadoServicio
          created_at: string
        }
        Insert: {
          id?: string
          lote_id: string
          numero_orden: string
          ciudad: string
          barrio: string
          direccion?: string | null
          tipo_servicio: string
          nombre_cliente?: string | null
          telefono_cliente?: string | null
          referencia_pago?: string | null
          identificacion?: string | null
          estado_sigma?: string | null
          fecha_creacion: string
          dias_antiguedad?: number
          tecnico_id?: string | null
          estado?: EstadoServicio
          created_at?: string
        }
        Update: {
          id?: string
          lote_id?: string
          numero_orden?: string
          ciudad?: string
          barrio?: string
          direccion?: string | null
          tipo_servicio?: string
          nombre_cliente?: string | null
          telefono_cliente?: string | null
          referencia_pago?: string | null
          identificacion?: string | null
          estado_sigma?: string | null
          fecha_creacion?: string
          dias_antiguedad?: number
          tecnico_id?: string | null
          estado?: EstadoServicio
          created_at?: string
        }
        Relationships: []
      }
      auditorias_cierres: {
        Row: {
          id: string
          nombre_archivo_anterior: string
          fecha_corte_anterior: string
          nombre_archivo_actual: string
          fecha_corte_actual: string
          total_cerrados: number
          total_nuevos: number
          datos_resultado: ResultadoCierres
          creado_por: string
          created_at: string
        }
        Insert: {
          id?: string
          nombre_archivo_anterior: string
          fecha_corte_anterior: string
          nombre_archivo_actual: string
          fecha_corte_actual?: string
          total_cerrados?: number
          total_nuevos?: number
          datos_resultado: ResultadoCierres
          creado_por?: string
          created_at?: string
        }
        Update: {
          id?: string
          nombre_archivo_anterior?: string
          fecha_corte_anterior?: string
          nombre_archivo_actual?: string
          fecha_corte_actual?: string
          total_cerrados?: number
          total_nuevos?: number
          datos_resultado?: ResultadoCierres
          creado_por?: string
          created_at?: string
        }
        Relationships: []
      }
      categorias_servicios: {
        Row: {
          id: string
          nombre: string
          modulo_destino: string
          color: string
          activo_despacho: boolean
          created_at: string
        }
        Insert: {
          id?: string
          nombre: string
          modulo_destino: string
          color?: string
          activo_despacho?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          modulo_destino?: string
          color?: string
          activo_despacho?: boolean
          created_at?: string
        }
        Relationships: []
      }
      mapeo_servicios: {
        Row: {
          tipo_solicitud: string
          categoria_id: string
          updated_at: string
        }
        Insert: {
          tipo_solicitud: string
          categoria_id: string
          updated_at?: string
        }
        Update: {
          tipo_solicitud?: string
          categoria_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      novedades_instalaciones: {
        Row: {
          orden_id: string
          tipo_novedad: string
          caja_nap: string | null
          comentario: string | null
          estado_gestion: string
          usuario: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          orden_id: string
          tipo_novedad: string
          caja_nap?: string | null
          comentario?: string | null
          estado_gestion?: string
          usuario?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          orden_id?: string
          tipo_novedad?: string
          caja_nap?: string | null
          comentario?: string | null
          estado_gestion?: string
          usuario?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      servicios_instalaciones: {
        Row: {
          id: string
          orden_id: string
          ciudad: string
          barrio: string | null
          direccion: string | null
          cliente_nombre: string | null
          telefono: string | null
          tipo_servicio: string | null
          dias_abierta: number | null
          created_at: string
        }
        Insert: {
          id?: string
          orden_id: string
          ciudad: string
          barrio?: string | null
          direccion?: string | null
          cliente_nombre?: string | null
          telefono?: string | null
          tipo_servicio?: string | null
          dias_abierta?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          orden_id?: string
          ciudad?: string
          barrio?: string | null
          direccion?: string | null
          cliente_nombre?: string | null
          telefono?: string | null
          tipo_servicio?: string | null
          dias_abierta?: number | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

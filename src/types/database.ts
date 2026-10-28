import type { EstadoServicio } from './index'

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
        }
        Insert: {
          id?: string
          nombre: string
          telefono?: string | null
          documento?: string | null
          activo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          nombre?: string
          telefono?: string | null
          documento?: string | null
          activo?: boolean
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

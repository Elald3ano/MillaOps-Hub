import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'
import type { LoteCarga, NuevaRegla, ReglaConTecnico, Servicio, ServicioNuevo, Tecnico } from '../types'

type TecnicoRow = Database['public']['Tables']['tecnicos']['Row']
type ReglaRow = Database['public']['Tables']['reglas_asignacion']['Row']
type ServicioRow = Database['public']['Tables']['servicios']['Row']

// Supabase limita el payload de una inserción; se particiona en lotes de 500.
const TAMANO_LOTE_INSERCION = 500

function mapTecnico(row: TecnicoRow): Tecnico {
  return {
    id: row.id,
    nombre: row.nombre,
    telefono: row.telefono ?? undefined,
    activo: row.activo,
  }
}

function mapServicio(row: ServicioRow): Servicio {
  return {
    id: row.id,
    lote_id: row.lote_id,
    numero_orden: row.numero_orden,
    ciudad: row.ciudad,
    barrio: row.barrio,
    direccion: row.direccion ?? undefined,
    tipo_servicio: row.tipo_servicio,
    fecha_creacion: row.fecha_creacion,
    dias_antiguedad: row.dias_antiguedad,
    tecnico_id: row.tecnico_id,
    estado: row.estado,
  }
}

function mapReglaConTecnico(regla: ReglaRow, tecnico: TecnicoRow): ReglaConTecnico {
  return {
    id: regla.id,
    tecnico_id: regla.tecnico_id,
    ciudad: regla.ciudad,
    barrio: regla.barrio ?? undefined,
    tipo_servicio: regla.tipo_servicio ?? undefined,
    prioridad: regla.prioridad,
    tecnico: mapTecnico(tecnico),
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/** Devuelve todos los técnicos ordenados por nombre. */
export async function getTecnicos(): Promise<Tecnico[]> {
  const { data, error } = await supabase
    .from('tecnicos')
    .select('*')
    .order('nombre', { ascending: true })

  if (error) throw new Error(`Error al obtener técnicos: ${error.message}`)
  return (data ?? []).map(mapTecnico)
}

/** Devuelve las reglas de asignación con su técnico relacionado. */
export async function getReglas(): Promise<ReglaConTecnico[]> {
  const [reglasResult, tecnicosResult] = await Promise.all([
    supabase.from('reglas_asignacion').select('*'),
    supabase.from('tecnicos').select('*'),
  ])

  if (reglasResult.error) {
    throw new Error(`Error al obtener reglas: ${reglasResult.error.message}`)
  }
  if (tecnicosResult.error) {
    throw new Error(`Error al obtener técnicos: ${tecnicosResult.error.message}`)
  }

  const tecnicosPorId = new Map((tecnicosResult.data ?? []).map((t) => [t.id, t]))

  return (reglasResult.data ?? []).flatMap((regla) => {
    const tecnico = tecnicosPorId.get(regla.tecnico_id)
    if (!tecnico) return []
    return [mapReglaConTecnico(regla, tecnico)]
  })
}

/** Devuelve el historial de lotes importados (más recientes primero). */
export async function getLotes(): Promise<LoteCarga[]> {
  const { data, error } = await supabase
    .from('lotes_carga')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Error al obtener lotes: ${error.message}`)
  return data ?? []
}

/** Obtiene el lote activo marcado como línea base junto con sus servicios. */
export async function getLoteLineaBase(): Promise<{
  lote: LoteCarga
  servicios: Servicio[]
} | null> {
  const { data: lote, error: loteError } = await supabase
    .from('lotes_carga')
    .select('*')
    .eq('es_linea_base', true)
    .maybeSingle()

  if (loteError) throw new Error(`Error al obtener la línea base: ${loteError.message}`)
  if (!lote) return null

  const { data: servicios, error: serviciosError } = await supabase
    .from('servicios')
    .select('*')
    .eq('lote_id', lote.id)

  if (serviciosError) {
    throw new Error(`Error al obtener servicios de la línea base: ${serviciosError.message}`)
  }

  return {
    lote,
    servicios: (servicios ?? []).map(mapServicio),
  }
}

/**
 * Desmarca la línea base actual y marca el lote indicado como nueva línea base.
 * Se ejecuta como serie lógica (el índice único parcial garantiza una sola base).
 */
export async function setLoteLineaBase(loteId: string): Promise<void> {
  const { error: unsetError } = await supabase
    .from('lotes_carga')
    .update({ es_linea_base: false })
    .eq('es_linea_base', true)

  if (unsetError) throw new Error(`Error al desmarcar la línea base: ${unsetError.message}`)

  const { error: setError } = await supabase
    .from('lotes_carga')
    .update({ es_linea_base: true })
    .eq('id', loteId)

  if (setError) throw new Error(`Error al marcar la línea base: ${setError.message}`)
}

/**
 * Crea un nuevo lote y guarda sus servicios en lotes (chunks de 500 registros).
 * Devuelve el `lote_id` creado.
 */
export async function guardarNuevoLote(
  nombre: string,
  fechaCorte: Date,
  servicios: ServicioNuevo[],
  esLineaBaseInicial: boolean,
): Promise<string> {
  const { data: lote, error: loteError } = await supabase
    .from('lotes_carga')
    .insert({
      nombre,
      fecha_corte: fechaCorte.toISOString(),
      es_linea_base: esLineaBaseInicial,
      total_servicios: servicios.length,
    })
    .select('id')
    .single()

  if (loteError) throw new Error(`Error al crear el lote: ${loteError.message}`)

  const loteId = lote.id

  try {
    for (const chunk of chunkArray(servicios, TAMANO_LOTE_INSERCION)) {
      const filas = chunk.map((servicio) => ({ ...servicio, lote_id: loteId }))
      const { error } = await supabase.from('servicios').insert(filas)
      if (error) throw new Error(`Error al insertar servicios: ${error.message}`)
    }
  } catch (error) {
    // Rollback lógico: eliminar el lote recién creado.
    // (ON DELETE CASCADE sobre `servicios.lote_id` limpia lo ya insertado)
    await supabase.from('lotes_carga').delete().eq('id', loteId)
    throw error
  }

  return loteId
}

/** Reasigna manualmente un técnico a un servicio (o lo deja sin asignar). */
export async function actualizarTecnicoServicio(
  servicioId: string,
  tecnicoId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('servicios')
    .update({ tecnico_id: tecnicoId })
    .eq('id', servicioId)

  if (error) throw new Error(`Error al actualizar el técnico del servicio: ${error.message}`)
}

/** Marca un conjunto de servicios como CERRADOS (persistencia de la reconciliación). */
export async function marcarServiciosCerrados(servicioIds: string[]): Promise<void> {
  if (servicioIds.length === 0) return

  for (const chunk of chunkArray(servicioIds, TAMANO_LOTE_INSERCION)) {
    const { error } = await supabase
      .from('servicios')
      .update({ estado: 'CERRADO' })
      .in('id', chunk)

    if (error) throw new Error(`Error al marcar servicios como cerrados: ${error.message}`)
  }
}

/** Devuelve los servicios ya cerrados (histórico de reconciliaciones). */
export async function getServiciosCerrados(): Promise<Servicio[]> {
  const { data, error } = await supabase
    .from('servicios')
    .select('*')
    .eq('estado', 'CERRADO')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Error al obtener servicios cerrados: ${error.message}`)
  return (data ?? []).map(mapServicio)
}

/** Inserta una nueva regla de asignación. */
export async function crearRegla(input: NuevaRegla): Promise<void> {
  const { error } = await supabase.from('reglas_asignacion').insert({
    tecnico_id: input.tecnico_id,
    ciudad: input.ciudad,
    barrio: input.barrio ?? null,
    tipo_servicio: input.tipo_servicio ?? null,
    prioridad: input.prioridad,
  })

  if (error) throw new Error(`Error al crear la regla: ${error.message}`)
}

/** Elimina una regla de asignación existente. */
export async function eliminarRegla(reglaId: string): Promise<void> {
  const { error } = await supabase.from('reglas_asignacion').delete().eq('id', reglaId)

  if (error) throw new Error(`Error al eliminar la regla: ${error.message}`)
}

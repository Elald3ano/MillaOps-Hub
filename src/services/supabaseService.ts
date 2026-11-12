import { supabase } from '../lib/supabase'
import { aplicarMatrizAsignacion, calcularPrioridad } from './assignmentEngine'
import { limpiarBarrio, limpiarPrefijoNodo, limpiarTexto } from '../lib/normalizer'
import { ciudadCanonica, esSucursalAutorizada } from '../lib/zonasPermitidas'
import type { Database } from '../types/database'
import type {
  CategoriaConServicios,
  CategoriaServicio,
  CierreTecnico,
  ConfigCuadrilla,
  EntradaNovedadInstalacion,
  EstadoGestionNovedad,
  FilaMatrizImport,
  MapeoServicio,
  NovedadInstalacion,
  NuevaRegla,
  ReglaAsignacion,
  ReglaConTecnico,
  RolTecnico,
  Servicio,
  ServicioNuevo,
  Tecnico,
  TipoNovedadInstalacion,
} from '../types'

type TecnicoRow = Database['public']['Tables']['tecnicos']['Row']
type ReglaRow = Database['public']['Tables']['reglas_asignacion']['Row']
type ServicioRow = Database['public']['Tables']['servicios']['Row']
type AuditoriaCierresRow = Database['public']['Tables']['auditorias_cierres']['Row']
type AuditoriaCierresInsert = Database['public']['Tables']['auditorias_cierres']['Insert']
type CategoriaRow = Database['public']['Tables']['categorias_servicios']['Row']
type CategoriaInsert = Database['public']['Tables']['categorias_servicios']['Insert']
type MapeoServicioRow = Database['public']['Tables']['mapeo_servicios']['Row']
type NovedadInstalacionRow = Database['public']['Tables']['novedades_instalaciones']['Row']
type NovedadInstalacionInsert =
  Database['public']['Tables']['novedades_instalaciones']['Insert']
type InstalacionRow = Database['public']['Tables']['servicios_instalaciones']['Row']
type InstalacionInsert = Database['public']['Tables']['servicios_instalaciones']['Insert']
type CierreRow = Database['public']['Tables']['servicios_cierres']['Row']
type CierreInsert = Database['public']['Tables']['servicios_cierres']['Insert']

// Supabase limita el payload de una inserción; se particiona en lotes de 500.
const TAMANO_LOTE_INSERCION = 500
// Lote de actualización masiva para la reasignación de servicios.
const TAMANO_LOTE_ACTUALIZACION = 200
// PostgREST trunca las LECTURAS a 1.000 filas por defecto; se pagina por lotes.
const TAMANO_PAGINA_LECTURA = 1000

/**
 * Lee TODAS las filas de una consulta paginando con `.range()`.
 *
 * Supabase/PostgREST devuelve como máximo 1.000 filas por petición, por lo que
 * una lectura `select('*')` sin paginar ocultaba silenciosamente el resto de la
 * matriz (p. ej. las cuadrillas flotantes de un técnico), mostrando datos
 * incompletos tras recargar. Esta helper recorre todas las páginas y las une.
 */
async function leerTodasLasFilas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>,
): Promise<
  { data: T[]; error: null } | { data: null; error: { message: string } }
> {
  const filas: T[] = []
  for (let desde = 0; ; desde += TAMANO_PAGINA_LECTURA) {
    const { data, error } = await consulta(desde, desde + TAMANO_PAGINA_LECTURA - 1)
    if (error) return { data: null, error }
    if (!data || data.length === 0) break
    filas.push(...data)
    if (data.length < TAMANO_PAGINA_LECTURA) break
  }
  return { data: filas, error: null }
}

/** Normaliza el rol de célula; ignora valores fuera del dominio permitido. */
function normalizarRol(valor: string | null): RolTecnico | null {
  return valor === 'operador' || valor === 'patrulla' ? valor : null
}

function mapTecnico(row: TecnicoRow): Tecnico {
  return {
    id: row.id,
    nombre: row.nombre,
    documento: row.documento ?? undefined,
    telefono: row.telefono ?? undefined,
    placa: row.placa ?? undefined,
    rol: normalizarRol(row.rol),
    patrulla_id: row.patrulla_id ?? null,
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
    nombre_cliente: row.nombre_cliente ?? undefined,
    telefono_cliente: row.telefono_cliente ?? undefined,
    referencia_pago: row.referencia_pago ?? undefined,
    identificacion: row.identificacion ?? undefined,
    estado_sigma: row.estado_sigma ?? undefined,
    fecha_creacion: row.fecha_creacion,
    dias_antiguedad: row.dias_antiguedad,
    tecnico_id: row.tecnico_id,
    estado: row.estado,
  }
}

function mapReglaConTecnico(regla: ReglaRow, tecnico: TecnicoRow): ReglaConTecnico {
  return { ...mapRegla(regla), tecnico: mapTecnico(tecnico) }
}

function mapRegla(row: ReglaRow): ReglaAsignacion {
  return {
    id: row.id,
    tecnico_id: row.tecnico_id,
    ciudad: row.ciudad,
    barrio: row.barrio ?? undefined,
    tipo_servicio: row.tipo_servicio ?? undefined,
    prioridad: row.prioridad,
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

/** Datos para crear un nuevo técnico. */
export interface NuevoTecnicoInput {
  nombre: string
  telefono?: string
  documento?: string
  placa?: string
  rol?: RolTecnico | null
  patrulla_id?: string | null
}

/** Crea un técnico nuevo (activo) y devuelve el registro persistido. */
export async function crearTecnico(input: NuevoTecnicoInput): Promise<Tecnico> {
  const fila: Database['public']['Tables']['tecnicos']['Insert'] = {
    nombre: input.nombre.trim(),
    activo: true,
  }
  const telefono = input.telefono?.trim()
  const documento = input.documento?.trim()
  const placa = input.placa?.trim()
  if (telefono) fila.telefono = telefono
  if (documento) fila.documento = documento
  if (placa) fila.placa = placa
  if (input.rol) fila.rol = input.rol
  if (input.patrulla_id !== null && input.patrulla_id !== undefined) {
    fila.patrulla_id = input.patrulla_id
  }

  const { data, error } = await supabase.from('tecnicos').insert(fila).select('*').single()

  if (error) throw new Error(`Error al crear el técnico: ${error.message}`)
  if (!data) throw new Error('No se recibió confirmación al crear el técnico.')
  return mapTecnico(data)
}

/** Actualiza la ficha técnica de un técnico (solo los campos enviados). */
export async function actualizarTecnico(
  tecnicoId: string,
  cambios: Partial<Omit<NuevoTecnicoInput, 'nombre'>> & { nombre?: string },
): Promise<Tecnico> {
  const fila: Database['public']['Tables']['tecnicos']['Update'] = {}

  // Un string vacío se persiste como NULL (limpieza explícita del campo).
  const normalizarTexto = (valor: string): string | null => {
    const limpio = valor.trim()
    return limpio === '' ? null : limpio
  }

  if (cambios.nombre !== undefined) {
    const nombre = cambios.nombre.trim()
    if (nombre === '') throw new Error('El nombre del técnico no puede estar vacío.')
    fila.nombre = nombre
  }
  if (cambios.telefono !== undefined) {
    fila.telefono = normalizarTexto(cambios.telefono)
  }
  if (cambios.documento !== undefined) {
    fila.documento = normalizarTexto(cambios.documento)
  }
  if (cambios.placa !== undefined) {
    fila.placa = normalizarTexto(cambios.placa)
  }
  if (cambios.rol !== undefined) {
    fila.rol = normalizarRol(cambios.rol)
  }
  if (cambios.patrulla_id !== undefined) {
    fila.patrulla_id = cambios.patrulla_id
  }

  if (Object.keys(fila).length === 0) {
    throw new Error('No se recibieron campos para actualizar el técnico.')
  }

  const { data, error } = await supabase
    .from('tecnicos')
    .update(fila)
    .eq('id', tecnicoId)
    .select('*')
    .single()

  if (error) throw new Error(`Error al actualizar el técnico: ${error.message}`)
  if (!data) throw new Error('No se recibió confirmación al actualizar el técnico.')
  return mapTecnico(data)
}

/**
 * Desvincula en cascada los operadores que dependen de una patrulla
 * (`UPDATE tecnicos SET patrulla_id = NULL WHERE patrulla_id = $id`).
 *
 * Replica el comportamiento `ON DELETE SET NULL` de la FK: si una patrulla se
 * degrada a operador, sus operadores quedan huérfanos e independientes en vez
 * de apuntar a una ficha que ya no supervisa. Devuelve cuántos se liberaron.
 */
export async function desvincularOperadoresDePatrulla(patrullaId: string): Promise<number> {
  const { data, error } = await supabase
    .from('tecnicos')
    .update({ patrulla_id: null })
    .eq('patrulla_id', patrullaId)
    .select('id')

  if (error) {
    throw new Error(`No se pudieron desvincular los operadores de la patrulla: ${error.message}`)
  }
  return data?.length ?? 0
}

/** Devuelve las reglas de asignación con su técnico relacionado. */
export async function getReglas(): Promise<ReglaConTecnico[]> {
  const [reglasResult, tecnicosResult] = await Promise.all([
    leerTodasLasFilas<ReglaRow>((desde, hasta) =>
      supabase.from('reglas_asignacion').select('*').order('id').range(desde, hasta),
    ),
    leerTodasLasFilas<TecnicoRow>((desde, hasta) =>
      supabase.from('tecnicos').select('*').order('id').range(desde, hasta),
    ),
  ])

  if (reglasResult.error) {
    throw new Error(`Error al obtener reglas: ${reglasResult.error.message}`)
  }
  if (tecnicosResult.error) {
    throw new Error(`Error al obtener técnicos: ${tecnicosResult.error.message}`)
  }

  const tecnicosPorId = new Map(tecnicosResult.data.map((t) => [t.id, t]))

  return reglasResult.data.flatMap((regla) => {
    const tecnico = tecnicosPorId.get(regla.tecnico_id)
    if (!tecnico) return []
    return [mapReglaConTecnico(regla, tecnico)]
  })
}

/** Devuelve los servicios activos del despacho (conjunto de trabajo actual). */
export async function getServiciosActivos(): Promise<Servicio[]> {
  const { data: lote, error: loteError } = await supabase
    .from('lotes_carga')
    .select('id')
    .eq('es_linea_base', true)
    .maybeSingle()

  if (loteError) throw new Error(`Error al obtener el despacho activo: ${loteError.message}`)
  if (!lote) return []

  const { data: servicios, error: serviciosError } = await leerTodasLasFilas<ServicioRow>(
    (desde, hasta) =>
      supabase
        .from('servicios')
        .select('*')
        .eq('lote_id', lote.id)
        .order('id')
        .range(desde, hasta),
  )

  if (serviciosError) {
    throw new Error(`Error al obtener los servicios: ${serviciosError.message}`)
  }

  // Lista blanca de jurisdicción: excluye órdenes de zonas ajenas.
  return servicios.map(mapServicio).filter((s) => esSucursalAutorizada(s.ciudad))
}

/**
 * Nutre el catálogo maestro `catalogo_barrios` con los barrios observados.
 *
 * Los chips de Gestión Territorial se construían solo desde `servicios` +
 * `reglas_asignacion` (+ semilla estática); un barrio sin órdenes y sin dueño
 * desaparecía de la pantalla y quedaba inaccesible. El catálogo es acumulativo
 * y NUNCA se borra: una vez visto, el barrio siempre se puede reasignar.
 *
 * Tolerante a fallos: si la migración aún no se ejecutó, no rompe la ingesta
 * (devuelve 0 y registra el aviso). Todo se normaliza con `limpiarTexto` y
 * `limpiarBarrio` (Invariante #1) para no acumular variantes del mismo barrio.
 */
export async function sincronizarCatalogoBarrios(
  pares: Array<{ ciudad: string; barrio: string | null }>,
): Promise<number> {
  // Clave (ciudad canónica, barrio canónico) → texto legible a persistir.
  const unicos = new Map<string, { ciudad: string; barrio: string }>()

  for (const { ciudad, barrio } of pares) {
    const nombreBarrio = barrio?.trim() ?? ''
    if (!nombreBarrio) continue
    const canonica = ciudadCanonica(ciudad) || ciudad.trim()
    if (!canonica) continue
    const ck = limpiarTexto(canonica)
    const bk = limpiarBarrio(nombreBarrio)
    if (!ck || !bk) continue
    const clave = `${ck}|${bk}`
    if (!unicos.has(clave)) {
      // Se persiste el nombre legible sin el prefijo de nodo comercial.
      unicos.set(clave, { ciudad: canonica, barrio: limpiarPrefijoNodo(nombreBarrio) })
    }
  }

  const filas = [...unicos.values()]
  if (filas.length === 0) return 0

  let insertadas = 0
  for (const chunk of chunkArray(filas, TAMANO_LOTE_INSERCION)) {
    const { error } = await supabase
      .from('catalogo_barrios')
      .upsert(chunk, { onConflict: 'ciudad,barrio', ignoreDuplicates: true })

    if (error) {
      // La tabla puede no existir todavía (migración pendiente): no se bloquea
      // la ingesta, el catálogo simplemente no crece hasta aplicarla.
      console.warn('[sincronizarCatalogoBarrios] No se pudo nutrir el catálogo:', error.message)
      return insertadas
    }
    insertadas += chunk.length
  }

  return insertadas
}

/**
 * Devuelve el catálogo maestro de barrios agrupado por nombre canónico de
 * ciudad. Si la tabla aún no existe (migración pendiente) devuelve un mapa
 * vacío para no romper la UI.
 */
export async function getCatalogoBarrios(): Promise<Map<string, Map<string, string>>> {
  const resultado = await leerTodasLasFilas<{ ciudad: string; barrio: string }>((desde, hasta) =>
    supabase.from('catalogo_barrios').select('ciudad, barrio').order('ciudad').range(desde, hasta),
  )

  const mapa = new Map<string, Map<string, string>>()
  if (resultado.error) {
    console.warn('[getCatalogoBarrios] Catálogo no disponible:', resultado.error.message)
    return mapa
  }

  for (const fila of resultado.data) {
    const canonica = ciudadCanonica(fila.ciudad) || fila.ciudad.trim()
    const ck = limpiarTexto(canonica)
    const bk = limpiarBarrio(fila.barrio)
    if (!ck || !bk) continue
    const inner = mapa.get(ck) ?? new Map<string, string>()
    if (!inner.has(bk)) inner.set(bk, limpiarPrefijoNodo(fila.barrio))
    mapa.set(ck, inner)
  }

  return mapa
}

/**
 * Reemplaza el despacho activo: borra los lotes anteriores (cascade elimina sus
 * servicios) y guarda el nuevo conjunto como el despacho actual.
 */
export async function reemplazarServiciosActivos(
  nombre: string,
  servicios: ServicioNuevo[],
): Promise<void> {
  // 1. Borrar todos los lotes anteriores (cascade elimina sus servicios).
  const { error: delError } = await supabase
    .from('lotes_carga')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (delError) throw new Error(`Error al limpiar el despacho anterior: ${delError.message}`)

  // 2. Crear el nuevo lote activo.
  const { data: lote, error: loteError } = await supabase
    .from('lotes_carga')
    .insert({
      nombre,
      fecha_corte: new Date().toISOString(),
      es_linea_base: true,
      total_servicios: servicios.length,
    })
    .select('id')
    .single()

  if (loteError) throw new Error(`Error al crear el despacho: ${loteError.message}`)

  // 3. Insertar servicios en chunks.
  for (const chunk of chunkArray(servicios, TAMANO_LOTE_INSERCION)) {
    // Se construyen explícitamente solo las columnas de la tabla: `tecnico_sigma`
    // y `fecha_cierre` son informativos del reporte y NO existen en `servicios`.
    const filas: Database['public']['Tables']['servicios']['Insert'][] = chunk.map(
      (servicio) => ({
        lote_id: lote.id,
        numero_orden: servicio.numero_orden,
        ciudad: servicio.ciudad,
        barrio: servicio.barrio,
        direccion: servicio.direccion ?? null,
        tipo_servicio: servicio.tipo_servicio,
        nombre_cliente: servicio.nombre_cliente ?? null,
        telefono_cliente: servicio.telefono_cliente ?? null,
        referencia_pago: servicio.referencia_pago ?? null,
        identificacion: servicio.identificacion ?? null,
        estado_sigma: servicio.estado_sigma ?? null,
        fecha_creacion: servicio.fecha_creacion,
        dias_antiguedad: servicio.dias_antiguedad,
        tecnico_id: servicio.tecnico_id,
        estado: servicio.estado,
      }),
    )
    const { error } = await supabase.from('servicios').insert(filas)
    if (error) throw new Error(`Error al insertar servicios: ${error.message}`)
  }

  // 4. Nutrir el catálogo maestro con los barrios de este corte. Es acumulativo:
  //    un barrio visto hoy sigue visible aunque mañana quede sin órdenes.
  await sincronizarCatalogoBarrios(
    servicios.map((s) => ({ ciudad: s.ciudad, barrio: s.barrio })),
  )
}

// ---- Importación masiva de la matriz de asignación ----

const TECNICOS_INVALIDOS = new Set(['', 'n/a', 'na', '-'])

function esTecnicoValido(nombre: string): boolean {
  const normalizado = nombre.trim().toLowerCase()
  if (TECNICOS_INVALIDOS.has(normalizado)) return false
  // Excluye placeholders como "Tecnico por asignar", "sin asignar", "pendiente".
  if (normalizado.includes('asignar') || normalizado.includes('pendiente')) return false
  return true
}

/**
 * Garantiza que existan técnicos con los nombres dados (inserta los que falten).
 * Devuelve cuántos se crearon y un mapa nombre → id.
 *
 * Los técnicos importados desde la matriz se insertan solo con `nombre` y
 * `activo`; las columnas `rol`, `placa` y `patrulla_id` quedan en NULL y se
 * clasifican después desde Gestión Territorial.
 */
async function asegurarTecnicos(
  nombres: string[],
): Promise<{ creados: number; porNombre: Map<string, string> }> {
  const porNombre = new Map<string, string>()

  const { data: existentes, error } = await supabase.from('tecnicos').select('id, nombre')
  if (error) throw new Error(`Error al consultar técnicos: ${error.message}`)

  for (const tecnico of existentes ?? []) {
    porNombre.set(tecnico.nombre, tecnico.id)
  }

  const faltantes = nombres.filter((nombre) => !porNombre.has(nombre))

  if (faltantes.length > 0) {
    const { data: insertados, error: insertError } = await supabase
      .from('tecnicos')
      .insert(faltantes.map((nombre) => ({ nombre, activo: true })))
      .select('id, nombre')

    if (insertError) throw new Error(`Error al insertar técnicos: ${insertError.message}`)

    for (const tecnico of insertados ?? []) {
      porNombre.set(tecnico.nombre, tecnico.id)
    }
  }

  return { creados: faltantes.length, porNombre }
}

/**
 * Importa masivamente la matriz de asignación desde filas ya parseadas.
 * Crea los técnicos que falten y las reglas correspondientes (en lotes de 500).
 */
export async function importarMatrizDesdeExcel(
  filas: FilaMatrizImport[],
): Promise<{ tecnicosCreados: number; reglasCreadas: number }> {
  // 1. Técnicos únicos válidos
  const nombresTecnicos = new Set<string>()
  for (const fila of filas) {
    const nombre = (fila.tecnico ?? '').trim()
    if (esTecnicoValido(nombre)) nombresTecnicos.add(nombre)
  }

  // 2. Asegurar técnicos existentes (inserta los faltantes)
  const { creados: tecnicosCreados, porNombre } = await asegurarTecnicos([...nombresTecnicos])

  // 3. Construir reglas
  const reglas: NuevaRegla[] = []
  for (const fila of filas) {
    const nombreTecnico = (fila.tecnico ?? '').trim()
    if (!esTecnicoValido(nombreTecnico)) continue

    // Regla geográfica: sin sucursal/ciudad se descarta la fila (no hay reglas huérfanas).
    const ciudad = (fila.sucursal ?? '').trim()
    if (!ciudad) continue

    const tecnicoId = porNombre.get(nombreTecnico)
    if (!tecnicoId) continue // no debería ocurrir tras asegurar

    // Barrio se guarda con su texto original (la normalización ocurre al cruzar).
    const barrio = (fila.barrio ?? '').trim() || undefined
    const tipoServicio = (fila.tipo_servicio ?? '').trim() || undefined
    const prioridad = calcularPrioridad(ciudad, barrio, tipoServicio)

    reglas.push({
      tecnico_id: tecnicoId,
      ciudad,
      barrio,
      tipo_servicio: tipoServicio,
      prioridad,
    })
  }

  // 4. Insertar reglas en lotes de 500 (ignora las que ya existen: idempotente).
  let reglasInsertadas = 0
  for (const chunk of chunkArray(reglas, TAMANO_LOTE_INSERCION)) {
    const { data, error } = await supabase
      .from('reglas_asignacion')
      .upsert(chunk, { ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(`Error al insertar reglas: ${error.message}`)
    reglasInsertadas += data?.length ?? 0
  }

  return { tecnicosCreados, reglasCreadas: reglasInsertadas }
}

/**
 * Re-aplica la matriz de asignación a los servicios activos del despacho y
 * actualiza Supabase. Asigna las órdenes que ahora tienen técnico y libera
 * (deja en null) las que perdieron su regla. Devuelve el desglose.
 */
export async function reasignarServiciosActivos(): Promise<{
  asignadas: number
  desasignadas: number
}> {
  // 1. Lote activo.
  const { data: lote, error: loteError } = await supabase
    .from('lotes_carga')
    .select('id')
    .eq('es_linea_base', true)
    .maybeSingle()

  if (loteError) throw new Error(`Error al obtener el despacho activo: ${loteError.message}`)
  if (!lote) return { asignadas: 0, desasignadas: 0 }

  // 2. Servicios crudos del lote activo (paginado).
  const { data: serviciosData, error: serviciosError } = await leerTodasLasFilas<ServicioRow>(
    (desde, hasta) =>
      supabase
        .from('servicios')
        .select('*')
        .eq('lote_id', lote.id)
        .order('id')
        .range(desde, hasta),
  )

  if (serviciosError) {
    throw new Error(`Error al obtener los servicios: ${serviciosError.message}`)
  }
  const servicios = serviciosData

  // 3. Reglas activas de la matriz (paginado).
  const { data: reglasData, error: reglasError } = await leerTodasLasFilas<ReglaRow>(
    (desde, hasta) =>
      supabase.from('reglas_asignacion').select('*').order('id').range(desde, hasta),
  )

  if (reglasError) throw new Error(`Error al obtener las reglas: ${reglasError.message}`)

  // 4. Cruce en memoria (el motor preserva el orden entrada → salida).
  const asignados = aplicarMatrizAsignacion(
    servicios.map(mapServicio),
    reglasData.map(mapRegla),
  )

  // 5. Recolectar las filas cuyo técnico cambió (asignación o liberación).
  const filasActualizar: ServicioRow[] = []
  let asignadas = 0
  let desasignadas = 0
  for (let i = 0; i < asignados.length; i++) {
    const tecnicoId = asignados[i].tecnico_id
    if (servicios[i].tecnico_id !== tecnicoId) {
      filasActualizar.push({ ...servicios[i], tecnico_id: tecnicoId })
      if (tecnicoId) asignadas++
      else desasignadas++
    }
  }

  // 6. Persistir en chunks de 200 (upsert sobre la PK `id`).
  for (const chunk of chunkArray(filasActualizar, TAMANO_LOTE_ACTUALIZACION)) {
    const { error } = await supabase.from('servicios').upsert(chunk, { onConflict: 'id' })
    if (error) throw new Error(`Error al reasignar servicios: ${error.message}`)
  }

  return { asignadas, desasignadas }
}

/** Devuelve las ciudades activas por técnico: `{ [tecnicoId]: string[] }`. */
export async function getCiudadesActivas(): Promise<Record<string, string[]>> {
  const { data, error } = await leerTodasLasFilas<{ tecnico_id: string; ciudad: string }>(
    (desde, hasta) =>
      supabase
        .from('tecnicos_ciudades')
        .select('tecnico_id, ciudad')
        .order('id')
        .range(desde, hasta),
  )

  // Si la tabla aún no existe (migración pendiente), no romper la carga inicial.
  if (error) {
    console.warn('[MillaOps Hub] No se pudo leer tecnicos_ciudades:', error.message)
    return {}
  }

  const mapa: Record<string, string[]> = {}
  for (const fila of data) {
    // Unifica variantes por mayúsculas/tildes a la forma canónica de la lista blanca.
    const canonica = ciudadCanonica(fila.ciudad)
    if (!canonica) continue
    const lista = (mapa[fila.tecnico_id] ??= [])
    if (!lista.includes(canonica)) lista.push(canonica)
  }
  return mapa
}

/** Reemplaza la lista de ciudades activas de un técnico. */
export async function guardarCiudadesActivasTecnico(
  tecnicoId: string,
  ciudades: string[],
): Promise<void> {
  const { error: delError } = await supabase
    .from('tecnicos_ciudades')
    .delete()
    .eq('tecnico_id', tecnicoId)

  if (delError) throw new Error(`Error al limpiar ciudades activas: ${delError.message}`)

  if (ciudades.length === 0) return

  const { error: insError } = await supabase.from('tecnicos_ciudades').insert(
    ciudades.map((ciudad) => ({ tecnico_id: tecnicoId, ciudad })),
  )
  if (insError) throw new Error(`Error al guardar ciudades activas: ${insError.message}`)
}

/**
 * Configura la cuadrilla de un técnico para una ciudad determinada con un
 * **reemplazo atómico limpio**: borra todas las reglas previas del técnico en
 * esa ciudad y vuelve a insertar el payload (sin duplicados internos).
 *
 * - Cuadrilla general (Carro): crea una regla `prioridad = 2`,
 *   `tipo_servicio = null` por cada barrio seleccionado y **traspasa** la
 *   cobertura general (quita la P2 de cualquier otro técnico en esos barrios).
 * - Cuadrilla flotante (Moto): crea una regla `prioridad = 1`,
 *   `tipo_servicio = nombreServicio` por cada combinación (barrio × servicio).
 *   **No toca** reglas de otros técnicos (la moto y el carro coexisten).
 *
 * Al final re-aplica la matriz al despacho activo y devuelve la cantidad de
 * reglas insertadas.
 */
export async function asignarCuadrilla(
  tecnicoId: string,
  ciudad: string,
  config: ConfigCuadrilla,
): Promise<number> {
  // Se persiste la forma canónica ("Toro Valle" y no "Toro"): la base guarda
  // texto crudo y el índice único compara cadenas, así que unificar aquí es lo
  // que evita filas duplicadas para la misma sucursal.
  const ciudadNombre = ciudadCanonica(ciudad).trim() || ciudad.trim()
  // Deduplicación estricta en memoria antes de tocar la base de datos.
  const barriosUnicos = Array.from(
    new Set(config.barrios.map((b) => b.trim()).filter((b) => b !== '')),
  )
  const serviciosUnicos = Array.from(
    new Set(config.servicios.map((s) => s.trim()).filter((s) => s !== '')),
  )

  // 1. Borrar TODAS las reglas previas de este técnico cuya ciudad resuelva a la
  //    misma sucursal canónica. `ilike('ciudad', ...)` solo cubría el texto
  //    literal, dejando vivas variantes como "Toro" cuando se guardaba
  //    "Toro Valle" (misma sucursal, otro string).
  const ciudadKey = limpiarTexto(ciudadNombre)
  const { data: reglasPropias, error: readPropiasError } = await supabase
    .from('reglas_asignacion')
    .select('id, ciudad')
    .eq('tecnico_id', tecnicoId)

  if (readPropiasError) {
    throw new Error(`Error al leer reglas propias: ${readPropiasError.message}`)
  }

  const idsPropias = (reglasPropias ?? [])
    .filter((r) => limpiarTexto(ciudadCanonica(r.ciudad) || r.ciudad) === ciudadKey)
    .map((r) => r.id)

  if (idsPropias.length > 0) {
    const { error: deleteError } = await supabase
      .from('reglas_asignacion')
      .delete()
      .in('id', idsPropias)

    if (deleteError) {
      console.error('[asignarCuadrilla] Error borrando reglas previas:', deleteError)
      throw new Error(`No se pudieron limpiar las reglas anteriores: ${deleteError.message}`)
    }
  }

  // 2. Traspaso (solo cuadrilla general): quitar la regla general (P2) de otros
  //    técnicos en los barrios seleccionados (1 barrio = 1 carro).
  if (config.modalidad === 'general' && barriosUnicos.length > 0) {
    // Se leen TODAS las filas paginando: PostgREST trunca en 1.000 y la matriz
    // ya supera ese tamaño, por lo que las reglas del dueño actual podían no
    // llegar a la vista y el traspaso se saltaba en silencio.
    const reglasExistentes = await leerTodasLasFilas<{
      id: string
      tecnico_id: string
      ciudad: string
      barrio: string | null
      tipo_servicio: string | null
    }>((desde, hasta) =>
      supabase
        .from('reglas_asignacion')
        .select('id, tecnico_id, ciudad, barrio, tipo_servicio')
        .order('id')
        .range(desde, hasta),
    )

    if (reglasExistentes.error) {
      throw new Error(`Error al leer reglas ajenas: ${reglasExistentes.error.message}`)
    }

    const barriosLimpios = new Set(barriosUnicos.map(limpiarBarrio))
    const idsAjenos = reglasExistentes.data
      .filter(
        (r) =>
          r.tecnico_id !== tecnicoId &&
          !r.tipo_servicio &&
          limpiarTexto(ciudadCanonica(r.ciudad) || r.ciudad) === ciudadKey &&
          barriosLimpios.has(limpiarBarrio(r.barrio)),
      )
      .map((r) => r.id)

    if (idsAjenos.length > 0) {
      const { error: delAjenoError } = await supabase
        .from('reglas_asignacion')
        .delete()
        .in('id', idsAjenos)
      if (delAjenoError) throw new Error(`Error al traspasar barrios: ${delAjenoError.message}`)
    }
  }

  // 3. Construir el payload sin duplicados internos (claves de control).
  const registros: Array<{
    tecnico_id: string
    ciudad: string
    barrio: string
    tipo_servicio: string | null
    prioridad: number
  }> = []
  const clavesVistas = new Set<string>()

  if (config.modalidad === 'flotante') {
    for (const barrio of barriosUnicos) {
      for (const servicio of serviciosUnicos) {
        const keyCheck = `${barrio.trim().toLowerCase()}|${servicio.trim().toLowerCase()}`
        if (clavesVistas.has(keyCheck)) continue
        clavesVistas.add(keyCheck)
        registros.push({
          tecnico_id: tecnicoId,
          ciudad: ciudadNombre,
          barrio: barrio.trim(),
          tipo_servicio: servicio.trim(),
          prioridad: 1,
        })
      }
    }
  } else {
    for (const barrio of barriosUnicos) {
      const keyCheck = `${barrio.trim().toLowerCase()}|`
      if (clavesVistas.has(keyCheck)) continue
      clavesVistas.add(keyCheck)
      registros.push({
        tecnico_id: tecnicoId,
        ciudad: ciudadNombre,
        barrio: barrio.trim(),
        tipo_servicio: null,
        prioridad: 2,
      })
    }
  }

  // 4. Inserción secuencial en chunks de 200 (las filas previas ya se borraron
  //    y el array no tiene duplicados internos, así que .insert() no colisiona).
  for (const chunk of chunkArray(registros, 200)) {
    const { error: insertError } = await supabase.from('reglas_asignacion').insert(chunk)
    if (insertError) {
      console.error('[asignarCuadrilla] Error insertando chunk:', insertError, chunk[0])
      throw new Error(`Error insertando reglas: ${insertError.message}`)
    }
  }

  // 5. Nutrir el catálogo maestro con los barrios recién configurados: quien los
  //    asigne hoy debe poder recuperarlos mañana aunque se desasignen.
  await sincronizarCatalogoBarrios(
    registros.map((r) => ({ ciudad: r.ciudad, barrio: r.barrio })),
  )

  // 6. Re-aplicar la matriz al despacho activo y devolver el total insertado.
  await reasignarServiciosActivos()
  return registros.length
}

/**
 * Libera las reglas territoriales que aún cuelgan de fichas convertidas en
 * **patrulla**. Por arquitectura la patrulla no tiene barrios propios: su
 * territorio es la unión de los barrios de sus operadores, así que cualquier
 * fila en `reglas_asignacion` a su nombre **bloquea** el índice P2
 * (`idx_regla_especialidad_unica`, 1 barrio = 1 carro) e impide que sus propios
 * operadores tomen esos barrios.
 *
 * Con `confirmar = false` solo calcula el impacto; con `true` ejecuta el borrado.
 * Devuelve el número de reglas que quedan (o quedarían) liberadas.
 */
export async function liberarReglasDePatrullas(confirmar: boolean): Promise<number> {
  const [tecnicosResult, reglasResult] = await Promise.all([
    leerTodasLasFilas<TecnicoRow>((desde, hasta) =>
      supabase.from('tecnicos').select('*').order('id').range(desde, hasta),
    ),
    leerTodasLasFilas<ReglaRow>((desde, hasta) =>
      supabase.from('reglas_asignacion').select('*').order('id').range(desde, hasta),
    ),
  ])

  if (tecnicosResult.error) {
    throw new Error(`Error al leer técnicos: ${tecnicosResult.error.message}`)
  }
  if (reglasResult.error) {
    throw new Error(`Error al leer reglas: ${reglasResult.error.message}`)
  }

  const patrullaIds = new Set(
    tecnicosResult.data.filter((t) => t.rol === 'patrulla').map((t) => t.id),
  )
  const idsADescongestionar = reglasResult.data
    .filter((r) => patrullaIds.has(r.tecnico_id))
    .map((r) => r.id)

  if (!confirmar || idsADescongestionar.length === 0) return idsADescongestionar.length

  for (const chunk of chunkArray(idsADescongestionar, TAMANO_LOTE_ACTUALIZACION)) {
    const { error } = await supabase.from('reglas_asignacion').delete().in('id', chunk)
    if (error) throw new Error(`Error al liberar reglas de patrullas: ${error.message}`)
  }

  return idsADescongestionar.length
}

/**
 * Persiste el resultado de una auditoría de cierres en la nube (histórico
 * multiusuario). `datos_resultado` es el objeto completo `ResultadoCierres`,
 * que Supabase serializa a JSONB.
 */
export async function guardarAuditoriaCierres(payload: AuditoriaCierresInsert): Promise<void> {
  const { error } = await supabase.from('auditorias_cierres').insert(payload)
  if (error) throw new Error(`No se pudo guardar la auditoría: ${error.message}`)
}

/**
 * Devuelve la última auditoría guardada (ordenada por `created_at`), o `null`
 * si no hay registros o la tabla aún no existe (migración pendiente).
 */
export async function getUltimaAuditoriaCierres(): Promise<AuditoriaCierresRow | null> {
  const { data, error } = await supabase
    .from('auditorias_cierres')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('[MillaOps Hub] No se pudo leer auditorias_cierres:', error.message)
    return null
  }
  return data
}

// ---- Categorización dinámica de servicios (Intake) ----

/**
 * Devuelve todas las categorías con sus tipos de servicio resueltos en memoria.
 * El esquema no declara FK embebida usable por PostgREST, así que se leen ambas
 * tablas paginadas y se agrupan por `categoria_id`.
 */
export async function obtenerCategoriasServicios(): Promise<CategoriaConServicios[]> {
  const [categoriasResult, mapeosResult] = await Promise.all([
    leerTodasLasFilas<CategoriaRow>((desde, hasta) =>
      supabase.from('categorias_servicios').select('*').order('nombre').range(desde, hasta),
    ),
    leerTodasLasFilas<MapeoServicioRow>((desde, hasta) =>
      supabase.from('mapeo_servicios').select('*').order('tipo_solicitud').range(desde, hasta),
    ),
  ])

  if (categoriasResult.error) {
    throw new Error(`Error al obtener categorías: ${categoriasResult.error.message}`)
  }
  if (mapeosResult.error) {
    throw new Error(`Error al obtener el mapeo de servicios: ${mapeosResult.error.message}`)
  }

  const tiposPorCategoria = new Map<string, MapeoServicio[]>()
  for (const mapeo of mapeosResult.data) {
    const lista = tiposPorCategoria.get(mapeo.categoria_id) ?? []
    lista.push({
      tipo_solicitud: mapeo.tipo_solicitud,
      categoria_id: mapeo.categoria_id,
      updated_at: mapeo.updated_at,
    })
    tiposPorCategoria.set(mapeo.categoria_id, lista)
  }

  return categoriasResult.data.map((categoria) => ({
    id: categoria.id,
    nombre: categoria.nombre,
    modulo_destino: categoria.modulo_destino,
    color: categoria.color,
    activo_despacho: categoria.activo_despacho,
    created_at: categoria.created_at,
    tipos_servicio: tiposPorCategoria.get(categoria.id) ?? [],
  }))
}

/**
 * Mapa normalizado `limpiarTexto(tipo_solicitud)` → `categoria_id`.
 * Se usa para resolver el destino de una orden sin comparar cadenas crudas.
 */
export async function obtenerMapaCategorias(): Promise<Map<string, string>> {
  const { data, error } = await leerTodasLasFilas<MapeoServicioRow>((desde, hasta) =>
    supabase.from('mapeo_servicios').select('*').order('tipo_solicitud').range(desde, hasta),
  )

  if (error) throw new Error(`Error al obtener el mapeo de servicios: ${error.message}`)

  const mapa = new Map<string, string>()
  for (const fila of data) {
    mapa.set(limpiarTexto(fila.tipo_solicitud), fila.categoria_id)
  }
  return mapa
}

/** Reasigna (o crea) el mapeo de un tipo de solicitud hacia otra categoría. */
export async function actualizarCategoriaServicio(
  tipoSolicitud: string,
  nuevaCategoriaId: string,
): Promise<void> {
  const tipo = tipoSolicitud.trim()
  const categoriaId = nuevaCategoriaId.trim()
  if (!tipo) throw new Error('El tipo de solicitud no puede estar vacío.')
  if (!categoriaId) throw new Error('La categoría destino no es válida.')

  const { error } = await supabase.from('mapeo_servicios').upsert(
    {
      tipo_solicitud: tipo,
      categoria_id: categoriaId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tipo_solicitud' },
  )

  if (error) {
    throw new Error(`No se pudo reasignar "${tipo}": ${error.message}`)
  }
}

/** Crea una categoría nueva (activa en despacho por defecto). */
export async function crearCategoria(
  nombre: string,
  moduloDestino: string,
  color: string,
): Promise<CategoriaServicio> {
  const nombreLimpio = nombre.trim()
  if (!nombreLimpio) throw new Error('El nombre de la categoría no puede estar vacío.')

  const fila: CategoriaInsert = {
    nombre: nombreLimpio,
    modulo_destino: moduloDestino.trim() || 'centro_mando',
  }
  const colorLimpio = color.trim()
  if (colorLimpio) fila.color = colorLimpio

  const { data, error } = await supabase
    .from('categorias_servicios')
    .insert(fila)
    .select('*')
    .single()

  if (error) throw new Error(`No se pudo crear la categoría: ${error.message}`)
  if (!data) throw new Error('No se recibió confirmación al crear la categoría.')

  return {
    id: data.id,
    nombre: data.nombre,
    modulo_destino: data.modulo_destino,
    color: data.color,
    activo_despacho: data.activo_despacho,
    created_at: data.created_at,
  }
}

/**
 * Set de claves normalizadas (`limpiarTexto(tipo_solicitud)`) cuyo mapeo apunta
 * a una categoría con `activo_despacho !== true`. El intake las omite; los tipos
 * sin mapeo NO aparecen aquí (fail-open: entran al despacho).
 */
export async function obtenerTiposNoDespachables(): Promise<Set<string>> {
  const categorias = await obtenerCategoriasServicios()

  const excluidas = new Set(
    categorias.filter((categoria) => categoria.activo_despacho !== true).map((c) => c.id),
  )

  const claves = new Set<string>()
  for (const categoria of categorias) {
    if (!excluidas.has(categoria.id)) continue
    for (const mapeo of categoria.tipos_servicio) {
      const clave = limpiarTexto(mapeo.tipo_solicitud)
      if (clave) claves.add(clave)
    }
  }
  return claves
}

// ---- Control de Instalaciones y Puertos ----

const TIPOS_NOVEDAD: readonly TipoNovedadInstalacion[] = [
  'pendiente_puerto',
  'ampliacion_nap',
  'sin_cobertura',
  'cliente_no_contacta',
  'otra',
]

const ESTADOS_GESTION: readonly EstadoGestionNovedad[] = ['pendiente', 'en_gestion', 'resuelto']

/** Tolera valores fuera de dominio (fila editada a mano): cae a `otra`. */
function normalizarTipoNovedad(valor: string | null): TipoNovedadInstalacion {
  return TIPOS_NOVEDAD.includes(valor as TipoNovedadInstalacion)
    ? (valor as TipoNovedadInstalacion)
    : 'otra'
}

/** Tolera valores fuera de dominio: cae a `pendiente` (estado inicial). */
function normalizarEstadoGestion(valor: string | null): EstadoGestionNovedad {
  return ESTADOS_GESTION.includes(valor as EstadoGestionNovedad)
    ? (valor as EstadoGestionNovedad)
    : 'pendiente'
}

function mapNovedadInstalacion(row: NovedadInstalacionRow): NovedadInstalacion {
  return {
    orden_id: row.orden_id,
    tipo_novedad: normalizarTipoNovedad(row.tipo_novedad),
    caja_nap: row.caja_nap ?? undefined,
    comentario: row.comentario ?? undefined,
    estado_gestion: normalizarEstadoGestion(row.estado_gestion),
    usuario: row.usuario ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Carga TODAS las novedades de instalación indexadas por número de orden.
 *
 * Tolerante a fallos: si la migración aún no se ejecutó (tabla inexistente),
 * devuelve un mapa vacío y registra el aviso, en lugar de romper el módulo.
 */
export async function obtenerNovedadesInstalaciones(): Promise<Map<string, NovedadInstalacion>> {
  const resultado = await leerTodasLasFilas<NovedadInstalacionRow>((desde, hasta) =>
    supabase.from('novedades_instalaciones').select('*').order('orden_id').range(desde, hasta),
  )

  const mapa = new Map<string, NovedadInstalacion>()
  if (resultado.error) {
    console.warn('[obtenerNovedadesInstalaciones] Novedades no disponibles:', resultado.error.message)
    return mapa
  }

  for (const fila of resultado.data) {
    mapa.set(fila.orden_id, mapNovedadInstalacion(fila))
  }
  return mapa
}

/**
 * Crea o reemplaza la novedad de una orden (upsert por `orden_id`).
 *
 * Una orden tiene una sola novedad vigente: guardar de nuevo sobrescribe tipo,
 * caja, comentario y estado. `created_at` se preserva del registro original
 * (solo lo fija la base de datos al insertar; en actualizaciones no se envía).
 */
export async function guardarNovedadInstalacion(
  novedad: EntradaNovedadInstalacion,
): Promise<NovedadInstalacion> {
  const ordenId = novedad.orden_id.trim()
  if (!ordenId) throw new Error('La orden no puede estar vacía al registrar la novedad.')

  const cajaNap = novedad.caja_nap?.trim() ?? ''
  const comentario = novedad.comentario?.trim() ?? ''
  const usuario = novedad.usuario?.trim() ?? ''

  const fila: NovedadInstalacionInsert = {
    orden_id: ordenId,
    tipo_novedad: novedad.tipo_novedad,
    caja_nap: cajaNap || null,
    comentario: comentario || null,
    estado_gestion: novedad.estado_gestion,
    usuario: usuario || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('novedades_instalaciones')
    .upsert(fila, { onConflict: 'orden_id', ignoreDuplicates: false })
    .select('*')
    .single()

  if (error) throw new Error(`No se pudo guardar la novedad de la orden ${ordenId}: ${error.message}`)
  if (!data) throw new Error('No se recibió confirmación al guardar la novedad.')

  return mapNovedadInstalacion(data)
}

/** Elimina la novedad de una orden (cuando el bloqueo quedó superado). */
export async function eliminarNovedadInstalacion(ordenId: string): Promise<void> {
  const clave = ordenId.trim()
  if (!clave) throw new Error('La orden no puede estar vacía al eliminar la novedad.')

  const { error } = await supabase.from('novedades_instalaciones').delete().eq('orden_id', clave)
  if (error) throw new Error(`No se pudo eliminar la novedad de la orden ${clave}: ${error.message}`)
}

/** Nombre canónico de la categoría que se enruta al Control de Instalaciones. */
export const CATEGORIA_INSTALACIONES = 'Instalaciones y Traslados'

/** Nombre canónico de la categoría de la que se auditan los cierres. */
export const CATEGORIA_SERVICIOS_TECNICOS = 'Servicios Técnicos'

/**
 * Claves normalizadas de la categoría "Servicios Técnicos".
 *
 * Devuelve un set vacío si la categoría no existe (migración pendiente): el
 * parser lo interpreta como "sin filtro" y trabaja sobre TODOS los cierres,
 * lo que evita perder ejecuciones por un problema de clasificación.
 */
export async function obtenerTiposCierresTecnicos(): Promise<Set<string>> {
  const categorias = await obtenerCategoriasServicios()
  const objetivo = limpiarTexto(CATEGORIA_SERVICIOS_TECNICOS)
  const categoria = categorias.find((c) => limpiarTexto(c.nombre) === objetivo)

  const claves = new Set<string>()
  if (!categoria) return claves
  for (const mapeo of categoria.tipos_servicio) {
    const clave = limpiarTexto(mapeo.tipo_solicitud)
    if (clave) claves.add(clave)
  }
  return claves
}

/**
 * Tipos de servicio (`limpiarTexto(tipo_solicitud)`) que pertenecen a la
 * categoría "Instalaciones y Traslados". El intake los desvía al módulo de
 * instalaciones en lugar de persistirlos en `servicios` (protege la cuota).
 *
 * Si la categoría no existe (migración de categorización pendiente) devuelve un
 * set vacío: el intake sigue funcionando y esas órdenes se omiten como antes.
 */
export async function obtenerTiposInstalaciones(): Promise<Set<string>> {
  const categorias = await obtenerCategoriasServicios()
  const objetivo = limpiarTexto(CATEGORIA_INSTALACIONES)
  const categoria = categorias.find((c) => limpiarTexto(c.nombre) === objetivo)

  const claves = new Set<string>()
  if (!categoria) return claves
  for (const mapeo of categoria.tipos_servicio) {
    const clave = limpiarTexto(mapeo.tipo_solicitud)
    if (clave) claves.add(clave)
  }
  return claves
}

// ---- Persistencia cíclica de instalaciones ----

// Las instalaciones rondan las ~355 filas: lotes más pequeños que el despacho
// mantienen el payload de cada inserción bien por debajo del límite de Supabase.
const TAMANO_LOTE_INSTALACIONES = 100

function mapInstalacion(row: InstalacionRow): ServicioNuevo {
  return {
    numero_orden: row.orden_id,
    ciudad: row.ciudad,
    barrio: row.barrio ?? '',
    direccion: row.direccion ?? undefined,
    tipo_servicio: row.tipo_servicio ?? '',
    nombre_cliente: row.cliente_nombre ?? undefined,
    telefono_cliente: row.telefono ?? undefined,
    dias_antiguedad: row.dias_abierta ?? 0,
    // La tabla no guarda fecha de creación ni estado Sigma: el tablero de
    // instalaciones solo usa estos campos, y ninguno afecta a la asignación.
    fecha_creacion: row.created_at,
    tecnico_id: null,
    estado: 'ABIERTO',
  }
}

/**
 * Carga las órdenes de instalación persistidas (para sobrevivir un F5).
 *
 * Tolerante a fallos: si la migración aún no se ejecutó devuelve `[]` y avisa
 * por consola, igual que el resto de tablas opcionales del Hub.
 */
export async function obtenerInstalacionesActivas(): Promise<ServicioNuevo[]> {
  const resultado = await leerTodasLasFilas<InstalacionRow>((desde, hasta) =>
    supabase.from('servicios_instalaciones').select('*').order('orden_id').range(desde, hasta),
  )

  if (resultado.error) {
    console.warn(
      '[obtenerInstalacionesActivas] Instalaciones no disponibles:',
      resultado.error.message,
    )
    return []
  }

  return resultado.data.map(mapInstalacion)
}

/**
 * Reemplazo cíclico del conjunto de instalaciones (mismo patrón que
 * `reemplazarServiciosActivos`): borra todo lo anterior e inserta el reporte
 * nuevo en lotes.
 *
 * Es destructivo por diseño: el tablero siempre refleja el ÚLTIMO reporte
 * cargado, sin historial.
 */
export async function reemplazarInstalacionesActivas(
  instalaciones: ServicioNuevo[],
): Promise<number> {
  // 1. Borrar el conjunto anterior. `.neq` sobre la PK cubre "todas las filas"
  //    porque PostgREST rechaza un DELETE sin filtro.
  const { error: delError } = await supabase
    .from('servicios_instalaciones')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (delError) {
    throw new Error(`Error al limpiar las instalaciones anteriores: ${delError.message}`)
  }

  if (instalaciones.length === 0) return 0

  // Se construyen explícitamente solo las columnas de la tabla: `fecha_cierre`
  // y `tecnico_sigma` son informativos del reporte y no se persisten aquí.
  const filas: InstalacionInsert[] = instalaciones.map((servicio) => ({
    orden_id: servicio.numero_orden,
    ciudad: servicio.ciudad,
    barrio: servicio.barrio || null,
    direccion: servicio.direccion ?? null,
    cliente_nombre: servicio.nombre_cliente ?? null,
    telefono: servicio.telefono_cliente ?? null,
    tipo_servicio: servicio.tipo_servicio || null,
    dias_abierta: servicio.dias_antiguedad,
  }))

  let insertadas = 0
  for (const chunk of chunkArray(filas, TAMANO_LOTE_INSTALACIONES)) {
    const { error } = await supabase.from('servicios_instalaciones').insert(chunk)
    if (error) throw new Error(`Error al insertar instalaciones: ${error.message}`)
    insertadas += chunk.length
  }

  return insertadas
}

// ---- Cierres técnicos (ventana deslizante de 7 días) ----

const TAMANO_LOTE_CIERRES = 100

function mapCierre(row: CierreRow): CierreTecnico {
  return {
    numero_orden: row.orden_id,
    ciudad: row.ciudad,
    barrio: row.barrio ?? '',
    direccion: row.direccion ?? undefined,
    tipo_servicio: row.tipo_servicio ?? '',
    nombre_cliente: row.cliente_nombre ?? undefined,
    telefono_cliente: row.telefono ?? undefined,
    dias_antiguedad: row.dias_abierta ?? 0,
    // La tabla no guarda la fecha de apertura: se usa la de cierre, que es el
    // eje de tiempo de este módulo.
    fecha_creacion: row.fecha_cierre,
    tecnico_id: null,
    estado: 'CERRADO',
    fecha_cierre: row.fecha_cierre.slice(0, 10),
    tecnico_cierre: row.tecnico_cierre ?? undefined,
  }
}

/**
 * Carga los cierres de la última ventana (7 días) persistidos en Supabase.
 *
 * Tolerante a fallos: si la migración aún no se ejecutó devuelve `[]` y avisa
 * por consola, igual que el resto de tablas opcionales del Hub.
 */
export async function obtenerCierresRecientes(): Promise<CierreTecnico[]> {
  const resultado = await leerTodasLasFilas<CierreRow>((desde, hasta) =>
    supabase
      .from('servicios_cierres')
      .select('*')
      .order('fecha_cierre', { ascending: false })
      .range(desde, hasta),
  )

  if (resultado.error) {
    console.warn('[obtenerCierresRecientes] Cierres no disponibles:', resultado.error.message)
    return []
  }

  return resultado.data.map(mapCierre)
}

/**
 * Reemplazo total del paquete de cierres (mismo patrón que las instalaciones):
 * borra el lote anterior e inserta el nuevo en lotes de 100.
 *
 * El recorte a 7 días ocurre en el parser; aquí se persiste tal cual para que
 * la pantalla y la base reflejen exactamente la misma ventana.
 */
export async function reemplazarCierresRecientes(cierres: CierreTecnico[]): Promise<number> {
  const { error: delError } = await supabase
    .from('servicios_cierres')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (delError) throw new Error(`Error al limpiar los cierres anteriores: ${delError.message}`)

  if (cierres.length === 0) return 0

  const filas: CierreInsert[] = cierres.map((cierre) => ({
    orden_id: cierre.numero_orden,
    ciudad: cierre.ciudad,
    barrio: cierre.barrio || null,
    direccion: cierre.direccion ?? null,
    cliente_nombre: cierre.nombre_cliente ?? null,
    telefono: cierre.telefono_cliente ?? null,
    tipo_servicio: cierre.tipo_servicio || null,
    dias_abierta: cierre.dias_antiguedad,
    fecha_cierre: cierre.fecha_cierre.slice(0, 10),
    tecnico_cierre: cierre.tecnico_cierre ?? null,
  }))

  let insertadas = 0
  for (const chunk of chunkArray(filas, TAMANO_LOTE_CIERRES)) {
    const { error } = await supabase.from('servicios_cierres').insert(chunk)
    if (error) throw new Error(`Error al insertar cierres: ${error.message}`)
    insertadas += chunk.length
  }

  return insertadas
}

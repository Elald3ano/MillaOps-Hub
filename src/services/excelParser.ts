import { differenceInCalendarDays } from 'date-fns'
import * as XLSX from 'xlsx'
import type { ServicioNuevo } from '../types'

// Campos que pueden venir mapeados desde las columnas del Excel.
type CampoExcel =
  | 'numero_orden'
  | 'ciudad'
  | 'barrio'
  | 'direccion'
  | 'tipo_servicio'
  | 'fecha_creacion'

const CAMPOS_REQUERIDOS: readonly CampoExcel[] = [
  'numero_orden',
  'ciudad',
  'barrio',
  'tipo_servicio',
  'fecha_creacion',
]

// Días entre 1899-12-30 (época del sistema de fechas 1900 de Excel) y
// 1970-01-01 (época Unix), en UTC. Corrección estándar para fechas seriales.
const EXCEL_EPOCH_OFFSET_DAYS = 25569
const MS_POR_DIA = 86_400_000

/** Normaliza un encabezado para compararlo: sin tildes, minúsculas, sin símbolos. */
function normalizarClave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Mapea un encabezado normalizado a un campo del dominio. */
function mapearColumna(clave: string): CampoExcel | null {
  if (
    clave.includes('numeroorden') ||
    clave === 'orden' ||
    clave === 'noorden' ||
    clave.includes('nroorden') ||
    clave.includes('numorden')
  ) {
    return 'numero_orden'
  }
  if (clave === 'ciudad' || clave === 'municipio') return 'ciudad'
  if (clave === 'barrio' || clave === 'sector') return 'barrio'
  if (clave === 'direccion' || clave === 'dir') return 'direccion'
  if (
    clave.includes('tiposervicio') ||
    clave === 'servicio' ||
    clave === 'trabajo' ||
    clave.includes('tipotrabajo')
  ) {
    return 'tipo_servicio'
  }
  if (
    clave.includes('fechacreacion') ||
    clave === 'fecha' ||
    clave.includes('fecharecepcion') ||
    clave.includes('fechaapertura')
  ) {
    return 'fecha_creacion'
  }
  return null
}

/** Construye una fecha local a medianoche validando rangos y desbordes. */
function crearFechaLocal(anio: number, mes: number, dia: number): Date | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const fecha = new Date(anio, mes - 1, dia)
  if (fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) return null
  return fecha
}

/** Convierte un serial numérico de Excel a una fecha local. */
function serialExcelADate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null
  const ms = Math.round((serial - EXCEL_EPOCH_OFFSET_DAYS) * MS_POR_DIA)
  const utc = new Date(ms)
  return crearFechaLocal(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate())
}

/** Parsea una celda de fecha en formatos mixtos (serial numérico o texto). */
function parsearFecha(valor: unknown): Date | null {
  if (valor instanceof Date) return valor

  if (typeof valor === 'number') return serialExcelADate(valor)

  if (typeof valor === 'string') {
    const texto = valor.trim()
    if (!texto) return null

    // YYYY-MM-DD o YYYY/MM/DD
    const iso = texto.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
    if (iso) return crearFechaLocal(Number(iso[1]), Number(iso[2]), Number(iso[3]))

    // DD/MM/YYYY o DD-MM-YYYY
    const dmy = texto.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
    if (dmy) return crearFechaLocal(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))

    // Fallback: Date.parse nativo
    const parseado = new Date(texto)
    return Number.isNaN(parseado.getTime()) ? null : parseado
  }

  return null
}

/** Devuelve el valor crudo de una celda o `undefined` si no hay índice. */
function obtenerValor(fila: readonly unknown[], indice: number | undefined): unknown {
  return indice === undefined ? undefined : fila[indice]
}

/** Devuelve el valor de una celda como texto limpio (trim). */
function obtenerTexto(fila: readonly unknown[], indice: number | undefined): string {
  const valor = obtenerValor(fila, indice)
  if (valor === null || valor === undefined) return ''
  return String(valor).trim()
}

/**
 * Selecciona la hoja de datos: prioriza la pestaña cuyo nombre contenga
 * "servicio"; si no, toma la primera hoja con datos tabulares.
 */
function seleccionarHoja(workbook: XLSX.WorkBook): XLSX.WorkSheet | null {
  const nombres = workbook.SheetNames
  if (nombres.length === 0) return null

  const hojaServicio = nombres.find((nombre) => nombre.toLowerCase().includes('servicio'))
  if (hojaServicio) {
    const hoja = workbook.Sheets[hojaServicio]
    if (hoja) return hoja
  }

  for (const nombre of nombres) {
    const hoja = workbook.Sheets[nombre]
    if (hoja && XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1 }).length > 1) {
      return hoja
    }
  }

  return workbook.Sheets[nombres[0]] ?? null
}

/**
 * Lee un archivo Excel (.xlsx/.xls) y lo transforma en servicios listos para
 * asignar. Devuelve servicios con `estado: 'ABIERTO'` y `tecnico_id: null`.
 */
export async function parseServiciosExcel(
  file: File,
  ciudadFiltro?: string,
): Promise<ServicioNuevo[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const hoja = seleccionarHoja(workbook)
  if (!hoja) return []

  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  })

  if (filas.length === 0) return []

  const encabezados = filas[0] ?? []

  // Mapear encabezados a campos del dominio (primer encabezado que coincida).
  const indicePorCampo = new Map<CampoExcel, number>()
  encabezados.forEach((celda, idx) => {
    if (typeof celda !== 'string') return
    const campo = mapearColumna(normalizarClave(celda))
    if (campo && !indicePorCampo.has(campo)) indicePorCampo.set(campo, idx)
  })

  const faltantes = CAMPOS_REQUERIDOS.filter((campo) => !indicePorCampo.has(campo))
  if (faltantes.length > 0) {
    throw new Error(`Faltan columnas requeridas en el archivo: ${faltantes.join(', ')}`)
  }

  const ciudadFiltroNormalizada = ciudadFiltro?.trim().toLowerCase()

  const servicios: ServicioNuevo[] = []

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] ?? []

    const numeroOrden = obtenerTexto(fila, indicePorCampo.get('numero_orden'))
    const ciudad = obtenerTexto(fila, indicePorCampo.get('ciudad'))
    const barrio = obtenerTexto(fila, indicePorCampo.get('barrio'))
    const tipoServicio = obtenerTexto(fila, indicePorCampo.get('tipo_servicio'))
    const direccion = obtenerTexto(fila, indicePorCampo.get('direccion'))

    // Ignorar filas sin datos mínimos
    if (!numeroOrden || !ciudad || !barrio || !tipoServicio) continue

    // Filtro opcional por ciudad (case-insensitive)
    if (ciudadFiltroNormalizada && ciudad.toLowerCase() !== ciudadFiltroNormalizada) continue

    const fechaCreacion = parsearFecha(obtenerValor(fila, indicePorCampo.get('fecha_creacion')))
    if (!fechaCreacion) continue

    servicios.push({
      numero_orden: numeroOrden,
      ciudad,
      barrio,
      direccion: direccion || undefined,
      tipo_servicio: tipoServicio,
      fecha_creacion: fechaCreacion.toISOString(),
      dias_antiguedad: differenceInCalendarDays(new Date(), fechaCreacion),
      tecnico_id: null,
      estado: 'ABIERTO',
    })
  }

  return servicios
}

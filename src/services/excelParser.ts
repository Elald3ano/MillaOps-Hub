import { differenceInCalendarDays } from 'date-fns'
import * as XLSX from 'xlsx'
import type { FilaMatrizImport, ServicioNuevo } from '../types'
import { esSucursalAutorizada } from '../lib/zonasPermitidas'

// Campos que pueden venir mapeados desde las columnas del Excel (reporte Sigma).
type CampoExcel =
  | 'numero_orden'
  | 'ciudad'
  | 'barrio'
  | 'direccion'
  | 'tipo_servicio'
  | 'nombre_cliente'
  | 'telefono_cliente'
  | 'referencia_pago'
  | 'identificacion'
  | 'estado_sigma'
  | 'fecha_creacion'
  | 'dias_antiguedad'

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

/** Mapea un encabezado normalizado (sin tildes, minúsculas, sin símbolos) a un campo. */
function mapearColumna(clave: string): CampoExcel | null {
  // numero_orden ← "Servicio" | "Nro orden" | "Orden"
  if (
    clave === 'servicio' ||
    clave === 'orden' ||
    clave === 'nroorden' ||
    clave === 'numeroorden' ||
    clave === 'noorden' ||
    clave === 'numorden'
  ) {
    return 'numero_orden'
  }
  // ciudad ← "Sucursal" | "Ciudad"
  if (clave === 'sucursal' || clave === 'ciudad' || clave === 'municipio') return 'ciudad'
  // tipo_servicio ← "Tipo de solicitud" | "Solicitud" | "Item"
  if (
    clave === 'tipodesolicitud' ||
    clave === 'tipodeservicio' ||
    clave === 'solicitud' ||
    clave === 'item' ||
    clave === 'trabajo' ||
    clave === 'tipotrabajo'
  ) {
    return 'tipo_servicio'
  }
  // barrio ← "Barrio"
  if (clave === 'barrio' || clave === 'sector') return 'barrio'
  // direccion ← "Dirección"
  if (clave === 'direccion' || clave === 'dir') return 'direccion'
  // nombre_cliente ← "Nombre" | "Cliente"
  if (clave === 'nombre' || clave === 'cliente') return 'nombre_cliente'
  // telefono_cliente ← "Teléfono" | "Celular"
  if (clave === 'telefono' || clave === 'celular') return 'telefono_cliente'
  // referencia_pago ← "Referencia de pago" | "Referencia"
  if (clave === 'referenciadepago' || clave === 'referencia') return 'referencia_pago'
  // identificacion ← "Identificación" | "Cédula"
  if (clave === 'identificacion' || clave === 'cedula') return 'identificacion'
  // estado_sigma ← "Estado en Sigma" | "Estado"
  if (clave === 'estadoensigma' || clave === 'estado') return 'estado_sigma'
  // dias_antiguedad ← "Días abierta"
  if (clave.includes('diasabiert') || clave === 'antiguedad') return 'dias_antiguedad'
  // fecha_creacion ← "Fecha de creación" y variantes
  if (
    clave === 'fecha' ||
    (clave.includes('fecha') && clave.includes('creacion')) ||
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

/** Parsea una celda de "Días abierta" como número entero, o `null` si no es válida. */
function parsearDias(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return Math.round(valor)
  if (typeof valor === 'string') {
    const texto = valor.trim()
    if (!texto) return null
    const numero = Number(texto.replace(',', '.'))
    return Number.isFinite(numero) ? Math.round(numero) : null
  }
  return null
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
  let descartadas = 0

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] ?? []

    const numeroOrden = obtenerTexto(fila, indicePorCampo.get('numero_orden'))
    const ciudad = obtenerTexto(fila, indicePorCampo.get('ciudad'))
    const barrio = obtenerTexto(fila, indicePorCampo.get('barrio'))
    const tipoServicio = obtenerTexto(fila, indicePorCampo.get('tipo_servicio'))
    const direccion = obtenerTexto(fila, indicePorCampo.get('direccion'))
    const nombreCliente = obtenerTexto(fila, indicePorCampo.get('nombre_cliente'))
    const telefonoCliente = obtenerTexto(fila, indicePorCampo.get('telefono_cliente'))
    const referenciaPago = obtenerTexto(fila, indicePorCampo.get('referencia_pago'))
    const identificacion = obtenerTexto(fila, indicePorCampo.get('identificacion'))
    const estadoSigma = obtenerTexto(fila, indicePorCampo.get('estado_sigma'))

    // Ignorar filas sin datos mínimos
    if (!numeroOrden || !ciudad || !barrio || !tipoServicio) continue

    // Lista blanca de jurisdicción: descarta órdenes de zonas ajenas.
    if (!esSucursalAutorizada(ciudad)) {
      descartadas++
      continue
    }

    // Filtro opcional por ciudad (case-insensitive) contra la columna "Sucursal"
    if (ciudadFiltroNormalizada && ciudad.toLowerCase() !== ciudadFiltroNormalizada) continue

    const fechaCreacion = parsearFecha(obtenerValor(fila, indicePorCampo.get('fecha_creacion')))
    if (!fechaCreacion) continue

    // "Días abierta": se lee directo si es número; si no, se calcula desde la fecha.
    const diasDesdeExcel = parsearDias(obtenerValor(fila, indicePorCampo.get('dias_antiguedad')))
    const diasAntiguedad = diasDesdeExcel ?? differenceInCalendarDays(new Date(), fechaCreacion)

    servicios.push({
      numero_orden: numeroOrden,
      ciudad,
      barrio,
      direccion: direccion || undefined,
      tipo_servicio: tipoServicio,
      nombre_cliente: nombreCliente || undefined,
      telefono_cliente: telefonoCliente || undefined,
      referencia_pago: referenciaPago || undefined,
      identificacion: identificacion || undefined,
      estado_sigma: estadoSigma || undefined,
      fecha_creacion: fechaCreacion.toISOString(),
      dias_antiguedad: diasAntiguedad,
      tecnico_id: null,
      estado: 'ABIERTO',
    })
  }

  console.log(
    `[Parser] Órdenes leídas de tu zona: ${servicios.length} | Descartadas de otras zonas: ${descartadas}`,
  )

  return servicios
}

// ---- Parseo de la matriz de asignación (importación masiva) ----

// Campos de la matriz de asignación.
type CampoMatriz = 'sucursal' | 'barrio' | 'tecnico' | 'tipo_servicio'

const CAMPOS_MATRIZ_REQUERIDOS: readonly CampoMatriz[] = ['sucursal', 'barrio', 'tecnico']

/** Mapea un encabezado normalizado de la matriz a su campo. */
function mapearColumnaMatriz(clave: string): CampoMatriz | null {
  if (clave === 'sucursal' || clave === 'ciudad' || clave === 'municipio') return 'sucursal'
  if (clave === 'barrio' || clave === 'sector') return 'barrio'
  if (clave === 'tecnico') return 'tecnico'
  if (
    clave === 'tiposervicio' ||
    clave === 'tipodeservicio' ||
    clave === 'tiposolicitud' ||
    clave === 'servicio' ||
    clave === 'item'
  ) {
    return 'tipo_servicio'
  }
  return null
}

/** Selecciona la hoja con la matriz: prefiere nombres alusivos, si no la primera con datos. */
function seleccionarHojaMatriz(workbook: XLSX.WorkBook): XLSX.WorkSheet | null {
  const nombres = workbook.SheetNames
  if (nombres.length === 0) return null

  const preferida = nombres.find((nombre) => {
    const n = nombre.toLowerCase()
    return (
      n.includes('matriz') ||
      n.includes('regla') ||
      n.includes('asignacion') ||
      n.includes('tecnico')
    )
  })
  if (preferida) {
    const hoja = workbook.Sheets[preferida]
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
 * Lee un Excel con la matriz de asignación.
 * Columnas esperadas: [sucursal, barrio, TECNICO] y, opcionalmente, tipo_servicio/servicio.
 */
export async function parsearMatrizExcel(file: File): Promise<FilaMatrizImport[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const hoja = seleccionarHojaMatriz(workbook)
  if (!hoja) return []

  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  })

  if (filas.length === 0) return []

  const encabezados = filas[0] ?? []

  const indicePorCampo = new Map<CampoMatriz, number>()
  encabezados.forEach((celda, idx) => {
    if (typeof celda !== 'string') return
    const campo = mapearColumnaMatriz(normalizarClave(celda))
    if (campo && !indicePorCampo.has(campo)) indicePorCampo.set(campo, idx)
  })

  const faltantes = CAMPOS_MATRIZ_REQUERIDOS.filter((campo) => !indicePorCampo.has(campo))
  if (faltantes.length > 0) {
    throw new Error(`Faltan columnas requeridas en la matriz: ${faltantes.join(', ')}`)
  }

  const filasMatriz: FilaMatrizImport[] = []

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] ?? []

    const sucursal = obtenerTexto(fila, indicePorCampo.get('sucursal'))
    const barrio = obtenerTexto(fila, indicePorCampo.get('barrio'))
    const tecnico = obtenerTexto(fila, indicePorCampo.get('tecnico'))
    const tipoServicio = obtenerTexto(fila, indicePorCampo.get('tipo_servicio'))

    // Ignorar filas vacías o sin técnico.
    if (!sucursal && !barrio && !tecnico) continue
    if (!tecnico) continue

    filasMatriz.push({
      sucursal,
      barrio,
      tecnico,
      tipo_servicio: tipoServicio || undefined,
    })
  }

  return filasMatriz
}

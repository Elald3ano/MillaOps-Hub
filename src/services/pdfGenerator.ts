import type { jsPDF } from 'jspdf'
import type { Cell, CellHook, UserOptions } from 'jspdf-autotable'
import { format } from 'date-fns'
import { conRetraso } from '../lib/sla'
import type { Servicio, Tecnico } from '../types'

/** Umbral de "retraso" en la planilla: órdenes con 2 o más días abiertas. */
export const UMBRAL_RETRASO = 2

/** Fotografía de fecha/hora usada en el nombre de archivo de los PDF (`2026-10-28-1023`). */
export function marcaDeTiempo(fecha: Date = new Date()): string {
  return format(fecha, 'yyyy-MM-dd-HHmm')
}

/**
 * Convierte un texto en un slug seguro para nombres de archivo:
 * minúsculas, sin tildes, sin símbolos y con guiones únicos.
 */
export function slugificar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[^a-z0-9]+/g, '-') // reemplaza espacios y símbolos por guiones
    .replace(/^-+|-+$/g, '') // quita guiones en los extremos
}

export interface PlanillaTecnico {
  tecnico: Tecnico
  servicios: Servicio[]
}

export interface OpcionesPdf {
  soloCriticas: boolean
  ciudad: string
  /**
   * Si es `true`, el PDF conserva el orden exacto en que llegaron las órdenes
   * (filtradas y ordenadas por la pantalla). Si es `false`/`undefined`, se
   * reordena por SLA descendente (regla de oro del modal masivo matutino).
   */
  respetarOrden?: boolean
  /** Línea de contexto opcional ("Filtros: ≥ 7 días | Ordenado por: barrio (asc)"). */
  notaFiltros?: string
}

/** Adaptador sobre el predicado compartido para trabajar con `Servicio`. */
export function esServicioConRetraso(servicio: Servicio): boolean {
  return conRetraso(servicio.dias_antiguedad)
}

// ---- Constantes de diseño (A4 en milímetros) ----
const MARGEN = 14 // sangría del encabezado institucional
const MARGEN_TABLA = 8 // márgenes laterales estrechos de la tabla (máximo ancho útil)
const Y_KPI = 40
const ALTO_KPI = 19
const Y_TABLA = 62
const ALTO_BANDA = 34

const COLOR_NAVY: [number, number, number] = [30, 41, 59] // #1e293b
const COLOR_ROW_ALT: [number, number, number] = [248, 250, 252] // #f8fafc
const COLOR_ROJO: [number, number, number] = [220, 38, 38] // #dc2626
const COLOR_SLATE: [number, number, number] = [100, 116, 139] // #64748b
const COLOR_BORDE: [number, number, number] = [226, 232, 240] // #e2e8f0
const COLOR_TEXTO_OSCURO: [number, number, number] = [15, 23, 42] // #0f172a (slate-900)
const COLOR_DETALLE: [number, number, number] = [51, 65, 85] // #334155 (slate-700)
const COLOR_VERDE: [number, number, number] = [22, 163, 74] // #16a34a (green-600)
const COLOR_AMARILLO: [number, number, number] = [250, 204, 21] // #facc15 (yellow-400)

// ---- Estilos compartidos de la planilla de despacho (6 columnas) ----
// Ancho útil: 210 mm (A4) − 8 mm × 2 = 194 mm; los anchos de columna suman 194 mm.
const ESTILOS_CUERPO: UserOptions['styles'] = {
  fontSize: 8.5,
  // Padding asimétrico: menos aire vertical contra la línea divisoria de la
  // fila, manteniendo el margen lateral que evita que el texto roce los bordes.
  cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
  overflow: 'linebreak',
  valign: 'middle',
  lineColor: COLOR_BORDE,
  lineWidth: 0.2,
}

const ESTILOS_HEAD: UserOptions['headStyles'] = {
  fillColor: COLOR_NAVY,
  textColor: [255, 255, 255],
  fontStyle: 'bold',
  fontSize: 9,
  valign: 'middle',
}

// 6 columnas · 194 mm útiles (210 mm A4 − 8 mm × 2).
// Cliente recibe 60 mm para que Tel + Ref + CC convivan en una sola línea sin
// que ningún dato se descarte; Barrio/Dirección conserva 48 mm para la dirección.
const ANCHOS_COLUMNAS: UserOptions['columnStyles'] = {
  0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
  1: { cellWidth: 20, textColor: COLOR_TEXTO_OSCURO },
  2: { cellWidth: 22, fontStyle: 'bold' },
  3: { cellWidth: 48 },
  4: { cellWidth: 60 },
  5: { cellWidth: 32 },
}

const CABECERAS = [
  'Días',
  'Orden #',
  'Ciudad',
  'Barrio / Dirección',
  'Cliente / Teléfono / Ref. Pago',
  'Tipo de Servicio',
]

// ---- Formateo de fecha local (sin depender de date-fns en el chunk pesado) ----
function formatearFecha(fecha: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${pad(
    fecha.getHours(),
  )}:${pad(fecha.getMinutes())}`
}

/** Dibuja el encabezado institucional + KPIs de una planilla. */
function dibujarEncabezado(doc: jsPDF, grupo: PlanillaTecnico, opciones: OpcionesPdf): void {
  const ancho = doc.internal.pageSize.getWidth()
  const { tecnico, servicios } = grupo
  const criticas = servicios.filter(esServicioConRetraso).length
  const fecha = formatearFecha(new Date())

  // Banda superior institucional
  doc.setFillColor(...COLOR_NAVY)
  doc.rect(0, 0, ancho, ALTO_BANDA, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('PLANILLA TÉCNICA DE DESPACHO', MARGEN, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(148, 163, 184)
  doc.text('MillaOps Hub', ancho - MARGEN, 13, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Técnico: ${tecnico.nombre}`, MARGEN, 21)
  doc.text(`Teléfono: ${tecnico.telefono ?? 'No registrado'}`, MARGEN, 27)

  // Ciudades reales del técnico en esta planilla (esquina superior derecha).
  const ciudadesUnicas = [...new Set(servicios.map((s) => s.ciudad))].sort((a, b) =>
    a.localeCompare(b),
  )
  doc.text(
    `Ciudad(es): ${ciudadesUnicas.join(', ') || opciones.ciudad || 'Todas'}`,
    ancho - MARGEN,
    21,
    { align: 'right' },
  )
  doc.text(`Generado: ${fecha}`, ancho - MARGEN, 27, { align: 'right' })

  // Línea táctica de filtros/orden (solo cuando la vista los declara).
  if (opciones.notaFiltros) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(203, 213, 225)
    doc.text(opciones.notaFiltros, ancho - MARGEN, 31.5, { align: 'right' })
  }

  // KPIs en cabecera (números grandes con borde definido).
  const anchoUtil = ancho - 2 * MARGEN
  const boxW = (anchoUtil - 6) / 2

  doc.setFillColor(241, 245, 249)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(MARGEN, Y_KPI, boxW, ALTO_KPI, 2, 2, 'FD')
  doc.setTextColor(...COLOR_NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('TOTAL ÓRDENES ASIGNADAS', MARGEN + 5, Y_KPI + 6)
  doc.setFontSize(18)
  doc.text(String(servicios.length), MARGEN + 5, Y_KPI + 16)

  doc.setFillColor(254, 242, 242)
  doc.setDrawColor(254, 202, 202)
  doc.roundedRect(MARGEN + boxW + 6, Y_KPI, boxW, ALTO_KPI, 2, 2, 'FD')
  doc.setTextColor(...COLOR_ROJO)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text(`CON RETRASO (${UMBRAL_RETRASO}+ DÍAS)`, MARGEN + boxW + 11, Y_KPI + 6)
  doc.setFontSize(18)
  doc.text(String(criticas), MARGEN + boxW + 11, Y_KPI + 16)
}

/**
 * Dibuja la celda compuesta de "Cliente" con un layout de **3 líneas máximo**:
 *
 *   Caso normal (el nombre cabe en una línea):
 *     L1  Nombre (bold)
 *     L2  Tel: … · Ref: …
 *     L3  CC: …
 *
 *   Caso nombre largo (parte en L1 y L2):
 *     L1  ESTEFANY LICEL SINISTERRA
 *     L2  PAREDES · Tel: 3101234567
 *     L3  Ref: … · CC: …
 *
 * El teléfono se "empaqueta" tras el resto del nombre en lugar de abrir una
 * línea nueva: la parte sobrante del nombre suele dejar mucho aire horizontal
 * libre en L2, que de otro modo se desperdicia e infla la celda a 4 líneas.
 *
 * Primero se intenta el nombre a 8 pt; si excede el ancho útil (~50 mm) se
 * reduce a 7.5 pt, que resuelve la mayoría de nombres de 3-4 palabras sin
 * partirlos. Solo si aun así no cabe se parte por palabras.
 */
function dibujarCeldaCliente(doc: jsPDF, cell: Cell, lineas: string[]): void {
  const F_NOMBRE = 8
  const F_NOMBRE_REDUCIDO = 7.5
  const F_DETALLE = 7
  const PASO_LINEA = 3.3
  const FACTOR_LINEA = 1.15 // coincide con jspdf-autotable (PHYSICAL_LINE_HEIGHT)
  const aMm = (pt: number) => (pt * 25.4) / 72

  // Se parsea por etiqueta (no por posición) y con valores YA limpios: una CC o
  // un teléfono ausentes llegan como cadena vacía y NUNCA producen "Tel: · ".
  const datos = parsearClienteCelda(lineas)
  const nombreOriginal = datos.nombre

  const padTop = cell.padding('top')
  const x = cell.x + cell.padding('left')
  // Ancho real disponible para el texto dentro de la celda (sin paddings).
  const anchoUtil = cell.width - cell.padding('left') - cell.padding('right')

  // ---- 1. Elegir tamaño del nombre y decidir si parte en dos líneas ----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(F_NOMBRE)
  let tamanoNombre = F_NOMBRE
  if (doc.getTextWidth(nombreOriginal) > anchoUtil) {
    // Auto-ajuste: 7.5 pt resuelve la mayoría de nombres largos.
    tamanoNombre = F_NOMBRE_REDUCIDO
    doc.setFontSize(tamanoNombre)
  }

  const cabeEntero = doc.getTextWidth(nombreOriginal) <= anchoUtil
  let nombreLinea1 = nombreOriginal
  let nombreLinea2 = ''
  if (!cabeEntero) {
    const partes = partirNombre(doc, nombreOriginal, anchoUtil, tamanoNombre)
    nombreLinea1 = partes[0]
    nombreLinea2 = partes[1]
  }

  // ---- 2. Líneas deterministas: ningún dato se descarta jamás ----
  const lineasFinales: Array<{ texto: string; tamano: number; esNombre: boolean }> = [
    { texto: nombreLinea1, tamano: tamanoNombre, esNombre: true },
  ]
  // Con 60 mm de columna (56 mm útiles) Tel + Ref caben en una línea en el
  // 100 % de los casos reales. Si un valor es extremo, `ajustarTextoDetalle`
  // reduce hasta 6 pt antes de truncar, pero NUNCA se omite un campo entero.
  const contacto = [datos.telefono, datos.ref].filter(Boolean).join(' · ')

  if (nombreLinea2) {
    // Nombre partido: el resto del apellido comparte L2 con el contacto y la
    // CC baja a L3. Sigue siendo 3 líneas y no se pierde nada.
    const sufijo = [nombreLinea2, contacto].filter(Boolean).join(' · ')
    lineasFinales.push({ texto: sufijo, tamano: F_DETALLE, esNombre: false })
    lineasFinales.push({
      texto: datos.cc,
      tamano: F_DETALLE,
      esNombre: false,
    })
  } else {
    lineasFinales.push({ texto: contacto, tamano: F_DETALLE, esNombre: false })
    lineasFinales.push({ texto: datos.cc, tamano: F_DETALLE, esNombre: false })
  }

  const visibles = lineasFinales.filter((l) => l.texto)
  const altoTotal = aMm(F_NOMBRE) * FACTOR_LINEA + PASO_LINEA * Math.max(0, visibles.length - 1)

  // ---- 3. Centrado vertical y dibujo ----
  const disponible = cell.height - padTop - cell.padding('bottom')
  const tope = cell.y + padTop + Math.max(0, (disponible - altoTotal) / 2)
  let base = tope + aMm(F_NOMBRE) * (2 - FACTOR_LINEA) // ajuste de línea base de autotable

  for (const linea of visibles) {
    if (linea.esNombre) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(linea.tamano)
      doc.setTextColor(...COLOR_NAVY)
      doc.text(truncarAlAncho(doc, linea.texto, anchoUtil), x, base)
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLOR_DETALLE)
      const ajustada = ajustarTextoDetalle(doc, linea.texto, anchoUtil)
      if (ajustada.texto) {
        // Se dibuja con el tamaño con el que se midió: si la reducción a 6-7 pt
        // se descartara aquí, el texto que "cabía" desbordaría la columna.
        doc.setFontSize(ajustada.tamano)
        doc.text(ajustada.texto, x, base)
      }
    }
    base += PASO_LINEA
  }
  doc.setFontSize(F_DETALLE) // restaura para no contaminar la siguiente celda
}

/**
 * Descompone la celda de Cliente en sus campos, tolerando los dos formatos:
 *
 * - Nuevo: `Nombre|Tel: X|Ref: Y|CC: Z` (separador explícito `|`).
 * - Antiguo/autoTable: líneas ya partidas por `\n`, donde un dato puede faltar.
 *
 * Se busca por etiqueta (`Tel:`, `Ref:`, `CC:`) en lugar de por posición: así
 * una CC ausente no se confunde con la línea de referencia y nunca se pierde.
 *
 * Cada campo se devuelve ya formateado y con **valor real**: si la orden no
 * trae teléfono o cédula, ese campo llega como `''` (nunca "Tel: " vacío), de
 * modo que el llamador puede omitir la etiqueta por completo.
 */
function parsearClienteCelda(lineas: string[]): {
  nombre: string
  telefono: string
  ref: string
  cc: string
} {
  const campos = lineas
    .flatMap((l) => l.split('|'))
    .flatMap((l) => l.split('\n'))
    .map((l) => l.trim())
    .filter(Boolean)

  let nombre = ''
  let ref = ''
  let cc = ''
  let telefono = ''

  /** Devuelve "Etiqueta: valor" solo si el valor tiene contenido real. */
  const conEtiqueta = (etiqueta: string, valor: string): string => {
    const limpio = valor.trim()
    return limpio ? `${etiqueta}: ${limpio}` : ''
  }

  for (const campo of campos) {
    if (campo.startsWith('Tel:')) {
      telefono = conEtiqueta('Tel', campo.slice(4))
    } else if (campo.startsWith('Ref:')) {
      ref = conEtiqueta('Ref', campo.slice(4))
    } else if (campo.startsWith('CC:')) {
      cc = conEtiqueta('CC', campo.slice(3))
    } else if (!nombre) {
      nombre = campo
    }
  }

  return { nombre, telefono, ref, cc }
}

/**
 * Parte un nombre en dos tramos a la altura del último espacio posible:
 * L1 con las palabras que caben, L2 con el resto. El tramo de L2 puede quedar
 * muy corto (p. ej. "PAREDES"), que es justo el espacio que se reutiliza.
 */
function partirNombre(
  doc: jsPDF,
  nombre: string,
  anchoUtil: number,
  tamano: number,
): [string, string] {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(tamano)
  const palabras = nombre.split(/\s+/).filter(Boolean)
  if (palabras.length <= 1) return [nombre, '']

  let linea1 = ''
  for (let i = 0; i < palabras.length; i++) {
    const candidata = linea1 ? `${linea1} ${palabras[i]}` : palabras[i]
    if (doc.getTextWidth(candidata) > anchoUtil && linea1) {
      return [linea1, palabras.slice(i).join(' ')]
    }
    linea1 = candidata
  }
  return [linea1, '']
}

/** Trunca con puntos suspensivos si el texto excede el ancho disponible. */
function truncarAlAncho(doc: jsPDF, texto: string, anchoUtil: number): string {
  if (doc.getTextWidth(texto) <= anchoUtil) return texto
  let recortado = texto
  const ELLIPSIS = '…'
  while (recortado.length > 0 && doc.getTextWidth(recortado + ELLIPSIS) > anchoUtil) {
    recortado = recortado.slice(0, -1)
  }
  return recortado.length > 0 ? `${recortado}${ELLIPSIS}` : ''
}

/**
 * Ajusta una línea de detalle al ancho disponible: reduce la tipografía hasta
 * `F_DETALLE_MIN` y, si aún no cabe, trunca con puntos suspensivos.
 *
 * Devuelve también el tamaño con el que se midió para que el llamador dibuje
 * exactamente a esa escala (de lo contrario la protección de ancho no vale).
 */
function ajustarTextoDetalle(
  doc: jsPDF,
  original: string,
  anchoUtil: number,
): { texto: string; tamano: number } {
  const F_DETALLE = 7
  const F_DETALLE_MIN = 6
  const PASO_REDUCCION = 0.25

  let texto = original
  let tamano = F_DETALLE
  doc.setFontSize(tamano)

  while (tamano > F_DETALLE_MIN && doc.getTextWidth(texto) > anchoUtil) {
    tamano = Math.max(F_DETALLE_MIN, tamano - PASO_REDUCCION)
    doc.setFontSize(tamano)
  }

  if (doc.getTextWidth(texto) > anchoUtil) {
    // El truncado se mide a F_DETALLE_MIN: es el tamaño más pequeño con el que
    // se dibujará, así que garantiza que quepa.
    doc.setFontSize(F_DETALLE_MIN)
    tamano = F_DETALLE_MIN
    texto = truncarAlAncho(doc, texto, anchoUtil)
  }

  return { texto, tamano }
}

/**
 * Hooks para renderizar la columna "Cliente" con tipografía mixta. Suprime el
 * texto por defecto en `willDrawCell` (sin alterar el alto de fila ya calculado)
 * y lo redibuja en `didDrawCell` con nombre en negrita y detalle en gris.
 */
function crearHooksCliente(): { willDrawCell: CellHook; didDrawCell: CellHook } {
  const lineasPorCelda = new WeakMap<Cell, string[]>()
  return {
    willDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 4) return
      lineasPorCelda.set(data.cell, data.cell.text.slice())
      data.cell.text = []
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 4) return
      const lineas = lineasPorCelda.get(data.cell)
      if (!lineas || lineas.length === 0) return
      dibujarCeldaCliente(data.doc as jsPDF, data.cell, lineas)
    },
  }
}

/** Colorea la celda de "Días" con un bloque sólido de semáforo (verde/amarillo/rojo). */
const colorearDiasSemaforo: CellHook = (data) => {
  if (data.section !== 'body' || data.column.index !== 0) return
  const dias = Number(data.cell.raw) || 0
  data.cell.styles.halign = 'center'
  data.cell.styles.valign = 'middle'
  data.cell.styles.fontStyle = 'bold'

  if (dias <= 1) {
    // Verde esmeralda sólido (al día)
    data.cell.styles.fillColor = COLOR_VERDE
    data.cell.styles.textColor = [255, 255, 255]
  } else if (dias === 2) {
    // Amarillo intenso sólido (atención) con texto oscuro para contraste
    data.cell.styles.fillColor = COLOR_AMARILLO
    data.cell.styles.textColor = COLOR_TEXTO_OSCURO
  } else {
    // Rojo carmesí sólido (críticos >= 3 días)
    data.cell.styles.fillColor = COLOR_ROJO
    data.cell.styles.textColor = [255, 255, 255]
  }
}

/** Dibuja la tabla de órdenes de una planilla. */
function dibujarTabla(
  doc: jsPDF,
  servicios: Servicio[],
  autoTable: (doc: jsPDF, opciones: UserOptions) => void,
): void {
  const hooksCliente = crearHooksCliente()

  autoTable(doc, {
    startY: Y_TABLA,
    head: [CABECERAS],
    body: servicios.map((s) => [
      String(s.dias_antiguedad),
      s.numero_orden,
      s.ciudad,
      // Barrio y dirección en líneas distintas: la dirección fluye sola en las
      // líneas 2-3 sin que un número suelto (p. ej. "65") quede huérfano.
      [s.barrio || '—', s.direccion || ''].filter(Boolean).join('\n'),
      // Jerarquía semántica: nombre / Tel / Ref / CC, con separador explícito
      // (`|`) para que la celda no dependa del conteo de líneas creadas por
      // autoTable: con `\n` los datos se reordenaban y la CC se perdía.
      // Cada etiqueta se emite SOLO si el dato existe (nada de "Tel: " vacío).
      [
        s.nombre_cliente?.trim() || 'SIN NOMBRE',
        s.telefono_cliente?.trim() ? `Tel: ${s.telefono_cliente.trim()}` : '',
        s.referencia_pago?.trim() ? `Ref: ${s.referencia_pago.trim()}` : '',
        s.identificacion?.trim() ? `CC: ${s.identificacion.trim()}` : '',
      ]
        .filter(Boolean)
        .join('|'),
      s.tipo_servicio,
    ]),
    margin: { left: MARGEN_TABLA, right: MARGEN_TABLA, bottom: 26 },
    rowPageBreak: 'avoid',
    styles: ESTILOS_CUERPO,
    headStyles: ESTILOS_HEAD,
    alternateRowStyles: { fillColor: COLOR_ROW_ALT },
    columnStyles: ANCHOS_COLUMNAS,
    willDrawCell: hooksCliente.willDrawCell,
    didDrawCell: hooksCliente.didDrawCell,
    didParseCell: colorearDiasSemaforo,
  })
}

/** Agrega numeración de páginas y espacios de firma al pie de todas las páginas. */
function agregarPiePagina(doc: jsPDF): void {
  const totalPaginas = doc.getNumberOfPages()
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const mitad = ancho / 2

  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i)

    doc.setDrawColor(...COLOR_BORDE)
    doc.setLineWidth(0.2)
    doc.line(MARGEN, alto - 24, ancho - MARGEN, alto - 24)

    doc.setDrawColor(...COLOR_SLATE)
    doc.setLineWidth(0.3)
    doc.line(MARGEN, alto - 22, mitad - 12, alto - 22)
    doc.line(mitad + 12, alto - 22, ancho - MARGEN, alto - 22)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...COLOR_SLATE)
    doc.text('Firma Supervisor', MARGEN, alto - 17)
    doc.text('Firma Técnico', mitad + 12, alto - 17)

    doc.text(
      `MillaOps Hub · Daniel Córdoba (Asistente Técnico Distrital) · Página ${i} de ${totalPaginas}`,
      mitad,
      alto - 8,
      { align: 'center' },
    )
  }
}

/**
 * Genera el PDF de planilla de despacho.
 * `grupos` contiene uno o varios técnicos (1 = específico, N = consolidado);
 * se inserta un salto de página entre cada técnico.
 *
 * Las dependencias pesadas (`jspdf`, `jspdf-autotable`) se cargan de forma
 * dinámica: así no entran en el bundle inicial y solo se descargan cuando el
 * usuario realmente exporta. `jsPDF` es una clase (no se puede aislar) y debe
 * importarse de forma estática; `jspdf-autotable` es una función y se carga aquí.
 */
export async function generarPlanillaPdf(
  grupos: PlanillaTecnico[],
  opciones: OpcionesPdf,
): Promise<jsPDF> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const gruposFiltrados = grupos
    .map((grupo) => {
      // REGLA DE ORO (modal masivo): lo más crítico primero. La Radiografía
      // envía `respetarOrden: true` para conservar el orden de pantalla.
      const ordenesFinales = (
        opciones.soloCriticas
          ? grupo.servicios.filter(esServicioConRetraso)
          : grupo.servicios
      ).slice()
      if (!opciones.respetarOrden) {
        ordenesFinales.sort((a, b) => b.dias_antiguedad - a.dias_antiguedad)
      }
      return { tecnico: grupo.tecnico, servicios: ordenesFinales }
    })
    .filter((grupo) => grupo.servicios.length > 0)

  if (gruposFiltrados.length === 0) {
    throw new Error('No hay órdenes para exportar con los filtros seleccionados.')
  }

  gruposFiltrados.forEach((grupo, index) => {
    if (index > 0) doc.addPage()
    dibujarEncabezado(doc, grupo, opciones)
    dibujarTabla(doc, grupo.servicios, autoTable)
  })

  agregarPiePagina(doc)

  // Nomenclatura inteligente: el archivo lleva el nombre del técnico cuando la
  // planilla es suya; si es consolidada, indica la ciudad o la escala regional.
  const timestamp = marcaDeTiempo()
  const nombreArchivo = nombrePlanillaPdf(gruposFiltrados, opciones.ciudad, timestamp)

  doc.setProperties({ title: nombreArchivo.replace(/\.pdf$/, '') })
  return doc
}

/**
 * Nombre de archivo de la planilla de despacho: `PD-<tecnico|consolidado>-<timestamp>.pdf`.
 * Se calcula sobre los grupos que realmente se exportan (tras el filtro de críticas),
 * por lo que un único técnico con órdenes siempre produce su nombre.
 */
export function nombrePlanillaPdf(
  grupos: PlanillaTecnico[],
  ciudad: string,
  timestamp: string = marcaDeTiempo(),
): string {
  if (grupos.length === 1) {
    return `PD-${slugificar(grupos[0].tecnico.nombre)}-${timestamp}.pdf`
  }
  if (ciudad === 'Consolidado Regional') {
    return `PD-consolidado-regional-${timestamp}.pdf`
  }
  return `PD-consolidado-${slugificar(ciudad)}-${timestamp}.pdf`
}

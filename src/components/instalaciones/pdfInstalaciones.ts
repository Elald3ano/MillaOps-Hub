import type { jsPDF } from 'jspdf'
import type { CellHook, UserOptions } from 'jspdf-autotable'
import type { ServicioNuevo } from '../../types'
import { clasificarSla } from '../../lib/sla'
import { etiquetaDeTipo } from './catalogoNovedades'

/** Novedad ya resuelta para la celda de bloqueo del PDF. */
export interface NovedadPdf {
  tipo: Parameters<typeof etiquetaDeTipo>[0]
  cajaNap?: string
  comentario?: string
}

/** Fila lista para imprimir: la orden + su dueño territorial + su novedad. */
export interface FilaInstalacionPdf {
  servicio: ServicioNuevo
  /** Nombre del dueño del barrio; vacío si el barrio no tiene dueño. */
  operador?: string
  novedad?: NovedadPdf
}

export interface OpcionesPdfInstalaciones {
  /** Nota de contexto ("Filtros: Barrio X + 16-30 días | Orden: Días ▼"). */
  notaFiltros?: string
  /** Nombre de archivo sin extensión (lo compone el llamador). */
  nombreArchivo: string
}

// ---- Diseño (A4 en milímetros) ----
const MARGEN = 14
const MARGEN_TABLA = 8
const Y_KPI = 40
const ALTO_KPI = 19
const Y_TABLA = 66
const ALTO_BANDA = 38

const COLOR_NAVY: [number, number, number] = [30, 41, 59]
const COLOR_ROW_ALT: [number, number, number] = [248, 250, 252]
const COLOR_SLATE: [number, number, number] = [100, 116, 139]
const COLOR_BORDE: [number, number, number] = [226, 232, 240]
const COLOR_TEXTO_OSCURO: [number, number, number] = [15, 23, 42]
const COLOR_ROJO: [number, number, number] = [220, 38, 38]
const COLOR_VERDE: [number, number, number] = [22, 163, 74]
const COLOR_AMARILLO: [number, number, number] = [250, 204, 21]
const COLOR_AMBER: [number, number, number] = [180, 83, 9]

// 7 columnas · 194 mm útiles. Suma exacta:
// 11 + 18 + 40 + 40 + 37 + 27 + 21 = 194 mm
const ANCHOS_COLUMNAS: UserOptions['columnStyles'] = {
  0: { cellWidth: 11, halign: 'center' },
  1: { cellWidth: 18, textColor: COLOR_TEXTO_OSCURO },
  2: { cellWidth: 40 },
  3: { cellWidth: 40 },
  4: { cellWidth: 37 },
  5: { cellWidth: 27 },
  6: { cellWidth: 21 },
}

const CABECERAS = [
  'Días',
  'Orden #',
  'Barrio / Dirección',
  'Cliente / Teléfono',
  'Tipo de Servicio',
  'Operador de Zona',
  'Novedad / Bloqueo',
]

const ESTILOS_CUERPO: UserOptions['styles'] = {
  fontSize: 7.5,
  cellPadding: { top: 1.5, bottom: 1.5, left: 1.6, right: 1.6 },
  overflow: 'linebreak',
  valign: 'middle',
  lineColor: COLOR_BORDE,
  lineWidth: 0.2,
}

const ESTILOS_HEAD: UserOptions['headStyles'] = {
  fillColor: COLOR_NAVY,
  textColor: [255, 255, 255],
  fontStyle: 'bold',
  fontSize: 7.5,
  valign: 'middle',
}

function formatearFecha(fecha: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${pad(
    fecha.getHours(),
  )}:${pad(fecha.getMinutes())}`
}

/** Texto de la celda de bloqueo, sin emojis (la fuente estándar de jsPDF no los tiene). */
function textoNovedad(novedad: NovedadPdf | undefined): string {
  if (!novedad) return 'Sin novedad'
  const etiqueta = etiquetaDeTipo(novedad.tipo)
  const caja = novedad.cajaNap?.trim()
  return `${etiqueta.etiqueta}${caja ? ` (${caja})` : ''}`
}

/** Banda institucional + KPIs de la planilla de instalaciones. */
function dibujarEncabezado(
  doc: jsPDF,
  filas: FilaInstalacionPdf[],
  opciones: OpcionesPdfInstalaciones,
): void {
  const ancho = doc.internal.pageSize.getWidth()
  const ciudades = [...new Set(filas.map((f) => f.servicio.ciudad))].sort((a, b) =>
    a.localeCompare(b),
  )
  const conNovedad = filas.filter((f) => f.novedad).length
  const criticas = filas.filter((f) => f.servicio.dias_antiguedad > 30).length
  const sinDueno = filas.filter((f) => !f.operador).length

  doc.setFillColor(...COLOR_NAVY)
  doc.rect(0, 0, ancho, ALTO_BANDA, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('CONTROL DE INSTALACIONES Y PUERTOS', MARGEN, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(148, 163, 184)
  doc.text('MillaOps Hub', ancho - MARGEN, 13, { align: 'right' })

  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(`Ciudad(es): ${ciudades.join(', ') || 'Todas'}`, MARGEN, 21)
  doc.text(`Órdenes: ${filas.length}`, MARGEN, 27)
  doc.text(`Con novedad: ${conNovedad} · Sin novedad: ${filas.length - conNovedad}`, MARGEN, 33)

  doc.text(`Generado: ${formatearFecha(new Date())}`, ancho - MARGEN, 21, { align: 'right' })
  doc.text(`Críticas (>30 días): ${criticas}`, ancho - MARGEN, 27, { align: 'right' })
  doc.text(`Barrios sin dueño: ${sinDueno}`, ancho - MARGEN, 33, { align: 'right' })

  if (opciones.notaFiltros) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(203, 213, 225)
    doc.text(opciones.notaFiltros, ancho - MARGEN, 36.5, { align: 'right' })
  }

  // KPIs: total · con novedad · críticas
  const anchoUtil = ancho - 2 * MARGEN
  const separacion = 4
  const boxW = (anchoUtil - separacion * 2) / 3
  const kpis: { titulo: string; valor: number; fondo: [number, number, number]; borde: [number, number, number]; texto: [number, number, number] }[] = [
    { titulo: 'TOTAL INSTALACIONES', valor: filas.length, fondo: [241, 245, 249], borde: [203, 213, 225], texto: COLOR_NAVY },
    { titulo: 'CON NOVEDAD', valor: conNovedad, fondo: [254, 242, 242], borde: [254, 202, 202], texto: COLOR_ROJO },
    { titulo: 'CRÍTICAS (>30 DÍAS)', valor: criticas, fondo: [254, 243, 199], borde: [253, 230, 138], texto: COLOR_AMBER },
  ]

  kpis.forEach((kpi, i) => {
    const x = MARGEN + i * (boxW + separacion)
    doc.setFillColor(...kpi.fondo)
    doc.setDrawColor(...kpi.borde)
    doc.roundedRect(x, Y_KPI, boxW, ALTO_KPI, 2, 2, 'FD')
    doc.setTextColor(...kpi.texto)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.8)
    doc.text(kpi.titulo, x + 3, Y_KPI + 6)
    doc.setFontSize(18)
    doc.text(String(kpi.valor), x + 3, Y_KPI + 16)
  })
}

/** Colorea la celda de "Días" con el semáforo compartido (verde/amarillo/rojo). */
const colorearDiasSemaforo: CellHook = (data) => {
  if (data.section !== 'body' || data.column.index !== 0) return
  const nivel = clasificarSla(Number(data.cell.raw) || 0)
  data.cell.styles.halign = 'center'
  data.cell.styles.valign = 'middle'
  data.cell.styles.fontStyle = 'bold'

  if (nivel === 'ok') {
    data.cell.styles.fillColor = COLOR_VERDE
    data.cell.styles.textColor = [255, 255, 255]
  } else if (nivel === 'warn') {
    data.cell.styles.fillColor = COLOR_AMARILLO
    data.cell.styles.textColor = [15, 23, 42]
  } else {
    data.cell.styles.fillColor = COLOR_ROJO
    data.cell.styles.textColor = [255, 255, 255]
  }
}

/** Resalta la celda de "Novedad": roja si hay bloqueo, verde si está libre. */
const colorearNovedad: CellHook = (data) => {
  if (data.section !== 'body' || data.column.index !== 6) return
  const texto = String(data.cell.raw ?? '')
  if (texto === 'Sin novedad') {
    data.cell.styles.textColor = COLOR_VERDE
  } else {
    data.cell.styles.textColor = COLOR_ROJO
    data.cell.styles.fontStyle = 'bold'
  }
}

/**
 * Genera la planilla PDF de instalaciones respetando filtros y orden de pantalla.
 *
 * Las dependencias pesadas se cargan dinámicamente: el módulo ya es lazy, pero
 * así el PDF tampoco entra en el chunk del tablero.
 */
export async function generarPlanillaInstalaciones(
  filas: FilaInstalacionPdf[],
  opciones: OpcionesPdfInstalaciones,
): Promise<jsPDF> {
  if (filas.length === 0) {
    throw new Error('No hay instalaciones para exportar con los filtros seleccionados.')
  }

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  dibujarEncabezado(doc, filas, opciones)

  autoTable(doc, {
    startY: Y_TABLA,
    head: [CABECERAS],
    body: filas.map(({ servicio, operador, novedad }) => [
      String(servicio.dias_antiguedad),
      servicio.numero_orden,
      [servicio.barrio || '—', servicio.direccion || ''].filter(Boolean).join('\n'),
      [servicio.nombre_cliente || 'SIN NOMBRE', servicio.telefono_cliente ? `Tel: ${servicio.telefono_cliente}` : 'Tel: s/r']
        .filter(Boolean)
        .join('\n'),
      servicio.tipo_servicio,
      operador || 'Sin dueño',
      textoNovedad(novedad),
    ]),
    margin: { left: MARGEN_TABLA, right: MARGEN_TABLA, bottom: 24 },
    rowPageBreak: 'avoid',
    styles: ESTILOS_CUERPO,
    headStyles: ESTILOS_HEAD,
    alternateRowStyles: { fillColor: COLOR_ROW_ALT },
    columnStyles: ANCHOS_COLUMNAS,
    didParseCell: (data) => {
      colorearDiasSemaforo(data)
      colorearNovedad(data)
    },
  })

  // Pie de página con numeración y firma del responsable de despacho.
  const totalPaginas = doc.getNumberOfPages()
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i)
    doc.setDrawColor(...COLOR_BORDE)
    doc.setLineWidth(0.2)
    doc.line(MARGEN, alto - 20, ancho - MARGEN, alto - 20)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...COLOR_SLATE)
    doc.text('Firma Supervisor', MARGEN, alto - 14)
    doc.text('Firma Coordinador de Instalaciones', ancho - MARGEN, alto - 14, { align: 'right' })
    doc.text(
      `MillaOps Hub · Control de Instalaciones · Página ${i} de ${totalPaginas}`,
      ancho / 2,
      alto - 7,
      { align: 'center' },
    )
  }

  doc.setProperties({ title: opciones.nombreArchivo })
  return doc
}

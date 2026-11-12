import type { jsPDF } from 'jspdf'
import type { CellHook, UserOptions } from 'jspdf-autotable'
import type { OrigenCierre } from '../../types'

/** Fila lista para imprimir en la planilla de cierres. */
export interface FilaCierrePdf {
  orden: string
  ciudad: string
  barrio: string
  direccion?: string
  cliente?: string
  telefono?: string
  tipoServicio: string
  dias: number
  fechaCierre: string
  tecnicoSigma?: string
  operadorZona?: string
  origen: OrigenCierre
}

export interface OpcionesPdfCierres {
  notaFiltros?: string
  nombreArchivo: string
}

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

// 8 columnas · 194 mm útiles. Suma exacta:
// 10 + 16 + 36 + 34 + 32 + 20 + 25 + 21 = 194 mm
const ANCHOS_COLUMNAS: UserOptions['columnStyles'] = {
  0: { cellWidth: 10, halign: 'center' },
  1: { cellWidth: 16, textColor: COLOR_TEXTO_OSCURO },
  2: { cellWidth: 36 },
  3: { cellWidth: 34 },
  4: { cellWidth: 32 },
  5: { cellWidth: 20 },
  6: { cellWidth: 25 },
  7: { cellWidth: 21 },
}

const CABECERAS = [
  'Días',
  'Orden #',
  'Barrio / Dirección',
  'Cliente / Teléfono',
  'Servicio',
  'Cierre',
  'Técnico Sigma',
  'Auditor',
]

const ESTILOS_CUERPO: UserOptions['styles'] = {
  fontSize: 7,
  cellPadding: { top: 1.4, bottom: 1.4, left: 1.5, right: 1.5 },
  overflow: 'linebreak',
  valign: 'middle',
  lineColor: COLOR_BORDE,
  lineWidth: 0.2,
}

const ESTILOS_HEAD: UserOptions['headStyles'] = {
  fillColor: COLOR_NAVY,
  textColor: [255, 255, 255],
  fontStyle: 'bold',
  fontSize: 7,
  valign: 'middle',
}

function formatearFecha(fecha: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${pad(
    fecha.getHours(),
  )}:${pad(fecha.getMinutes())}`
}

/** `2026-11-09` → `09/11` (compacto para la columna de cierre). */
function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return anio && mes && dia ? `${dia}/${mes}` : iso
}

function textoAuditor(origen: OrigenCierre): string {
  if (origen === 'titular') return 'Titular'
  if (origen === 'externo') return 'Externo'
  return 'Sin dueno'
}

function dibujarEncabezado(
  doc: jsPDF,
  filas: FilaCierrePdf[],
  opciones: OpcionesPdfCierres,
): void {
  const ancho = doc.internal.pageSize.getWidth()
  const ciudades = [...new Set(filas.map((f) => f.ciudad))].sort((a, b) => a.localeCompare(b))
  const titulares = filas.filter((f) => f.origen === 'titular').length
  const externos = filas.filter((f) => f.origen === 'externo').length
  const fechas = [...new Set(filas.map((f) => f.fechaCierre))].sort()

  doc.setFillColor(...COLOR_NAVY)
  doc.rect(0, 0, ancho, ALTO_BANDA, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('AUDITORIA DE CIERRES TECNICOS', MARGEN, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(148, 163, 184)
  doc.text('MillaOps Hub', ancho - MARGEN, 13, { align: 'right' })

  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(`Ciudad(es): ${ciudades.join(', ') || 'Todas'}`, MARGEN, 21)
  doc.text(`Cierres: ${filas.length}`, MARGEN, 27)
  if (fechas.length > 0) {
    doc.text(
      `Periodo: ${fechaCorta(fechas[0]!)}${fechas.length > 1 ? ` al ${fechaCorta(fechas[fechas.length - 1]!)}` : ''}`,
      MARGEN,
      33,
    )
  }

  doc.text(`Generado: ${formatearFecha(new Date())}`, ancho - MARGEN, 21, { align: 'right' })
  doc.text(`Titular: ${titulares}`, ancho - MARGEN, 27, { align: 'right' })
  doc.text(`Externo/Tercero: ${externos}`, ancho - MARGEN, 33, { align: 'right' })

  if (opciones.notaFiltros) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(203, 213, 225)
    doc.text(opciones.notaFiltros, ancho - MARGEN, 36.5, { align: 'right' })
  }

  const anchoUtil = ancho - 2 * MARGEN
  const separacion = 4
  const boxW = (anchoUtil - separacion * 2) / 3
  const kpis: {
    titulo: string
    valor: number
    fondo: [number, number, number]
    borde: [number, number, number]
    texto: [number, number, number]
  }[] = [
    { titulo: 'TOTAL CIERRES', valor: filas.length, fondo: [241, 245, 249], borde: [203, 213, 225], texto: COLOR_NAVY },
    { titulo: 'POR EL TITULAR', valor: titulares, fondo: [240, 253, 244], borde: [187, 247, 208], texto: COLOR_VERDE },
    { titulo: 'EXTERNO / TERCERO', valor: externos, fondo: [254, 242, 242], borde: [254, 202, 202], texto: COLOR_ROJO },
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

/** Semáforo del tiempo de ciclo (días que tardó la orden en cerrarse). */
const colorearDias: CellHook = (data) => {
  if (data.section !== 'body' || data.column.index !== 0) return
  const dias = Number(data.cell.raw) || 0
  data.cell.styles.halign = 'center'
  data.cell.styles.valign = 'middle'
  data.cell.styles.fontStyle = 'bold'

  if (dias <= 1) {
    data.cell.styles.fillColor = COLOR_VERDE
    data.cell.styles.textColor = [255, 255, 255]
  } else if (dias <= 3) {
    data.cell.styles.fillColor = COLOR_AMARILLO
    data.cell.styles.textColor = [15, 23, 42]
  } else {
    data.cell.styles.fillColor = COLOR_ROJO
    data.cell.styles.textColor = [255, 255, 255]
  }
}

/** Colorea el badge de auditor: verde = titular, rojo = externo. */
const colorearAuditor: CellHook = (data) => {
  if (data.section !== 'body' || data.column.index !== 7) return
  const texto = String(data.cell.raw ?? '')
  data.cell.styles.fontStyle = 'bold'
  if (texto.startsWith('Titular')) data.cell.styles.textColor = COLOR_VERDE
  else if (texto.startsWith('Externo')) data.cell.styles.textColor = COLOR_ROJO
  else data.cell.styles.textColor = COLOR_AMBER
}

/**
 * Genera la planilla PDF de cierres respetando filtros y orden de pantalla.
 * Las dependencias pesadas se cargan dinámicamente.
 */
export async function generarPlanillaCierres(
  filas: FilaCierrePdf[],
  opciones: OpcionesPdfCierres,
): Promise<jsPDF> {
  if (filas.length === 0) {
    throw new Error('No hay cierres para exportar con los filtros seleccionados.')
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
    body: filas.map((f) => [
      String(f.dias),
      f.orden,
      [f.barrio || '—', f.direccion || ''].filter(Boolean).join('\n'),
      [f.cliente || 'SIN NOMBRE', f.telefono ? `Tel: ${f.telefono}` : 'Tel: s/r']
        .filter(Boolean)
        .join('\n'),
      f.tipoServicio,
      fechaCorta(f.fechaCierre),
      f.tecnicoSigma || 's/r',
      textoAuditor(f.origen),
    ]),
    margin: { left: MARGEN_TABLA, right: MARGEN_TABLA, bottom: 22 },
    rowPageBreak: 'avoid',
    styles: ESTILOS_CUERPO,
    headStyles: ESTILOS_HEAD,
    alternateRowStyles: { fillColor: COLOR_ROW_ALT },
    columnStyles: ANCHOS_COLUMNAS,
    didParseCell: (data) => {
      colorearDias(data)
      colorearAuditor(data)
    },
  })

  const totalPaginas = doc.getNumberOfPages()
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i)
    doc.setDrawColor(...COLOR_BORDE)
    doc.setLineWidth(0.2)
    doc.line(MARGEN, alto - 18, ancho - MARGEN, alto - 18)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...COLOR_SLATE)
    doc.text('Firma Supervisor', MARGEN, alto - 12)
    doc.text('Firma Coordinador Técnico', ancho - MARGEN, alto - 12, { align: 'right' })
    doc.text(
      `MillaOps Hub · Cierres Técnicos · Página ${i} de ${totalPaginas}`,
      ancho / 2,
      alto - 6,
      { align: 'center' },
    )
  }

  doc.setProperties({ title: opciones.nombreArchivo })
  return doc
}

import type { jsPDF } from 'jspdf'
import type { UserOptions } from 'jspdf-autotable'
import { esCritica } from '../lib/sla'
import type { Servicio, Tecnico } from '../types'

/** Umbral único de "crítico": órdenes con más de 5 días (coherente con el SLA). */
export const UMBRAL_CRITICO = 5

export interface PlanillaTecnico {
  tecnico: Tecnico
  servicios: Servicio[]
}

export interface OpcionesPdf {
  soloCriticas: boolean
  ciudad: string
}

/** Adaptador sobre el predicado compartido para trabajar con `Servicio`. */
export function esServicioCritico(servicio: Servicio): boolean {
  return esCritica(servicio.dias_antiguedad)
}

// ---- Constantes de diseño (A4 en milímetros) ----
const MARGEN = 14
const Y_KPI = 40
const ALTO_KPI = 14
const Y_TABLA = 60
const ALTO_BANDA = 34

const COLOR_NAVY: [number, number, number] = [30, 41, 59] // #1e293b
const COLOR_ROW_ALT: [number, number, number] = [248, 250, 252] // #f8fafc
const COLOR_ROJO: [number, number, number] = [220, 38, 38] // #dc2626
const COLOR_SLATE: [number, number, number] = [100, 116, 139] // #64748b
const COLOR_BORDE: [number, number, number] = [226, 232, 240] // #e2e8f0

const CABECERAS = [
  'Orden #',
  'Barrio',
  'Dirección',
  'Tipo de Servicio',
  'Antigüedad (Días)',
  'Firma / Recibido Cliente',
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
  const criticas = servicios.filter(esServicioCritico).length
  const fecha = formatearFecha(new Date())

  // Banda superior institucional
  doc.setFillColor(...COLOR_NAVY)
  doc.rect(0, 0, ancho, ALTO_BANDA, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('PLANILLA TÉCNICA DE DESPACHO', MARGEN, 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Técnico: ${tecnico.nombre}`, MARGEN, 21)
  doc.text(`Teléfono: ${tecnico.telefono ?? 'No registrado'}`, MARGEN, 27)

  doc.text(`Generado: ${fecha}`, ancho - MARGEN, 21, { align: 'right' })
  doc.text(`Ciudad: ${opciones.ciudad || 'Todas'}`, ancho - MARGEN, 27, { align: 'right' })

  // KPIs en cabecera
  const anchoUtil = ancho - 2 * MARGEN
  const boxW = (anchoUtil - 6) / 2

  doc.setFillColor(241, 245, 249)
  doc.roundedRect(MARGEN, Y_KPI, boxW, ALTO_KPI, 2, 2, 'F')
  doc.setTextColor(...COLOR_NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('TOTAL ÓRDENES ASIGNADAS', MARGEN + 4, Y_KPI + 5.5)
  doc.setFontSize(13)
  doc.text(String(servicios.length), MARGEN + 4, Y_KPI + 12)

  doc.setFillColor(254, 242, 242)
  doc.roundedRect(MARGEN + boxW + 6, Y_KPI, boxW, ALTO_KPI, 2, 2, 'F')
  doc.setTextColor(...COLOR_ROJO)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text(`CRÍTICAS (>${UMBRAL_CRITICO} DÍAS)`, MARGEN + boxW + 10, Y_KPI + 5.5)
  doc.setFontSize(13)
  doc.text(String(criticas), MARGEN + boxW + 10, Y_KPI + 12)
}

/** Dibuja la tabla de órdenes de una planilla. */
function dibujarTabla(
  doc: jsPDF,
  servicios: Servicio[],
  autoTable: (doc: jsPDF, opciones: UserOptions) => void,
): void {
  const filaCritica = servicios.map(esServicioCritico)

  autoTable(doc, {
    startY: Y_TABLA,
    head: [CABECERAS],
    body: servicios.map((s) => [
      s.numero_orden,
      s.barrio,
      s.direccion ?? '',
      s.tipo_servicio,
      String(s.dias_antiguedad),
      '',
    ]),
    margin: { top: 15, left: MARGEN, right: MARGEN, bottom: 32 },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'middle',
      lineColor: COLOR_BORDE,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: COLOR_NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: COLOR_ROW_ALT },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 30 },
      2: { cellWidth: 46 },
      3: { cellWidth: 28 },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 34, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      if (filaCritica[data.row.index]) {
        data.cell.styles.textColor = COLOR_ROJO
        data.cell.styles.fontStyle = 'bold'
      }
    },
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
    doc.line(MARGEN, alto - 30, ancho - MARGEN, alto - 30)

    doc.setDrawColor(...COLOR_SLATE)
    doc.setLineWidth(0.3)
    doc.line(MARGEN, alto - 22, mitad - 12, alto - 22)
    doc.line(mitad + 12, alto - 22, ancho - MARGEN, alto - 22)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...COLOR_SLATE)
    doc.text('Firma Supervisor', MARGEN, alto - 17)
    doc.text('Firma Técnico', mitad + 12, alto - 17)

    doc.text(`Página ${i} de ${totalPaginas}`, mitad, alto - 8, { align: 'center' })
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
    .map((grupo) => ({
      tecnico: grupo.tecnico,
      servicios: opciones.soloCriticas ? grupo.servicios.filter(esServicioCritico) : grupo.servicios,
    }))
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
  return doc
}

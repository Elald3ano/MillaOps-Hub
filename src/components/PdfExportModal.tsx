import { useMemo, useState } from 'react'
import { FileDown, Layers, MapPin, Users } from 'lucide-react'
import { format } from 'date-fns'
import { Modal } from './Modal'
import { esCritica } from '../lib/sla'
import type { PlanillaTecnico } from '../services/pdfGenerator'
import { CIUDADES_SUGERIDAS } from '../lib/sla'
import { cn } from '../lib/utils'
import type { Servicio, Tecnico } from '../types'
import type { ToastVariant } from './ToastContainer'

interface PdfExportModalProps {
  abierto: boolean
  onCerrar: () => void
  servicios: Servicio[]
  tecnicos: Tecnico[]
  notificar: (mensaje: string, variant?: ToastVariant) => void
}

type Modo = 'consolidado' | 'especifico'

/** Modal de exportación de planillas de trabajo en PDF. */
export function PdfExportModal({
  abierto,
  onCerrar,
  servicios,
  tecnicos,
  notificar,
}: PdfExportModalProps) {
  const [modo, setModo] = useState<Modo>('consolidado')
  const [tecnicoId, setTecnicoId] = useState('')
  const [soloCriticas, setSoloCriticas] = useState(false)
  const [ciudad, setCiudad] = useState('')
  const [generando, setGenerando] = useState(false)

  // Ciudad más frecuente entre las órdenes abiertas (para el encabezado).
  const ciudadPredeterminada = useMemo(() => {
    const conteo = new Map<string, number>()
    for (const s of servicios) conteo.set(s.ciudad, (conteo.get(s.ciudad) ?? 0) + 1)
    let mejor = ''
    let max = 0
    for (const [c, n] of conteo) {
      if (n > max) {
        max = n
        mejor = c
      }
    }
    return mejor
  }, [servicios])

  // Agrupa las órdenes abiertas por técnico (solo técnicos con asignación).
  const grupos = useMemo<PlanillaTecnico[]>(() => {
    const conTecnico = servicios.filter((s) => s.tecnico_id !== null)
    const tecnicosConOrdenes = tecnicos
      .filter((t) => conTecnico.some((s) => s.tecnico_id === t.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
    return tecnicosConOrdenes
      .map((t) => ({
        tecnico: t,
        servicios: conTecnico.filter((s) => s.tecnico_id === t.id),
      }))
      .filter((g) => g.servicios.length > 0)
  }, [servicios, tecnicos])

  const totalOrdenes = grupos.reduce((acc, g) => acc + g.servicios.length, 0)
  const totalCriticas = grupos.reduce((acc, g) => acc + g.servicios.filter((s) => esCritica(s.dias_antiguedad)).length, 0)

  const seleccionActual =
    modo === 'especifico'
      ? grupos.find((g) => g.tecnico.id === tecnicoId)
      : undefined

  const ordenesSeleccionadas = seleccionActual ? seleccionActual.servicios.length : totalOrdenes
  const criticasSeleccionadas = seleccionActual
    ? seleccionActual.servicios.filter((s) => esCritica(s.dias_antiguedad)).length
    : totalCriticas
  // Órdenes que efectivamente se exportarán (aplicando el filtro de críticas).
  const ordenesAExportar = soloCriticas ? criticasSeleccionadas : ordenesSeleccionadas

  async function generar() {
    if (modo === 'especifico' && !tecnicoId) {
      notificar('Selecciona un técnico para exportar.', 'error')
      return
    }
    setGenerando(true)
    try {
      const { generarPlanillaPdf } = await import('../services/pdfGenerator')
      const gruposAExportar =
        modo === 'especifico' ? grupos.filter((g) => g.tecnico.id === tecnicoId) : grupos
      const doc = await generarPlanillaPdf(gruposAExportar, {
        soloCriticas,
        ciudad: ciudad.trim() || ciudadPredeterminada,
      })
      doc.save(`planilla-despacho-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`)
      notificar('Planilla PDF generada correctamente.', 'success')
      onCerrar()
    } catch (error) {
      notificar(error instanceof Error ? error.message : 'No se pudo generar el PDF.', 'error')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Exportar Planilla de Despacho"
      descripcion="Genera un PDF operativo por técnico o consolidado."
      anchoMaximo="max-w-lg"
      footer={
        <>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void generar()}
            disabled={generando || totalOrdenes === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <FileDown className="size-4" />
            {generando ? 'Generando…' : 'Generar PDF'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Modo */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setModo('consolidado')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition',
              modo === 'consolidado'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            <Users className="size-4" /> Consolidado
          </button>
          <button
            type="button"
            onClick={() => setModo('especifico')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition',
              modo === 'especifico'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            <Layers className="size-4" /> Técnico específico
          </button>
        </div>

        {/* Selector de técnico (modo específico) */}
        {modo === 'especifico' && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Técnico</span>
            <select
              value={tecnicoId}
              onChange={(e) => setTecnicoId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">Selecciona un técnico…</option>
              {grupos.map((g) => (
                <option key={g.tecnico.id} value={g.tecnico.id}>
                  {g.tecnico.nombre} ({g.servicios.length})
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Ciudad */}
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <MapPin className="size-3.5" /> Ciudad (encabezado del PDF)
          </span>
          <input
            list="ciudades-pdf"
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
            placeholder={ciudadPredeterminada || 'Todas'}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
          <datalist id="ciudades-pdf">
            {CIUDADES_SUGERIDAS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        {/* Filtro críticas */}
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2.5">
          <span className="text-sm text-slate-700">Incluir solo órdenes críticas (+5 días)</span>
          <span className="relative inline-flex shrink-0 items-center">
            <input
              type="checkbox"
              checked={soloCriticas}
              onChange={(e) => setSoloCriticas(e.target.checked)}
              className="peer sr-only"
            />
            <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-slate-900" />
            <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
          </span>
        </label>

        {/* Resumen */}
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Resumen</p>
          <div className="mt-2 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">
                {modo === 'especifico' ? (seleccionActual ? 1 : 0) : grupos.length}
              </p>
              <p className="text-[11px] text-slate-500">Técnico(s)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{ordenesAExportar}</p>
              <p className="text-[11px] text-slate-500">Órdenes a exportar</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600 tabular-nums">
                {criticasSeleccionadas}
              </p>
              <p className="text-[11px] text-slate-500">Críticas (+5d)</p>
            </div>
          </div>
        </div>

        {totalOrdenes === 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
            No hay órdenes con técnico asignado para exportar.
          </p>
        )}
      </div>
    </Modal>
  )
}

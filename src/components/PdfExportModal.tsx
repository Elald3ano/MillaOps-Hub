import { useMemo, useState } from 'react'
import { FileDown, Layers, MapPin, Users } from 'lucide-react'
import { Modal } from './Modal'
import { conRetraso } from '../lib/sla'
import type { PlanillaTecnico } from '../services/pdfGenerator'
import { limpiarTexto } from '../lib/normalizer'
import { cn } from '../lib/utils'
import type { Servicio, Tecnico } from '../types'
import type { ToastVariant } from './ToastContainer'

interface PdfExportModalProps {
  abierto: boolean
  onCerrar: () => void
  servicios: Servicio[]
  tecnicos: Tecnico[]
  /** Ciudad actualmente filtrada en la tabla (para pre-seleccionarla). */
  ciudadInicial?: string
  notificar: (mensaje: string, variant?: ToastVariant) => void
}

type Modo = 'consolidado' | 'especifico'

const TODAS = 'todas'

/** Modal de exportación de planillas de trabajo en PDF. */
export function PdfExportModal({
  abierto,
  onCerrar,
  servicios,
  tecnicos,
  ciudadInicial,
  notificar,
}: PdfExportModalProps) {
  const [modo, setModo] = useState<Modo>('consolidado')
  const [tecnicoId, setTecnicoId] = useState('')
  const [soloCriticas, setSoloCriticas] = useState(false)
  const [ciudad, setCiudad] = useState(() =>
    ciudadInicial && ciudadInicial !== TODAS ? ciudadInicial : TODAS,
  )
  const [generando, setGenerando] = useState(false)

  // Ciudades presentes en el despacho, con su conteo real de órdenes.
  const opcionesCiudad = useMemo(() => {
    const conteo = new Map<string, { nombre: string; total: number }>()
    for (const s of servicios) {
      const clave = limpiarTexto(s.ciudad)
      const actual = conteo.get(clave)
      if (actual) actual.total++
      else conteo.set(clave, { nombre: s.ciudad, total: 1 })
    }
    return [...conteo.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [servicios])

  // Conjunto de datos filtrado por ciudad (base para TODO el cálculo posterior).
  const serviciosDeCiudad = useMemo(() => {
    if (ciudad === TODAS) return servicios
    const objetivo = limpiarTexto(ciudad)
    return servicios.filter((s) => limpiarTexto(s.ciudad) === objetivo)
  }, [servicios, ciudad])

  // Agrupa por técnico, SOLO técnicos con órdenes en la ciudad seleccionada.
  const grupos = useMemo<PlanillaTecnico[]>(() => {
    const conTecnico = serviciosDeCiudad.filter((s) => s.tecnico_id !== null)
    return tecnicos
      .filter((t) => conTecnico.some((s) => s.tecnico_id === t.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map((t) => ({
        tecnico: t,
        servicios: conTecnico.filter((s) => s.tecnico_id === t.id),
      }))
      .filter((g) => g.servicios.length > 0)
  }, [serviciosDeCiudad, tecnicos])

  const totalOrdenes = grupos.reduce((acc, g) => acc + g.servicios.length, 0)
  const totalConRetraso = serviciosDeCiudad.filter(
    (s) => s.tecnico_id !== null && conRetraso(s.dias_antiguedad),
  ).length

  // El técnico seleccionado puede dejar de existir al cambiar de ciudad.
  const seleccionActual =
    modo === 'especifico' ? grupos.find((g) => g.tecnico.id === tecnicoId) : undefined

  const ordenesSeleccionadas = seleccionActual ? seleccionActual.servicios.length : totalOrdenes
  const conRetrasoSeleccionadas = seleccionActual
    ? seleccionActual.servicios.filter((s) => conRetraso(s.dias_antiguedad)).length
    : totalConRetraso
  // Órdenes que efectivamente se exportarán (aplicando el filtro de retraso).
  const ordenesAExportar = soloCriticas ? conRetrasoSeleccionadas : ordenesSeleccionadas

  function cambiarCiudad(valor: string) {
    setCiudad(valor)
    // Si el técnico elegido no tiene órdenes en la nueva ciudad, se limpia.
    if (modo === 'especifico' && tecnicoId) {
      const objetivo = valor === TODAS ? null : limpiarTexto(valor)
      const sigueDisponible = servicios.some(
        (s) =>
          (objetivo === null || limpiarTexto(s.ciudad) === objetivo) &&
          s.tecnico_id === tecnicoId,
      )
      if (!sigueDisponible) setTecnicoId('')
    }
  }

  async function generar() {
    if (modo === 'especifico' && !tecnicoId) {
      notificar('Selecciona un técnico para exportar.', 'error')
      return
    }
    if (grupos.length === 0) {
      notificar('No hay órdenes con técnico asignado en la ciudad seleccionada.', 'error')
      return
    }
    setGenerando(true)
    try {
      const { generarPlanillaPdf, nombrePlanillaPdf } = await import('../services/pdfGenerator')
      const gruposAExportar =
        modo === 'especifico' ? grupos.filter((g) => g.tecnico.id === tecnicoId) : grupos
      const ciudadEtiqueta = ciudad === TODAS ? 'Consolidado Regional' : ciudad
      const doc = await generarPlanillaPdf(gruposAExportar, {
        soloCriticas,
        ciudad: ciudadEtiqueta,
      })
      doc.save(nombrePlanillaPdf(gruposAExportar, ciudadEtiqueta))
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

        {/* Ciudad (filtro funcional) */}
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <MapPin className="size-3.5" /> Ciudad
          </span>
          <select
            value={ciudad}
            onChange={(e) => cambiarCiudad(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          >
            <option value={TODAS}>Todas las ciudades (Consolidado Regional)</option>
            {opcionesCiudad.map(({ nombre, total }) => (
              <option key={nombre} value={nombre}>
                {nombre} ({total})
              </option>
            ))}
          </select>
        </label>

        {/* Filtro de retraso */}
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2.5">
          <span className="text-sm text-slate-700">
            Incluir solo órdenes con retraso (2+ días)
          </span>
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
                {conRetrasoSeleccionadas}
              </p>
              <p className="text-[11px] text-slate-500">Con retraso (2+ d)</p>
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

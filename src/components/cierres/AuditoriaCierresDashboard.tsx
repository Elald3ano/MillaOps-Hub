import { useRef, useState, type ChangeEvent } from 'react'
import { FileSpreadsheet, Loader2, Play, TrendingUp, Trash2 } from 'lucide-react'
import type { ReglaConTecnico, Servicio, ServicioNuevo } from '../../types'
import type { ToastVariant } from '../ToastContainer'
import {
  calcularCierres,
  type ResultadoCierres,
} from '../../services/reconciliationService'
import { cn } from '../../lib/utils'
import { RankingCierres } from './RankingCierres'
import { RadiografiaCierres } from './RadiografiaCierres'
import { BalanceNetoSucursales } from './BalanceNetoSucursales'
import { AlertasRendimiento } from './AlertasRendimiento'

interface AuditoriaCierresDashboardProps {
  serviciosActivos: Servicio[]
  reglas: ReglaConTecnico[]
  notificar: (mensaje: string, variant?: ToastVariant) => void
  // Estado levantado a App para persistir entre pestañas.
  resultado: ResultadoCierres | null
  onResultado: (r: ResultadoCierres | null) => void
  corteAyerNombre: string
  corteHoyNombre: string
  onCorteAyerNombre: (s: string) => void
  onCorteHoyNombre: (s: string) => void
}

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** Convierte servicios recién parseados (sin id) en `Servicio` con ids sintéticos. */
function convertirAServicios(nuevos: ServicioNuevo[], prefijo: string): Servicio[] {
  return nuevos.map((s, i) => ({
    ...s,
    id: `${prefijo}-${i}-${s.numero_orden}`,
    lote_id: `corte-${prefijo}`,
  }))
}

/** Dropzone oscura compacta para subir el Excel de un corte. */
function Dropzone({
  archivo,
  onArchivo,
  deshabilitado,
}: {
  archivo: File | null
  onArchivo: (f: File | null) => void
  deshabilitado?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) onArchivo(f)
    e.target.value = ''
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !deshabilitado && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !deshabilitado) inputRef.current?.click()
        }}
        className={cn(
          'flex min-h-[68px] cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed px-3 py-2 text-left transition',
          deshabilitado ? 'pointer-events-none opacity-50' : 'hover:bg-white/5',
          archivo
            ? 'border-emerald-400/50 bg-emerald-500/5'
            : 'border-white/15 bg-white/5',
        )}
      >
        <FileSpreadsheet
          className={cn('size-5 shrink-0', archivo ? 'text-emerald-300' : 'text-slate-500')}
        />
        <div className="min-w-0">
          {archivo ? (
            <>
              <p className="truncate text-xs font-medium text-slate-200">{archivo.name}</p>
              <p className="text-[10px] text-slate-500">{formatearTamano(archivo.size)}</p>
            </>
          ) : (
            <p className="text-xs text-slate-400">Arrastra o haz clic para subir .xlsx</p>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="sr-only"
        onChange={handleChange}
        disabled={deshabilitado}
      />
      {archivo && (
        <button
          type="button"
          onClick={() => onArchivo(null)}
          disabled={deshabilitado}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 transition hover:text-slate-200 disabled:opacity-50"
        >
          <Trash2 className="size-3" /> Quitar
        </button>
      )}
    </div>
  )
}

/** Auditoría de cierres y rendimiento: compara dos cortes en el tiempo. */
export function AuditoriaCierresDashboard({
  serviciosActivos,
  reglas,
  notificar,
  resultado,
  onResultado,
  corteAyerNombre,
  corteHoyNombre,
  onCorteAyerNombre,
  onCorteHoyNombre,
}: AuditoriaCierresDashboardProps) {
  const [archivoAyer, setArchivoAyer] = useState<File | null>(null)
  const [usarDespachoActivo, setUsarDespachoActivo] = useState(true)
  const [archivoHoy, setArchivoHoy] = useState<File | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [tecnicoSeleccionadoId, setTecnicoSeleccionadoId] = useState<string | null>(null)

  const tecnicoSeleccionado = resultado?.metricasPorTecnico.find(
    (m) => m.tecnicoId === tecnicoSeleccionadoId,
  )
  const cerradosDelTecnico =
    resultado && tecnicoSeleccionadoId
      ? resultado.cerrados.filter((s) => s.tecnico_id === tecnicoSeleccionadoId)
      : []

  async function auditar() {
    if (!archivoAyer) {
      notificar('Sube el archivo del corte anterior (Ayer) para auditar.', 'error')
      return
    }
    if (!usarDespachoActivo && !archivoHoy) {
      notificar('Selecciona el archivo del corte actual (Hoy) o usa el despacho activo.', 'error')
      return
    }
    setProcesando(true)
    try {
      const { parseServiciosExcel } = await import('../../services/excelParser')

      const ayerNuevos = await parseServiciosExcel(archivoAyer)
      const ayerServicios = convertirAServicios(ayerNuevos, 'ayer')

      let hoyServicios: Servicio[]
      if (usarDespachoActivo) {
        hoyServicios = serviciosActivos
        onCorteHoyNombre('Despacho activo')
      } else {
        const hoyNuevos = await parseServiciosExcel(archivoHoy as File)
        hoyServicios = convertirAServicios(hoyNuevos, 'hoy')
        onCorteHoyNombre(archivoHoy?.name ?? '')
      }
      onCorteAyerNombre(archivoAyer.name)

      const res = calcularCierres(ayerServicios, hoyServicios, reglas)
      onResultado(res)
      setTecnicoSeleccionadoId(null)
      notificar(
        `Auditoría completada: ${res.cerrados.length} cerrados y ${res.nuevos.length} nuevos.`,
        'success',
      )
    } catch (error) {
      notificar(
        error instanceof Error ? error.message : 'No se pudo auditar los cierres.',
        'error',
      )
    } finally {
      setProcesando(false)
    }
  }

  function toggleTecnico(id: string) {
    setTecnicoSeleccionadoId((prev) => (prev === id ? null : id))
  }

  return (
    <section className="space-y-4">
      {/* Barra superior de control */}
      <div className="rounded-2xl bg-slate-900 p-4 text-white shadow-lg ring-1 ring-white/10">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <TrendingUp className="size-5 text-emerald-300" />
          </span>
          <div>
            <h2 className="text-base font-bold tracking-tight">
              Auditoría de Cierres y Rendimiento
            </h2>
            <p className="text-xs text-slate-400">
              Compara dos cortes en el tiempo para medir cierres y productividad
            </p>
          </div>
        </div>

        {/* Zonas de carga */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <p className="mb-2 text-xs font-semibold text-slate-300">Corte Anterior (Ayer)</p>
            <Dropzone
              archivo={archivoAyer}
              onArchivo={setArchivoAyer}
              deshabilitado={procesando}
            />
          </div>

          <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-300">Corte Actual (Hoy)</p>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={usarDespachoActivo}
                  onChange={(e) => setUsarDespachoActivo(e.target.checked)}
                  disabled={procesando}
                  className="size-3.5 accent-emerald-500"
                />
                Usar despacho activo
              </label>
            </div>
            {usarDespachoActivo ? (
              <div className="flex min-h-[68px] items-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-white/5 px-3 py-2">
                <FileSpreadsheet className="size-5 shrink-0 text-slate-500" />
                <p className="text-xs text-slate-400">
                  {serviciosActivos.length} órdenes cargadas en el despacho activo
                </p>
              </div>
            ) : (
              <Dropzone
                archivo={archivoHoy}
                onArchivo={setArchivoHoy}
                deshabilitado={procesando}
              />
            )}
          </div>
        </div>

        {/* Acción y chips resumen */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void auditar()}
            disabled={procesando}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {procesando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Auditar Cierres
          </button>

          {resultado && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                Total {resultado.cerrados.length} servicios cerrados
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-300 ring-1 ring-sky-500/30">
                {resultado.nuevos.length} nuevos ingresos
              </span>
              <span className="text-[11px] text-slate-500">
                {corteAyerNombre || 'Ayer'} → {corteHoyNombre || 'Hoy'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Layout asimétrico: izquierda (ranking + balance + alertas) y derecha sticky (radiografía) */}
      {resultado ? (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-5">
            <RankingCierres
              metricas={resultado.metricasPorTecnico}
              cerrados={resultado.cerrados}
              tecnicoSeleccionadoId={tecnicoSeleccionadoId}
              onSeleccionarTecnico={toggleTecnico}
            />
            <BalanceNetoSucursales balance={resultado.balancePorCiudad} />
            <AlertasRendimiento
              metricas={resultado.metricasPorTecnico}
              cerrados={resultado.cerrados}
            />
          </div>

          <div className="lg:col-span-7 lg:sticky lg:top-24">
            <RadiografiaCierres
              tecnicoId={tecnicoSeleccionado?.tecnicoId ?? null}
              tecnicoNombre={tecnicoSeleccionado?.nombre ?? null}
              cerrados={cerradosDelTecnico}
              onVerGlobal={() => setTecnicoSeleccionadoId(null)}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
          <TrendingUp className="size-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">
            Carga el corte anterior y pulsa «Auditar Cierres»
          </p>
          <p className="max-w-sm text-xs text-slate-400">
            La auditoría compara el archivo de Ayer contra el despacho activo (Hoy) para detectar
            servicios cerrados, nuevos ingresos y medir la productividad por técnico.
          </p>
        </div>
      )}
    </section>
  )
}

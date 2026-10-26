import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Database, FileText, Layers, RefreshCw, ShieldCheck, ShieldAlert, SlidersHorizontal, WifiOff } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { FileUpload } from './components/FileUpload'
import { MetricCards } from './components/MetricCards'
import { ServiceTable } from './components/ServiceTable'
import { ToastContainer, type Toast, type ToastVariant } from './components/ToastContainer'
import { RulesManagerModal } from './components/RulesManagerModal'
import { PdfExportModal } from './components/PdfExportModal'
import { aplicarMatrizAsignacion } from './services/assignmentEngine'
import { calcularDiferencialCerrados } from './services/reconciliationEngine'
import { isSupabaseConfigured } from './lib/supabase'
import {
  actualizarTecnicoServicio,
  getLoteLineaBase,
  getReglas,
  getServiciosCerrados,
  getTecnicos,
  guardarNuevoLote,
  marcarServiciosCerrados,
  setLoteLineaBase,
} from './services/supabaseService'
import type { LoteCarga, ReglaConTecnico, Servicio, Tecnico } from './types'
import { cn } from './lib/utils'

type EstadoConexion = 'conectando' | 'conectado' | 'error'

const MAX_TOASTS = 4

function App() {
  // Datos
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([])
  const [reglas, setReglas] = useState<ReglaConTecnico[]>([])
  const [loteActivo, setLoteActivo] = useState<LoteCarga | null>(null)
  const [serviciosAbiertos, setServiciosAbiertos] = useState<Servicio[]>([])
  const [serviciosCerrados, setServiciosCerrados] = useState<Servicio[]>([])

  // UI
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [conexion, setConexion] = useState<EstadoConexion>('conectando')
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const [matrizAbierta, setMatrizAbierta] = useState(false)
  const [pdfAbierto, setPdfAbierto] = useState(false)

  const notificar = useCallback((mensaje: string, variant: ToastVariant = 'info') => {
    const id = ++toastId.current
    setToasts((prev) => [...prev, { id, variant, mensaje }].slice(-MAX_TOASTS))
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  const descartarToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const refrescarReglas = useCallback(async () => {
    const reglasData = await getReglas()
    setReglas(reglasData)
  }, [])

  const cargarDatos = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true)
      // Sin credenciales válidas no se intenta consultar: la UI muestra un banner.
      if (!isSupabaseConfigured) {
        setConexion('error')
        setCargando(false)
        return
      }
      try {
        const [tecnicosData, reglasData, lineaBase, cerradosData] = await Promise.all([
          getTecnicos(),
          getReglas(),
          getLoteLineaBase(),
          getServiciosCerrados(),
        ])

        setTecnicos(tecnicosData)
        setReglas(reglasData)
        setServiciosCerrados(cerradosData)
        setLoteActivo(lineaBase?.lote ?? null)
        setServiciosAbiertos(lineaBase?.servicios ?? [])
        setConexion('conectado')
      } catch (error) {
        // Nunca se propaga: la app sigue montada y muestra el estado de error.
        setConexion('error')
        notificar(
          error instanceof Error ? error.message : 'No se pudieron cargar los datos iniciales.',
          'error',
        )
      } finally {
        setCargando(false)
      }
    },
    [notificar],
  )

  useEffect(() => {
    // Carga inicial desde Supabase: sincroniza con el sistema externo.
    // oxlint-disable-next-line react/set-state-in-effect
    void cargarDatos()
  }, [cargarDatos])

  const abiertos = useMemo(
    () => serviciosAbiertos.filter((s) => s.estado === 'ABIERTO'),
    [serviciosAbiertos],
  )

  const cerrados = useMemo(
    () => [...serviciosCerrados, ...serviciosAbiertos.filter((s) => s.estado === 'CERRADO')],
    [serviciosCerrados, serviciosAbiertos],
  )

  const handleReasignar = useCallback(
    async (servicioId: string, tecnicoId: string | null) => {
      // Actualización optimista + rollback ante error.
      const previos = serviciosAbiertos
      setServiciosAbiertos((prev) =>
        prev.map((s) => (s.id === servicioId ? { ...s, tecnico_id: tecnicoId } : s)),
      )
      try {
        await actualizarTecnicoServicio(servicioId, tecnicoId)
        const nombreTecnico = tecnicoId
          ? (tecnicos.find((t) => t.id === tecnicoId)?.nombre ?? 'Técnico')
          : 'Sin asignar'
        notificar(`Técnico actualizado: ${nombreTecnico}.`, 'success')
      } catch (error) {
        setServiciosAbiertos(previos)
        notificar(
          error instanceof Error ? error.message : 'No se pudo reasignar el técnico.',
          'error',
        )
      }
    },
    [serviciosAbiertos, tecnicos, notificar],
  )

  const handleProcesar = useCallback(
    async (file: File, ciudadFiltro: string | undefined, esLineaBase: boolean) => {
      setProcesando(true)
      const nombreLote = `${file.name.replace(/\.(xlsx|xls)$/i, '')} — ${format(new Date(), 'dd MMM yyyy HH:mm', { locale: es })}`

      try {
        // 1. Parseo del Excel (carga diferida: xlsx es un chunk pesado)
        const { parseServiciosExcel } = await import('./services/excelParser')
        const nuevos = await parseServiciosExcel(file, ciudadFiltro)
        if (nuevos.length === 0) {
          notificar(
            ciudadFiltro
              ? `No se encontraron servicios para la ciudad "${ciudadFiltro}".`
              : 'El archivo no contiene servicios válidos.',
            'error',
          )
          return
        }

        // 2. Asignación automática por cascada
        const asignados = aplicarMatrizAsignacion(nuevos, reglas)

        // 3. Reconciliación con la Línea Base actual
        const reciénCerrados = calcularDiferencialCerrados(abiertos, asignados)
        if (reciénCerrados.length > 0) {
          await marcarServiciosCerrados(reciénCerrados.map((s) => s.id))
        }

        // 4. Persistencia del nuevo lote
        const loteId = await guardarNuevoLote(
          nombreLote,
          new Date(),
          asignados,
          esLineaBase,
        )

        // 5. Si se pide, marcar como línea base activa
        if (esLineaBase) {
          await setLoteLineaBase(loteId)
        }

        // 6. Refrescar estado desde el servidor (ids reales, estados, etc.)
        await cargarDatos(true)

        const asignadosCount = asignados.filter((s) => s.tecnico_id !== null).length
        notificar(
          `Lote guardado: ${asignados.length} servicios (${asignadosCount} asignados, ` +
            `${reciénCerrados.length} cerrados).`,
          'success',
        )
      } catch (error) {
        notificar(
          error instanceof Error ? error.message : 'No se pudo procesar el archivo.',
          'error',
        )
      } finally {
        setProcesando(false)
      }
    },
    [reglas, abiertos, cargarDatos, notificar],
  )

  const conexionInfo =
    conexion === 'conectado'
      ? { label: 'Supabase conectado', icon: ShieldCheck, classes: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' }
      : conexion === 'error'
        ? { label: 'Sin conexión', icon: WifiOff, classes: 'bg-red-500/15 text-red-300 ring-red-500/30' }
        : { label: 'Conectando…', icon: ShieldAlert, classes: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' }

  const IconoConexion = conexionInfo.icon

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white shadow-lg shadow-slate-900/10">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
              <Layers className="size-5 text-emerald-300" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">TechDispatch Hub</h1>
              <p className="text-xs text-slate-400">Operación diaria de servicios técnicos</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Lote activo / Línea Base */}
            <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10">
              <Database className="size-4 shrink-0 text-slate-300" />
              <div className="min-w-0">
                <p className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
                  Línea Base activa
                </p>
                <p className="max-w-[16rem] truncate text-xs font-semibold">
                  {loteActivo ? loteActivo.nombre : 'Sin línea base'}
                </p>
              </div>
            </div>

            {/* Estado de conexión */}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ring-1',
                conexionInfo.classes,
              )}
              title={conexionInfo.label}
            >
              <IconoConexion className={cn('size-4', conexion === 'conectando' && 'animate-pulse')} />
              {conexionInfo.label}
            </span>

            <button
              type="button"
              onClick={() => setMatrizAbierta(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15"
            >
              <SlidersHorizontal className="size-4" />
              Gestionar Matriz
            </button>

            <button
              type="button"
              onClick={() => setPdfAbierto(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-400"
            >
              <FileText className="size-4" />
              Exportar PDF
            </button>

            <button
              type="button"
              onClick={() => void cargarDatos()}
              disabled={cargando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15 disabled:opacity-50"
            >
              <RefreshCw className={cn('size-4', cargando && 'animate-spin')} />
              Actualizar
            </button>
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6">
        {!isSupabaseConfigured && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
          >
            <ShieldAlert className="mt-0.5 size-5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">Supabase no está configurado</p>
              <p className="mt-0.5 text-amber-800">
                Copia <code className="rounded bg-amber-100 px-1 font-mono">.env.example</code> a{' '}
                <code className="rounded bg-amber-100 px-1 font-mono">.env</code> y define{' '}
                <code className="rounded bg-amber-100 px-1 font-mono">VITE_SUPABASE_URL</code> y{' '}
                <code className="rounded bg-amber-100 px-1 font-mono">VITE_SUPABASE_ANON_KEY</code>.
                Luego reinicia el servidor de desarrollo.
              </p>
            </div>
          </div>
        )}

        {cargando ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-500">
            <RefreshCw className="size-6 animate-spin" />
            <p className="text-sm">Cargando datos de Supabase…</p>
          </div>
        ) : (
          <>
            <MetricCards abiertos={abiertos} cerrados={cerrados} />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <ServiceTable
                abiertos={abiertos}
                cerrados={cerrados}
                tecnicos={tecnicos}
                onReasignar={handleReasignar}
              />
              <div className="xl:sticky xl:top-24 xl:self-start">
                <FileUpload procesando={procesando} onProcesar={handleProcesar} />
              </div>
            </div>
          </>
        )}
      </main>

      <RulesManagerModal
        abierto={matrizAbierta}
        onCerrar={() => setMatrizAbierta(false)}
        reglas={reglas}
        tecnicos={tecnicos}
        onCambio={refrescarReglas}
        notificar={notificar}
      />

      <PdfExportModal
        abierto={pdfAbierto}
        onCerrar={() => setPdfAbierto(false)}
        servicios={abiertos}
        tecnicos={tecnicos}
        notificar={notificar}
      />

      <ToastContainer toasts={toasts} onDismiss={descartarToast} />
    </div>
  )
}

export default App

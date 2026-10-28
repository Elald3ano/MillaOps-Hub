import { useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, Loader2, RefreshCw, Search, Trash2, UserRound } from 'lucide-react'
import { Modal } from './Modal'
import { eliminarRegla, importarMatrizDesdeExcel } from '../services/supabaseService'
import { cn } from '../lib/utils'
import type { ReglaConTecnico, Servicio } from '../types'
import type { ToastVariant } from './ToastContainer'

interface RulesManagerModalProps {
  abierto: boolean
  onCerrar: () => void
  reglas: ReglaConTecnico[]
  serviciosAbiertos: Servicio[]
  onCambio: () => Promise<void>
  notificar: (mensaje: string, variant?: ToastVariant) => void
  onReaplicar: () => void
}

const PRIORIDAD_LABELS: Record<number, string> = {
  1: 'Ciudad + Barrio + Servicio',
  2: 'Ciudad + Barrio',
  3: 'Ciudad',
}

const PRIORIDAD_BADGE: Record<number, string> = {
  1: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  2: 'bg-amber-50 text-amber-700 ring-amber-200',
  3: 'bg-slate-100 text-slate-600 ring-slate-200',
}

/** Modal para importar la matriz (Excel) y revisar el listado de reglas. */
export function RulesManagerModal({
  abierto,
  onCerrar,
  reglas,
  serviciosAbiertos,
  onCambio,
  notificar,
  onReaplicar,
}: RulesManagerModalProps) {
  const [busquedaRegla, setBusquedaRegla] = useState('')
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [resultadoImportacion, setResultadoImportacion] = useState<{
    tecnicosCreados: number
    reglasCreadas: number
  } | null>(null)
  const inputMatrizRef = useRef<HTMLInputElement>(null)

  const reglasFiltradas = useMemo(() => {
    const q = busquedaRegla.trim().toLowerCase()
    const ordenadas = [...reglas].sort(
      (a, b) => a.prioridad - b.prioridad || a.ciudad.localeCompare(b.ciudad),
    )
    if (!q) return ordenadas
    return ordenadas.filter(
      (r) =>
        r.ciudad.toLowerCase().includes(q) ||
        (r.barrio ?? '').toLowerCase().includes(q) ||
        (r.tipo_servicio ?? '').toLowerCase().includes(q) ||
        r.tecnico.nombre.toLowerCase().includes(q),
    )
  }, [reglas, busquedaRegla])

  async function handleEliminar(id: string) {
    setEliminandoId(id)
    try {
      await eliminarRegla(id)
      await onCambio()
      notificar('Regla eliminada.', 'success')
    } catch (e) {
      notificar(e instanceof Error ? e.message : 'No se pudo eliminar la regla.', 'error')
    } finally {
      setEliminandoId(null)
    }
  }

  async function handleImportarArchivo(file: File) {
    setImportando(true)
    setResultadoImportacion(null)
    try {
      // xlsx es pesado: se importa bajo demanda.
      const { parsearMatrizExcel } = await import('../services/excelParser')
      const filas = await parsearMatrizExcel(file)
      if (filas.length === 0) {
        notificar('No se encontraron filas válidas en la matriz.', 'error')
        return
      }
      const resultado = await importarMatrizDesdeExcel(filas)
      await onCambio()
      setResultadoImportacion(resultado)
      notificar(
        `${resultado.tecnicosCreados} técnicos y ${resultado.reglasCreadas} reglas importadas con éxito.`,
        'success',
      )
    } catch (e) {
      notificar(e instanceof Error ? e.message : 'No se pudo importar la matriz.', 'error')
    } finally {
      setImportando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Gestionar Matriz de Asignación"
      descripcion="Importa la matriz por Excel o revisa las reglas activas."
      anchoMaximo="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Importación masiva */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Importación masiva de matriz</p>
              <p className="text-xs text-slate-500">
                Lee columnas [Sucursal, Barrio, TECNICO] y, opcionalmente, tipo de servicio.
              </p>
            </div>
            <input
              ref={inputMatrizRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={importando}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleImportarArchivo(file)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => inputMatrizRef.current?.click()}
              disabled={importando}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-4" />
              )}
              Importar Matriz (Excel)
            </button>
          </div>

          {resultadoImportacion && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium text-emerald-800">
                {resultadoImportacion.tecnicosCreados} técnicos y{' '}
                {resultadoImportacion.reglasCreadas} reglas importadas con éxito.
              </p>
              <button
                type="button"
                onClick={onReaplicar}
                disabled={serviciosAbiertos.length === 0}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="size-3.5" />
                Re-aplicar a Servicios en Pantalla
              </button>
            </div>
          )}
        </div>

        {/* Listado de reglas */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Reglas activas ({reglas.length})
            </p>
            <div className="relative w-56">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busquedaRegla}
                onChange={(e) => setBusquedaRegla(e.target.value)}
                placeholder="Buscar regla…"
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>

          {reglasFiltradas.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
              {reglas.length === 0
                ? 'Aún no hay reglas. Importa la matriz o usa Gestión Territorial.'
                : 'Ninguna regla coincide con la búsqueda.'}
            </p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {reglasFiltradas.map((regla) => (
                <li
                  key={regla.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1',
                          PRIORIDAD_BADGE[regla.prioridad],
                        )}
                      >
                        P{regla.prioridad}
                      </span>
                      <span className="truncate text-sm font-medium text-slate-800">
                        {regla.ciudad}
                        {regla.barrio ? ` · ${regla.barrio}` : ''}
                        {regla.tipo_servicio ? ` · ${regla.tipo_servicio}` : ''}
                      </span>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <UserRound className="size-3" />
                      {regla.tecnico.nombre}
                      <span className="text-slate-400">
                        · {PRIORIDAD_LABELS[regla.prioridad]}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleEliminar(regla.id)}
                    disabled={eliminandoId === regla.id}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    aria-label={`Eliminar regla de ${regla.ciudad}`}
                  >
                    {eliminandoId === regla.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}

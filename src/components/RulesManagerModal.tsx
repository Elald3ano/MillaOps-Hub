import { useMemo, useState } from 'react'
import { Loader2, MapPin, Plus, Trash2, UserRound } from 'lucide-react'
import { Modal } from './Modal'
import { calcularPrioridad } from '../services/assignmentEngine'
import { crearRegla, eliminarRegla } from '../services/supabaseService'
import { CIUDADES_SUGERIDAS } from '../lib/sla'
import { cn } from '../lib/utils'
import type { ReglaConTecnico, Tecnico } from '../types'
import type { ToastVariant } from './ToastContainer'

interface RulesManagerModalProps {
  abierto: boolean
  onCerrar: () => void
  reglas: ReglaConTecnico[]
  tecnicos: Tecnico[]
  onCambio: () => Promise<void>
  notificar: (mensaje: string, variant?: ToastVariant) => void
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

/** Modal para gestionar la matriz de reglas de asignación. */
export function RulesManagerModal({
  abierto,
  onCerrar,
  reglas,
  tecnicos,
  onCambio,
  notificar,
}: RulesManagerModalProps) {
  const [ciudad, setCiudad] = useState('')
  const [barrio, setBarrio] = useState('')
  const [tipoServicio, setTipoServicio] = useState('')
  const [tecnicoId, setTecnicoId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tecnicosActivos = useMemo(
    () => tecnicos.filter((t) => t.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [tecnicos],
  )

  const reglasOrdenadas = useMemo(
    () =>
      [...reglas].sort(
        (a, b) => a.prioridad - b.prioridad || a.ciudad.localeCompare(b.ciudad),
      ),
    [reglas],
  )

  const tiposExistentes = useMemo(
    () =>
      Array.from(new Set(reglas.map((r) => r.tipo_servicio).filter((t): t is string => !!t))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [reglas],
  )

  const ciudadLimpia = ciudad.trim()
  const barrioLimpio = barrio.trim() || undefined
  const tipoLimpio = tipoServicio.trim() || undefined
  const prioridad = calcularPrioridad(ciudadLimpia, barrioLimpio, tipoLimpio)

  async function handleGuardar() {
    if (!ciudadLimpia) {
      setError('La ciudad es obligatoria.')
      return
    }
    if (!tecnicoId) {
      setError('Selecciona un técnico.')
      return
    }
    setError(null)
    setGuardando(true)
    try {
      await crearRegla({
        tecnico_id: tecnicoId,
        ciudad: ciudadLimpia,
        barrio: barrioLimpio,
        tipo_servicio: tipoLimpio,
        prioridad,
      })
      setCiudad('')
      setBarrio('')
      setTipoServicio('')
      setTecnicoId('')
      await onCambio()
      notificar('Regla de asignación creada.', 'success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la regla.')
    } finally {
      setGuardando(false)
    }
  }

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

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Gestionar Matriz de Asignación"
      descripcion="Reglas fijas que asignan técnicos por ciudad, barrio y servicio."
      anchoMaximo="max-w-2xl"
    >
      <div className="space-y-6">
        {/* Listado de reglas */}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Reglas activas ({reglasOrdenadas.length})
          </p>
          {reglasOrdenadas.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
              Aún no hay reglas. Crea la primera con el formulario de abajo.
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {reglasOrdenadas.map((regla) => (
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
                      <span className="text-slate-400">· {PRIORIDAD_LABELS[regla.prioridad]}</span>
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

        {/* Formulario nueva regla */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-600 uppercase">
            <Plus className="size-3.5" /> Nueva regla
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">
                Ciudad <span className="text-red-500">*</span>
              </span>
              <input
                list="ciudades-reglas"
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
                placeholder="Ej. Pereira"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <datalist id="ciudades-reglas">
                {CIUDADES_SUGERIDAS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Barrio</span>
              <input
                value={barrio}
                onChange={(e) => setBarrio(e.target.value)}
                placeholder="Opcional"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">
                Tipo de Servicio
              </span>
              <input
                list="tipos-reglas"
                value={tipoServicio}
                onChange={(e) => setTipoServicio(e.target.value)}
                placeholder="Opcional"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <datalist id="tipos-reglas">
                {tiposExistentes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">
                Técnico <span className="text-red-500">*</span>
              </span>
              <select
                value={tecnicoId}
                onChange={(e) => setTecnicoId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                <option value="">Selecciona un técnico…</option>
                {tecnicosActivos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Vista previa de prioridad */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
                PRIORIDAD_BADGE[prioridad],
              )}
            >
              <MapPin className="size-3" /> Prioridad {prioridad}: {PRIORIDAD_LABELS[prioridad]}
            </span>
            {error && <p className="flex-1 text-right text-xs font-medium text-red-600">{error}</p>}
          </div>

          <button
            type="button"
            onClick={() => void handleGuardar()}
            disabled={guardando}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
          >
            {guardando ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Guardando…
              </>
            ) : (
              <>
                <Plus className="size-4" /> Guardar Regla
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}

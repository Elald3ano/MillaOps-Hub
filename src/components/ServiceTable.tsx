import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Inbox,
  Loader2,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import type { Servicio, Tecnico } from '../types'
import { cn } from '../lib/utils'
import {
  SLA_BADGE_CLASSES,
  coincideRangoSla,
  clasificarSla,
  type RangoSla,
} from '../lib/sla'

const ITEMS_POR_PAGINA = 50
const SIN_ASIGNAR = '__sin_asignar__'

interface ServiceTableProps {
  abiertos: Servicio[]
  cerrados: Servicio[]
  tecnicos: Tecnico[]
  onReasignar: (servicioId: string, tecnicoId: string | null) => Promise<void>
}

type Tab = 'abiertas' | 'cerradas'

interface FiltrosState {
  busqueda: string
  tecnico: string
  tipoServicio: string
  rangoSla: RangoSla
}

const FILTROS_INICIALES: FiltrosState = {
  busqueda: '',
  tecnico: 'todos',
  tipoServicio: 'todos',
  rangoSla: 'todos',
}

const RANGOS_SLA: { value: RangoSla; label: string }[] = [
  { value: 'todos', label: 'Todos los días' },
  { value: 'ok', label: '1 a 2 días' },
  { value: 'warn', label: '3 a 5 días' },
  { value: 'critical', label: '+5 días (Críticos)' },
]

function SelectFiltro({
  value,
  onChange,
  ariaLabel,
  children,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pr-8 pl-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-slate-400" />
    </div>
  )
}

function BadgeSla({ dias }: { dias: number }) {
  const nivel = clasificarSla(dias)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        SLA_BADGE_CLASSES[nivel],
        nivel === 'critical' && 'animate-pulse',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          nivel === 'ok' && 'bg-emerald-500',
          nivel === 'warn' && 'bg-amber-500',
          nivel === 'critical' && 'bg-red-500',
        )}
      />
      {dias} {dias === 1 ? 'día' : 'días'}
    </span>
  )
}

function EstadoVacio({
  icon: Icon,
  titulo,
  detalle,
}: {
  icon: typeof Inbox
  titulo: string
  detalle: string
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100">
        <Icon className="size-6 text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-700">{titulo}</p>
      <p className="mt-1 max-w-sm text-xs text-slate-500">{detalle}</p>
    </div>
  )
}

/** Tabla de servicios estilo Looker con filtros, tabs y paginación. */
export function ServiceTable({ abiertos, cerrados, tecnicos, onReasignar }: ServiceTableProps) {
  const [tab, setTab] = useState<Tab>('abiertas')
  const [filtros, setFiltros] = useState<FiltrosState>(FILTROS_INICIALES)
  const [pagina, setPagina] = useState(1)
  const [guardandoId, setGuardandoId] = useState<string | null>(null)

  const tecnicosActivos = useMemo(
    () => tecnicos.filter((t) => t.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [tecnicos],
  )

  const tecnicosPorId = useMemo(
    () => new Map(tecnicos.map((t) => [t.id, t] as const)),
    [tecnicos],
  )

  const fuente = tab === 'abiertas' ? abiertos : cerrados

  const tiposServicio = useMemo(
    () => Array.from(new Set(fuente.map((s) => s.tipo_servicio))).sort((a, b) => a.localeCompare(b)),
    [fuente],
  )

  const filtrados = useMemo(() => {
    const busqueda = filtros.busqueda.trim().toLowerCase()
    return fuente.filter((s) => {
      if (busqueda) {
        const coincide =
          s.numero_orden.toLowerCase().includes(busqueda) ||
          s.barrio.toLowerCase().includes(busqueda) ||
          (s.direccion ?? '').toLowerCase().includes(busqueda) ||
          s.tipo_servicio.toLowerCase().includes(busqueda)
        if (!coincide) return false
      }

      if (filtros.tecnico === SIN_ASIGNAR) {
        if (s.tecnico_id !== null) return false
      } else if (filtros.tecnico !== 'todos' && s.tecnico_id !== filtros.tecnico) {
        return false
      }

      if (filtros.tipoServicio !== 'todos' && s.tipo_servicio !== filtros.tipoServicio) return false

      if (!coincideRangoSla(s.dias_antiguedad, filtros.rangoSla)) return false

      return true
    })
  }, [fuente, filtros])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / ITEMS_POR_PAGINA))
  // Clamp en render: evita un efecto de sincronización si el resultado se reduce.
  const paginaActual = Math.min(pagina, totalPaginas)

  const visibles = useMemo(() => {
    const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA
    return filtrados.slice(inicio, inicio + ITEMS_POR_PAGINA)
  }, [filtrados, paginaActual])

  const hayFiltrosActivos =
    filtros.busqueda !== '' ||
    filtros.tecnico !== 'todos' ||
    filtros.tipoServicio !== 'todos' ||
    filtros.rangoSla !== 'todos'

  function actualizarFiltro<K extends keyof FiltrosState>(clave: K, valor: FiltrosState[K]) {
    setFiltros((prev) => ({ ...prev, [clave]: valor }))
    setPagina(1)
  }

  function cambiarTab(nuevoTab: Tab) {
    setTab(nuevoTab)
    setPagina(1)
  }

  async function handleCambiarTecnico(servicioId: string, valor: string) {
    const tecnicoId = valor === SIN_ASIGNAR ? null : valor
    setGuardandoId(servicioId)
    try {
      await onReasignar(servicioId, tecnicoId)
    } finally {
      setGuardandoId(null)
    }
  }

  const desde = filtrados.length === 0 ? 0 : (paginaActual - 1) * ITEMS_POR_PAGINA + 1
  const hasta = Math.min(paginaActual * ITEMS_POR_PAGINA, filtrados.length)

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 px-3 pt-3">
        {(
          [
            { id: 'abiertas', label: 'Órdenes Abiertas', count: abiertos.length, icon: Inbox },
            {
              id: 'cerradas',
              label: 'Órdenes Cerradas / Reconciliadas',
              count: cerrados.length,
              icon: CheckCircle2,
            },
          ] as const
        ).map(({ id, label, count, icon: Icon }) => {
          const activo = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => cambiarTab(id)}
              aria-selected={activo}
              role="tab"
              className={cn(
                'flex items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition',
                activo
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{id === 'abiertas' ? 'Abiertas' : 'Cerradas'}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                  activo ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600',
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Barra de control */}
      <div className="grid gap-3 border-b border-slate-200 bg-slate-50/60 p-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={filtros.busqueda}
            onChange={(e) => actualizarFiltro('busqueda', e.target.value)}
            placeholder="Buscar orden, barrio, dirección o servicio…"
            aria-label="Buscador global"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </div>

        <SelectFiltro
          ariaLabel="Filtrar por técnico"
          value={filtros.tecnico}
          onChange={(v) => actualizarFiltro('tecnico', v)}
        >
          <option value="todos">Todos los técnicos</option>
          <option value={SIN_ASIGNAR}>Sin Asignar</option>
          {tecnicosActivos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </SelectFiltro>

        <SelectFiltro
          ariaLabel="Filtrar por tipo de servicio"
          value={filtros.tipoServicio}
          onChange={(v) => actualizarFiltro('tipoServicio', v)}
        >
          <option value="todos">Todos los servicios</option>
          {tiposServicio.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </SelectFiltro>

        <SelectFiltro
          ariaLabel="Filtrar por rango de días"
          value={filtros.rangoSla}
          onChange={(v) => actualizarFiltro('rangoSla', v as RangoSla)}
        >
          {RANGOS_SLA.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </SelectFiltro>
      </div>

      {hayFiltrosActivos && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="size-3.5" />
            {filtrados.length} de {fuente.length} órdenes visibles
          </span>
          <button
            type="button"
            onClick={() => {
              setFiltros(FILTROS_INICIALES)
              setPagina(1)
            }}
            className="font-medium text-slate-700 underline-offset-2 hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-white text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">
                Orden #
              </th>
              <th scope="col" className="px-4 py-3">
                Barrio / Dirección
              </th>
              <th scope="col" className="px-4 py-3">
                Tipo de Servicio
              </th>
              <th scope="col" className="px-4 py-3">
                Antigüedad
              </th>
              <th scope="col" className="px-4 py-3">
                Técnico Asignado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((servicio) => {
              const guardando = guardandoId === servicio.id
              return (
                <tr key={servicio.id} className="transition hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                    {servicio.numero_orden}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{servicio.barrio}</p>
                    <p className="max-w-[22rem] truncate text-xs text-slate-500">
                      {servicio.direccion ?? '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {servicio.tipo_servicio}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <BadgeSla dias={servicio.dias_antiguedad} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <select
                          aria-label={`Técnico asignado a la orden ${servicio.numero_orden}`}
                          value={servicio.tecnico_id ?? SIN_ASIGNAR}
                          onChange={(e) => void handleCambiarTecnico(servicio.id, e.target.value)}
                          disabled={guardando || tab === 'cerradas'}
                          className={cn(
                            'w-44 appearance-none rounded-lg border py-1.5 pr-7 pl-2.5 text-xs font-medium shadow-sm outline-none transition focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60',
                            servicio.tecnico_id
                              ? 'border-slate-300 bg-white text-slate-800'
                              : 'border-amber-300 bg-amber-50 text-amber-800',
                          )}
                        >
                          <option value={SIN_ASIGNAR}>Sin Asignar</option>
                          {tecnicosActivos.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nombre}
                            </option>
                          ))}
                          {/* Técnico inactivo pero aún asignado: se conserva en la lista */}
                          {servicio.tecnico_id &&
                            !tecnicosActivos.some((t) => t.id === servicio.tecnico_id) && (
                              <option value={servicio.tecnico_id}>
                                {tecnicosPorId.get(servicio.tecnico_id)?.nombre ?? 'Técnico'}
                              </option>
                            )}
                        </select>
                        <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-slate-400" />
                      </div>
                      {guardando && <Loader2 className="size-3.5 animate-spin text-slate-400" />}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {visibles.length === 0 && (
          <EstadoVacio
            icon={tab === 'abiertas' ? Inbox : CheckCircle2}
            titulo={
              fuente.length === 0
                ? 'Sin datos para mostrar'
                : 'Ninguna orden coincide con los filtros'
            }
            detalle={
              fuente.length === 0
                ? 'Carga un archivo de servicios para comenzar a operar.'
                : 'Ajusta el buscador o los filtros para ver resultados.'
            }
          />
        )}
      </div>

      {/* Paginación */}
      {filtrados.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row">
          <p className="text-xs text-slate-500 tabular-nums">
            Mostrando <span className="font-semibold text-slate-700">{desde}</span>–
            <span className="font-semibold text-slate-700">{hasta}</span> de{' '}
            <span className="font-semibold text-slate-700">{filtrados.length}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPagina(Math.max(1, paginaActual - 1))}
              disabled={paginaActual <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="size-3.5" /> Anterior
            </button>
            <span className="text-xs text-slate-500 tabular-nums">
              Página {paginaActual} de {totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina(Math.min(totalPaginas, paginaActual + 1))}
              disabled={paginaActual >= totalPaginas}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

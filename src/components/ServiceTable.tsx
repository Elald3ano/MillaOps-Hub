import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  FileDown,
  Inbox,
  Loader2,
  MapPin,
  Phone,
  Search,
  SlidersHorizontal,
  User,
  Wrench,
} from 'lucide-react'
import type { Servicio, Tecnico } from '../types'
import { cn } from '../lib/utils'
import {
  SLA_BADGE_CLASSES,
  coincideRangoSla,
  clasificarSla,
  type RangoSla,
} from '../lib/sla'
import { MultiSelectFilter, type MultiSelectOpcion } from './MultiSelectFilter'

const ITEMS_POR_PAGINA = 50
const SIN_ASIGNAR = 'sin_asignar'
const TODOS = 'todos'

type ColumnaOrden =
  | 'antiguedad'
  | 'orden'
  | 'ciudad'
  | 'barrio'
  | 'cliente'
  | 'servicio'
  | 'tecnico'

interface OrdenState {
  columna: ColumnaOrden
  direccion: 'asc' | 'desc'
}

interface ServiceTableProps {
  servicios: Servicio[]
  tecnicos: Tecnico[]
  onReasignar: (servicioId: string, tecnicoId: string | null) => Promise<void>
  notificar: (mensaje: string, variant?: 'info' | 'success' | 'error') => void
  /** Notifica la ciudad filtrada para pre-llenar el exportador de PDF. */
  onCambioCiudadFiltrada?: (ciudad: string) => void
}

interface FiltrosState {
  busqueda: string
  ciudades: string[]
  tecnicos: string[]
  servicios: string[]
  rangoSla: RangoSla
}

const FILTROS_INICIALES: FiltrosState = {
  busqueda: '',
  ciudades: [],
  tecnicos: [],
  servicios: [],
  rangoSla: 'todos',
}

/** Normaliza un id de técnico para comparar sin depender de espacios/case. */
function normalizarId(valor: string | null | undefined): string {
  return (valor ?? '').trim().toLowerCase()
}

/** Coincidencia de la búsqueda global sobre los campos de una orden. */
function coincideBusqueda(s: Servicio, busqueda: string): boolean {
  if (!busqueda) return true
  return (
    s.numero_orden.toLowerCase().includes(busqueda) ||
    s.barrio.toLowerCase().includes(busqueda) ||
    (s.direccion ?? '').toLowerCase().includes(busqueda) ||
    s.tipo_servicio.toLowerCase().includes(busqueda)
  )
}

/** Coincidencia del filtro de técnicos (multi-selección, incluye "sin asignar"). */
function coincideTecnico(s: Servicio, tecnicosSeleccionados: string[]): boolean {
  if (tecnicosSeleccionados.length === 0) return true
  const idServicio = normalizarId(s.tecnico_id)
  if (tecnicosSeleccionados.includes(SIN_ASIGNAR) && idServicio === '') return true
  return idServicio !== '' && tecnicosSeleccionados.includes(idServicio)
}

const RANGOS_SLA: { value: RangoSla; label: string }[] = [
  { value: 'todos', label: 'Todos los días' },
  { value: 'ok', label: '🟢 1 día (Al día)' },
  { value: 'warn', label: '🟡 2 días (Atención)' },
  { value: 'critical', label: '🔴 3+ días (Críticos)' },
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
        'inline-block rounded-md px-2.5 py-1 text-center text-xs font-bold shadow-xs tabular-nums',
        SLA_BADGE_CLASSES[nivel],
      )}
    >
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

/** Encabezado de columna clicable para ordenamiento interactivo. */
function ThOrdenable({
  label,
  columna,
  orden,
  onOrdenar,
}: {
  label: string
  columna: ColumnaOrden
  orden: OrdenState
  onOrdenar: (columna: ColumnaOrden) => void
}) {
  const activa = orden.columna === columna
  return (
    <th
      scope="col"
      onClick={() => onOrdenar(columna)}
      className="cursor-pointer px-4 py-3 select-none transition hover:bg-slate-50"
      aria-sort={activa ? (orden.direccion === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {activa ? (
          orden.direccion === 'asc' ? (
            <ArrowUp className="size-[13px] text-slate-900" />
          ) : (
            <ArrowDown className="size-[13px] text-slate-900" />
          )
        ) : (
          <ArrowUpDown className="size-[13px] text-slate-300" />
        )}
      </span>
    </th>
  )
}

/** Tabla de servicios estilo Looker con filtros, orden y paginación. */
export function ServiceTable({
  servicios,
  tecnicos,
  onReasignar,
  notificar,
  onCambioCiudadFiltrada,
}: ServiceTableProps) {
  const [filtros, setFiltros] = useState<FiltrosState>(FILTROS_INICIALES)
  const [pagina, setPagina] = useState(1)
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [orden, setOrden] = useState<OrdenState>({
    columna: 'antiguedad',
    direccion: 'desc',
  })
  const [exportando, setExportando] = useState(false)

  const tecnicosActivos = useMemo(
    () => tecnicos.filter((t) => t.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [tecnicos],
  )

  const tecnicosPorId = useMemo(
    () => new Map(tecnicos.map((t) => [t.id, t] as const)),
    [tecnicos],
  )

  /** Nombre legible de un técnico por su id (o "Sin asignar"). */
  const nombrePorId = useMemo(
    () => new Map(tecnicos.map((t) => [normalizarId(t.id), t.nombre] as const)),
    [tecnicos],
  )

  /**
   * FILTROS EN CASCADA — cada multi-selector depende del resto:
   * · Ciudad   → depende de técnicos + servicios + búsqueda
   * · Técnico  → depende de ciudades + servicios + búsqueda
   * · Servicio → depende de ciudades + técnicos + búsqueda
   * (El SLA se aplica al final para no vaciar los selectores en cascada.)
   */

  // Base para Ciudad: todo excepto el propio filtro de ciudades.
  const baseCiudad = useMemo(
    () =>
      servicios.filter(
        (s) =>
          coincideBusqueda(s, filtros.busqueda.trim().toLowerCase()) &&
          coincideTecnico(s, filtros.tecnicos) &&
          (filtros.servicios.length === 0 || filtros.servicios.includes(s.tipo_servicio)),
      ),
    [servicios, filtros.busqueda, filtros.tecnicos, filtros.servicios],
  )

  // Base para Técnico: todo excepto el propio filtro de técnicos.
  const baseTecnico = useMemo(
    () =>
      servicios.filter(
        (s) =>
          coincideBusqueda(s, filtros.busqueda.trim().toLowerCase()) &&
          (filtros.ciudades.length === 0 || filtros.ciudades.includes(s.ciudad)) &&
          (filtros.servicios.length === 0 || filtros.servicios.includes(s.tipo_servicio)),
      ),
    [servicios, filtros.busqueda, filtros.ciudades, filtros.servicios],
  )

  // Base para Tipo de servicio: todo excepto el propio filtro de servicios.
  const baseTipo = useMemo(
    () =>
      servicios.filter(
        (s) =>
          coincideBusqueda(s, filtros.busqueda.trim().toLowerCase()) &&
          (filtros.ciudades.length === 0 || filtros.ciudades.includes(s.ciudad)) &&
          coincideTecnico(s, filtros.tecnicos),
      ),
    [servicios, filtros.busqueda, filtros.ciudades, filtros.tecnicos],
  )

  /** Ciudades disponibles con su conteo, según los demás filtros. */
  const opcionesCiudad = useMemo<MultiSelectOpcion[]>(() => {
    const conteo = new Map<string, number>()
    for (const s of baseCiudad) {
      conteo.set(s.ciudad, (conteo.get(s.ciudad) ?? 0) + 1)
    }
    return [...conteo.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ciudad, cantidad]) => ({ id: ciudad, label: ciudad, count: cantidad }))
  }, [baseCiudad])

  /** Técnicos con órdenes en el contexto actual (incluye "Sin Asignar"). */
  const opcionesTecnico = useMemo<MultiSelectOpcion[]>(() => {
    const conteo = new Map<string, number>()
    let sinAsignar = 0
    for (const s of baseTecnico) {
      const id = normalizarId(s.tecnico_id)
      if (!id) sinAsignar++
      else conteo.set(id, (conteo.get(id) ?? 0) + 1)
    }

    const lista: MultiSelectOpcion[] = []
    if (sinAsignar > 0) {
      lista.push({ id: SIN_ASIGNAR, label: 'Sin Asignar', count: sinAsignar })
    }
    for (const [id, cantidad] of conteo.entries()) {
      lista.push({ id, label: nombrePorId.get(id) ?? 'Técnico', count: cantidad })
    }
    return lista.sort((a, b) => a.label.localeCompare(b.label))
  }, [baseTecnico, nombrePorId])

  /** Tipos de servicio en la intersección ciudades × técnicos. */
  const opcionesTipo = useMemo<MultiSelectOpcion[]>(() => {
    const conteo = new Map<string, number>()
    for (const s of baseTipo) {
      conteo.set(s.tipo_servicio, (conteo.get(s.tipo_servicio) ?? 0) + 1)
    }
    return [...conteo.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([tipo, cantidad]) => ({ id: tipo, label: tipo, count: cantidad }))
  }, [baseTipo])

  const filtrados = useMemo(() => {
    const busqueda = filtros.busqueda.trim().toLowerCase()
    return servicios.filter(
      (s) =>
        coincideBusqueda(s, busqueda) &&
        (filtros.ciudades.length === 0 || filtros.ciudades.includes(s.ciudad)) &&
        coincideTecnico(s, filtros.tecnicos) &&
        (filtros.servicios.length === 0 || filtros.servicios.includes(s.tipo_servicio)) &&
        coincideRangoSla(s.dias_antiguedad, filtros.rangoSla),
    )
  }, [servicios, filtros])

  // Ordenamiento interactivo sobre el arreglo filtrado.
  const ordenados = useMemo(() => {
    const factor = orden.direccion === 'asc' ? 1 : -1
    const nombreTecnico = (s: Servicio): string =>
      s.tecnico_id ? (nombrePorId.get(normalizarId(s.tecnico_id)) ?? '') : ''

    return [...filtrados].sort((a, b) => {
      let cmp = 0
      switch (orden.columna) {
        case 'antiguedad':
          cmp = a.dias_antiguedad - b.dias_antiguedad
          break
        case 'orden':
          cmp = a.numero_orden.localeCompare(b.numero_orden, undefined, { numeric: true })
          break
        case 'ciudad':
          cmp = a.ciudad.localeCompare(b.ciudad)
          break
        case 'barrio':
          cmp = a.barrio.localeCompare(b.barrio)
          break
        case 'cliente':
          cmp = (a.nombre_cliente ?? '').localeCompare(b.nombre_cliente ?? '')
          break
        case 'servicio':
          cmp = a.tipo_servicio.localeCompare(b.tipo_servicio)
          break
        case 'tecnico':
          cmp = nombreTecnico(a).localeCompare(nombreTecnico(b))
          break
        default:
          cmp = 0
      }
      return cmp * factor
    })
  }, [filtrados, orden, nombrePorId])

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / ITEMS_POR_PAGINA))
  // Clamp en render: evita un efecto de sincronización si el resultado se reduce.
  const paginaActual = Math.min(pagina, totalPaginas)

  const visibles = useMemo(() => {
    const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA
    return ordenados.slice(inicio, inicio + ITEMS_POR_PAGINA)
  }, [ordenados, paginaActual])

  const hayFiltrosActivos =
    filtros.busqueda !== '' ||
    filtros.ciudades.length > 0 ||
    filtros.tecnicos.length > 0 ||
    filtros.servicios.length > 0 ||
    filtros.rangoSla !== 'todos'

  function actualizarFiltro<K extends keyof FiltrosState>(clave: K, valor: FiltrosState[K]) {
    setFiltros((prev) => ({ ...prev, [clave]: valor }))
    setPagina(1)
  }

  /** Actualiza el multi-selector de ciudades y sincroniza el pre-llenado del PDF. */
  function cambiarCiudades(nuevas: string[]) {
    setFiltros((prev) => ({ ...prev, ciudades: nuevas }))
    setPagina(1)
    onCambioCiudadFiltrada?.(nuevas.length === 1 ? nuevas[0] : TODOS)
  }

  /** Actualiza el multi-selector de técnicos. */
  function cambiarTecnicos(nuevos: string[]) {
    setFiltros((prev) => ({ ...prev, tecnicos: nuevos }))
    setPagina(1)
  }

  /** Actualiza el multi-selector de tipos de servicio. */
  function cambiarServicios(nuevos: string[]) {
    setFiltros((prev) => ({ ...prev, servicios: nuevos }))
    setPagina(1)
  }

  function limpiarFiltros() {
    setFiltros(FILTROS_INICIALES)
    setPagina(1)
    onCambioCiudadFiltrada?.(TODOS)
  }

  function ordenarPor(columna: ColumnaOrden) {
    setOrden((prev) => {
      if (prev.columna === columna) {
        return { columna, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }
      }
      // Columna nueva: antigüedad arranca descendente (lo crítico primero); el resto ascendente.
      return { columna, direccion: columna === 'antiguedad' ? 'desc' : 'asc' }
    })
  }

  async function exportarVista() {
    if (ordenados.length === 0) return
    setExportando(true)
    try {
      const { exportarVistaActualPdf } = await import('../services/pdfGenerator')
      const ciudadActiva = filtros.ciudades.length === 0 ? 'Todas' : filtros.ciudades.join(', ')
      const tecnicoActivo =
        filtros.tecnicos.length === 0
          ? 'Todos'
          : filtros.tecnicos
              .map((t) => (t === SIN_ASIGNAR ? 'Sin Asignar' : (nombrePorId.get(t) ?? t)))
              .join(', ')

      const doc = await exportarVistaActualPdf(ordenados, tecnicos, {
        conteo: ordenados.length,
        ciudad: ciudadActiva,
        tecnico: tecnicoActivo,
        columna: orden.columna,
        direccion: orden.direccion,
      })
      doc.save(`vista-tactica-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`)
      notificar('Vista exportada correctamente.', 'success')
    } catch (error) {
      notificar(error instanceof Error ? error.message : 'No se pudo exportar la vista.', 'error')
    } finally {
      setExportando(false)
    }
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
      {/* Barra de control */}
      <div className="grid gap-3 border-b border-slate-200 bg-slate-50/60 p-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
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

        <MultiSelectFilter
          label="Ciudad / Sucursal"
          opciones={opcionesCiudad}
          seleccionados={filtros.ciudades}
          onSeleccionChange={cambiarCiudades}
          placeholderTodos="Todas las ciudades"
          icono={MapPin}
        />

        <MultiSelectFilter
          label="Técnico Asignado"
          opciones={opcionesTecnico}
          seleccionados={filtros.tecnicos}
          onSeleccionChange={cambiarTecnicos}
          placeholderTodos="Todos los técnicos"
          icono={User}
        />

        <MultiSelectFilter
          label="Tipo de Servicio"
          opciones={opcionesTipo}
          seleccionados={filtros.servicios}
          onSeleccionChange={cambiarServicios}
          placeholderTodos="Todos los servicios"
          icono={Wrench}
        />

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

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          {hayFiltrosActivos && <SlidersHorizontal className="size-3.5" />}
          {filtrados.length} de {servicios.length} órdenes visibles
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void exportarVista()}
            disabled={exportando || ordenados.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportando ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileDown className="size-3.5" />
            )}
            Exportar esta vista
          </button>
          {hayFiltrosActivos && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="font-medium text-slate-700 underline-offset-2 hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-white text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <ThOrdenable label="Antigüedad" columna="antiguedad" orden={orden} onOrdenar={ordenarPor} />
              <ThOrdenable label="Orden #" columna="orden" orden={orden} onOrdenar={ordenarPor} />
              <ThOrdenable label="Ciudad" columna="ciudad" orden={orden} onOrdenar={ordenarPor} />
              <ThOrdenable label="Barrio / Dirección" columna="barrio" orden={orden} onOrdenar={ordenarPor} />
              <ThOrdenable label="Cliente / Contacto" columna="cliente" orden={orden} onOrdenar={ordenarPor} />
              <ThOrdenable label="Tipo de Servicio" columna="servicio" orden={orden} onOrdenar={ordenarPor} />
              <ThOrdenable label="Técnico Asignado" columna="tecnico" orden={orden} onOrdenar={ordenarPor} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((servicio) => {
              const guardando = guardandoId === servicio.id
              return (
                <tr key={servicio.id} className="transition hover:bg-slate-50/80">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <BadgeSla dias={servicio.dias_antiguedad} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                    {servicio.numero_orden}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap text-slate-700">
                    {servicio.ciudad}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{servicio.barrio}</p>
                    <p className="max-w-[20rem] truncate text-xs text-slate-500">
                      {servicio.direccion ?? '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[16rem] space-y-0.5">
                      <p className="truncate text-xs font-semibold tracking-wide text-slate-800 uppercase">
                        {servicio.nombre_cliente || 'SIN NOMBRE'}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-slate-600">
                        <Phone className="size-3 shrink-0 text-slate-400" />
                        {servicio.telefono_cliente || 'S/T'}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        Ref: {servicio.referencia_pago || 'S/R'}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {servicio.tipo_servicio}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <select
                          aria-label={`Técnico asignado a la orden ${servicio.numero_orden}`}
                          value={servicio.tecnico_id ?? SIN_ASIGNAR}
                          onChange={(e) => void handleCambiarTecnico(servicio.id, e.target.value)}
                          disabled={guardando}
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
                            !tecnicosActivos.some(
                              (t) => normalizarId(t.id) === normalizarId(servicio.tecnico_id),
                            ) && (
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
            icon={Inbox}
            titulo={
              servicios.length === 0
                ? 'Sin datos para mostrar'
                : 'Ninguna orden coincide con los filtros'
            }
            detalle={
              servicios.length === 0
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

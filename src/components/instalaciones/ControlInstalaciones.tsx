import { useCallback, useMemo, useState } from 'react'
import {
  Building2,
  ClipboardList,
  Copy,
  MessageCircle,
  PackageSearch,
  PencilLine,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import type {
  EntradaNovedadInstalacion,
  NovedadInstalacion,
  ReglaConTecnico,
  ServicioNuevo,
  Tecnico,
  TipoNovedadInstalacion,
} from '../../types'
import type { ToastVariant } from '../ToastContainer'
import { limpiarBarrio, limpiarTexto } from '../../lib/normalizer'
import { clasificarSla, SLA_BADGE_CLASSES } from '../../lib/sla'
import { cn } from '../../lib/utils'
import { ModalNovedad } from './ModalNovedad'
import {
  componerMensajeWhatsApp,
  enlaceWhatsApp,
  etiquetaDeTipo,
  presentacionDeEstado,
  TIPOS_NOVEDAD_UI,
  textoBadgeNovedad,
} from './catalogoNovedades'

/** Filtro táctico del panel de balance. */
type FiltroNovedad = 'todas' | 'con_novedad' | 'en_gestion' | 'listas'

interface ControlInstalacionesProps {
  /** Órdenes de instalación del último reporte Sigma (solo memoria). */
  servicios: ServicioNuevo[]
  /** Novedades persistidas, indexadas por número de orden. */
  novedades: Map<string, NovedadInstalacion>
  reglas: ReglaConTecnico[]
  tecnicos: Tecnico[]
  /** Persiste la novedad en Supabase y refresca el mapa en App. */
  onGuardarNovedad: (entrada: EntradaNovedadInstalacion) => Promise<void>
  /** Elimina la novedad en Supabase y refresca el mapa en App. */
  onEliminarNovedad: (ordenId: string) => Promise<void>
  /** Sube un reporte Sigma (mismo intake del Centro de Mando). */
  onProcesarReporte: (file: File, ciudadFiltro?: string) => Promise<boolean>
  procesando: boolean
  notificar: (mensaje: string, variant?: ToastVariant) => void
}

/** Clave (ciudad canónica, barrio canónico) → operador / patrulla dueño del barrio. */
interface DuenoBarrio {
  operador?: Tecnico
  patrulla?: Tecnico
}

/** Fila del tablero: la orden de instalación + su novedad y su dueño territorial. */
interface FilaInstalacion {
  servicio: ServicioNuevo
  novedad?: NovedadInstalacion
  dueno: DuenoBarrio
  /** Texto normalizado para el buscador rápido. */
  indiceBusqueda: string
}

const FILTROS: readonly { id: FiltroNovedad; icono: string; etiqueta: string }[] = [
  { id: 'todas', icono: '📋', etiqueta: 'Todas' },
  { id: 'con_novedad', icono: '🔴', etiqueta: 'Con Novedad' },
  { id: 'en_gestion', icono: '🟡', etiqueta: 'En Gestión' },
  { id: 'listas', icono: '🟢', etiqueta: 'Sin Novedad / Listas' },
]

/** Nombre corto del técnico para el mensaje de WhatsApp (nombre y primer apellido). */
function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  return partes.slice(0, 2).join(' ')
}

/**
 * Tablero de Control de Instalaciones y Puertos.
 *
 * Espejo del Centro de Mando para las órdenes de la categoría
 * "Instalaciones y Traslados": las órdenes viven en memoria (nunca se
 * persisten en `servicios`) y solo la novedad se guarda en Supabase.
 */
export function ControlInstalaciones({
  servicios,
  novedades,
  reglas,
  tecnicos,
  onGuardarNovedad,
  onEliminarNovedad,
  onProcesarReporte,
  procesando,
  notificar,
}: ControlInstalacionesProps) {
  const [filtro, setFiltro] = useState<FiltroNovedad>('todas')
  const [tipoDestacado, setTipoDestacado] = useState<TipoNovedadInstalacion | null>(null)
  const [ciudadFiltro, setCiudadFiltro] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [ordenEnEdicion, setOrdenEnEdicion] = useState<string | null>(null)

  const tecnicoPorId = useMemo(() => new Map(tecnicos.map((t) => [t.id, t])), [tecnicos])

  /**
   * Dueño territorial por barrio: reglas P2 (prioridad 2, sin tipo de
   * servicio) = operador titular; si no hay, la P1 del barrio; la patrulla se
   * resuelve vía `patrulla_id` del operador.
   */
  const duenosPorBarrio = useMemo(() => {
    const operadorPorClave = new Map<string, string>()
    const patrullaPorClave = new Map<string, string>()

    const registrar = (clave: string, regla: ReglaConTecnico) => {
      if (!patrullaPorClave.has(clave) && regla.tecnico.patrulla_id) {
        patrullaPorClave.set(clave, regla.tecnico.patrulla_id)
      }
    }

    // P2 primero: el carro es el dueño general del barrio.
    for (const regla of reglas) {
      if (regla.prioridad !== 2 || !regla.barrio) continue
      const clave = `${limpiarTexto(regla.ciudad)}|${limpiarBarrio(regla.barrio)}`
      if (!operadorPorClave.has(clave)) operadorPorClave.set(clave, regla.tecnico_id)
      registrar(clave, regla)
    }
    // P1 después: solo rellena barrios sin regla general.
    for (const regla of reglas) {
      if (regla.prioridad !== 1 || !regla.barrio) continue
      const clave = `${limpiarTexto(regla.ciudad)}|${limpiarBarrio(regla.barrio)}`
      if (!operadorPorClave.has(clave)) operadorPorClave.set(clave, regla.tecnico_id)
      registrar(clave, regla)
    }

    const mapa = new Map<string, DuenoBarrio>()
    for (const [clave, tecnicoId] of operadorPorClave) {
      const operador = tecnicoPorId.get(tecnicoId)
      const patrullaId = operador?.patrulla_id ?? patrullaPorClave.get(clave)
      mapa.set(clave, {
        operador,
        patrulla: patrullaId ? tecnicoPorId.get(patrullaId) : undefined,
      })
    }
    return mapa
  }, [reglas, tecnicoPorId])

  const filas = useMemo<FilaInstalacion[]>(() => {
    return servicios.map((servicio) => {
      // Las órdenes pueden repetirse si el reporte trae la misma orden en dos
      // filas: solo cuenta la primera para no duplicar el tablero.
      const clave = `${limpiarTexto(servicio.ciudad)}|${limpiarBarrio(servicio.barrio)}`
      const novedad = novedades.get(servicio.numero_orden)
      const dueno = duenosPorBarrio.get(clave) ?? {}
      const indiceBusqueda = limpiarTexto(
        [
          servicio.numero_orden,
          servicio.ciudad,
          servicio.barrio,
          servicio.direccion ?? '',
          servicio.nombre_cliente ?? '',
          novedad?.caja_nap ?? '',
          novedad?.comentario ?? '',
          dueno.operador?.nombre ?? '',
        ].join(' '),
      )
      return { servicio, novedad, dueno, indiceBusqueda }
    })
  }, [servicios, novedades, duenosPorBarrio])

  /** Conteo por ciudad (todos los filtros de novedad ignorados: es el universo). */
  const conteoPorCiudad = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const fila of filas) {
      mapa.set(fila.servicio.ciudad, (mapa.get(fila.servicio.ciudad) ?? 0) + 1)
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1])
  }, [filas])

  /** Conteo por estado de gestión y por tipo de novedad (universo completo). */
  const conteoNovedades = useMemo(() => {
    let conNovedad = 0
    let enGestion = 0
    const porTipo = new Map<TipoNovedadInstalacion, number>()
    for (const fila of filas) {
      if (!fila.novedad) continue
      conNovedad++
      if (fila.novedad.estado_gestion === 'en_gestion') enGestion++
      porTipo.set(fila.novedad.tipo_novedad, (porTipo.get(fila.novedad.tipo_novedad) ?? 0) + 1)
    }
    return {
      total: filas.length,
      conNovedad,
      enGestion,
      listas: filas.length - conNovedad,
      porTipo,
    }
  }, [filas])

  const filasFiltradas = useMemo(() => {
    const texto = limpiarTexto(busqueda)
    return filas.filter((fila) => {
      if (ciudadFiltro && fila.servicio.ciudad !== ciudadFiltro) return false

      switch (filtro) {
        case 'con_novedad':
          if (!fila.novedad) return false
          break
        case 'en_gestion':
          if (fila.novedad?.estado_gestion !== 'en_gestion') return false
          break
        case 'listas':
          if (fila.novedad) return false
          break
        default:
          break
      }

      if (tipoDestacado && fila.novedad?.tipo_novedad !== tipoDestacado) return false
      if (texto && !fila.indiceBusqueda.includes(texto)) return false
      return true
    })
  }, [filas, ciudadFiltro, filtro, tipoDestacado, busqueda])

  const servicioEnEdicion = useMemo(
    () => filas.find((f) => f.servicio.numero_orden === ordenEnEdicion) ?? null,
    [filas, ordenEnEdicion],
  )

  const cerrarModal = useCallback(() => setOrdenEnEdicion(null), [])

  const handleGuardar = useCallback(
    async (entrada: EntradaNovedadInstalacion) => {
      try {
        await onGuardarNovedad(entrada)
        notificar(`Novedad guardada para la orden #${entrada.orden_id}.`, 'success')
        setOrdenEnEdicion(null)
      } catch (error) {
        notificar(
          error instanceof Error ? error.message : 'No se pudo guardar la novedad.',
          'error',
        )
      }
    },
    [onGuardarNovedad, notificar],
  )

  const handleEliminar = useCallback(
    async (ordenId: string) => {
      try {
        await onEliminarNovedad(ordenId)
        notificar(`Novedad eliminada de la orden #${ordenId}.`, 'success')
        setOrdenEnEdicion(null)
      } catch (error) {
        notificar(
          error instanceof Error ? error.message : 'No se pudo eliminar la novedad.',
          'error',
        )
      }
    },
    [onEliminarNovedad, notificar],
  )

  /**
   * WhatsApp al operador de zona. Si el teléfono está registrado se abre el
   * enlace de WhatsApp; si no, se copia el mensaje para reenviarlo.
   */
  const handleWhatsApp = useCallback(
    async (fila: FilaInstalacion) => {
      const { servicio, novedad, dueno } = fila
      const mensaje = componerMensajeWhatsApp({
        operador: dueno.operador?.nombre ? nombreCorto(dueno.operador.nombre) : undefined,
        orden: servicio.numero_orden,
        barrio: servicio.barrio,
        direccion: servicio.direccion,
        tipo: novedad?.tipo_novedad ?? 'otra',
        cajaNap: novedad?.caja_nap,
        comentario: novedad?.comentario,
      })

      const enlace = enlaceWhatsApp(dueno.operador?.telefono, mensaje)
      if (enlace) {
        window.open(enlace, '_blank', 'noopener,noreferrer')
        return
      }

      try {
        await navigator.clipboard.writeText(mensaje)
        notificar(
          dueno.operador
            ? `${nombreCorto(dueno.operador.nombre)} no tiene teléfono registrado: mensaje copiado.`
            : 'Barrio sin operador asignado: mensaje copiado.',
          'info',
        )
      } catch {
        notificar('No se pudo copiar el mensaje al portapapeles.', 'error')
      }
    },
    [notificar],
  )

  const toggleTipo = (tipo: TipoNovedadInstalacion) => {
    setFiltro('con_novedad')
    setTipoDestacado((prev) => (prev === tipo ? null : tipo))
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* ---- Panel 4/12: balance y filtros ---- */}
      <aside className="space-y-4 lg:col-span-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <header className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-slate-900">
              <PackageSearch className="size-4 text-emerald-300" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Balance de instalaciones</h2>
              <p className="text-[11px] text-slate-500">
                {conteoNovedades.total} órdenes activas en {conteoPorCiudad.length} ciudades
              </p>
            </div>
          </header>

          <div className="mb-3 grid grid-cols-3 gap-1.5">
            <Metrica etiqueta="Con novedad" valor={conteoNovedades.conNovedad} clase="text-red-600" />
            <Metrica
              etiqueta="En gestión"
              valor={conteoNovedades.enGestion}
              clase="text-amber-600"
            />
            <Metrica etiqueta="Listas" valor={conteoNovedades.listas} clase="text-emerald-600" />
          </div>

          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Por ciudad
          </p>
          {conteoPorCiudad.length === 0 ? (
            <p className="text-xs text-slate-400">Sin órdenes de instalación cargadas.</p>
          ) : (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto pr-1">
              <li>
                <button
                  type="button"
                  onClick={() => setCiudadFiltro(null)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-2 py-1 text-xs transition',
                    ciudadFiltro === null
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="size-3.5" /> Todas las ciudades
                  </span>
                  <span className="font-bold tabular-nums">{conteoNovedades.total}</span>
                </button>
              </li>
              {conteoPorCiudad.map(([ciudad, cantidad]) => (
                <li key={ciudad}>
                  <button
                    type="button"
                    onClick={() => setCiudadFiltro((prev) => (prev === ciudad ? null : ciudad))}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2 py-1 text-xs transition',
                      ciudadFiltro === ciudad
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    <span className="truncate">{ciudad}</span>
                    <span className="font-bold tabular-nums">{cantidad}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Filtro de novedades
          </p>
          <div className="space-y-1">
            {FILTROS.map((opcion) => {
              const activo = filtro === opcion.id && tipoDestacado === null
              const conteo =
                opcion.id === 'con_novedad'
                  ? conteoNovedades.conNovedad
                  : opcion.id === 'en_gestion'
                    ? conteoNovedades.enGestion
                    : opcion.id === 'listas'
                      ? conteoNovedades.listas
                      : conteoNovedades.total
              return (
                <button
                  key={opcion.id}
                  type="button"
                  onClick={() => {
                    setFiltro(opcion.id)
                    setTipoDestacado(null)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                    activo
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true">{opcion.icono}</span>
                    {opcion.etiqueta}
                  </span>
                  <span className="font-bold tabular-nums">{conteo}</span>
                </button>
              )
            })}
          </div>

          {conteoNovedades.conNovedad > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2">
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                Desglose por tipo
              </p>
              <div className="flex flex-wrap gap-1">
                {TIPOS_NOVEDAD_UI.map((tipo) => {
                  const cantidad = conteoNovedades.porTipo.get(tipo.tipo) ?? 0
                  if (cantidad === 0) return null
                  const activo = tipoDestacado === tipo.tipo
                  return (
                    <button
                      key={tipo.tipo}
                      type="button"
                      onClick={() => toggleTipo(tipo.tipo)}
                      title={tipo.descripcion}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 transition',
                        activo
                          ? 'bg-red-600 text-white ring-red-600'
                          : 'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100',
                      )}
                    >
                      <span aria-hidden="true">{tipo.icono}</span>
                      {tipo.etiqueta}
                      <span className="font-bold tabular-nums">{cantidad}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </aside>

      {/* ---- Panel 8/12: tablero de seguimiento ---- */}
      <section className="space-y-3 lg:col-span-8">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-slate-900">
                <ClipboardList className="size-4 text-emerald-300" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Tablero de seguimiento</h2>
                <p className="text-[11px] text-slate-500">
                  {filasFiltradas.length} de {filas.length} órdenes
                  {tipoDestacado ? ` · ${etiquetaDeTipo(tipoDestacado).etiqueta}` : ''}
                  {ciudadFiltro ? ` · ${ciudadFiltro}` : ''}
                </p>
              </div>
            </div>

            <label className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Cliente, orden, dirección, NAP…"
                className="w-full rounded-lg py-1.5 pr-8 pl-8 text-xs text-slate-900 ring-1 ring-slate-200 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>
          </header>

          {filas.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 px-4 py-10 text-center">
              <PackageSearch className="size-8 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  No hay instalaciones cargadas
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Sube el reporte de Sigma: las órdenes Nueva/Pendiente de
                  "Instalaciones y Traslados" aparecerán aquí sin guardarse en Supabase.
                </p>
              </div>
              <label
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800',
                  procesando && 'pointer-events-none opacity-50',
                )}
              >
                {procesando ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Subir reporte Sigma
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  disabled={procesando}
                  onChange={(e) => {
                    const archivo = e.target.files?.[0]
                    e.target.value = ''
                    if (archivo) void onProcesarReporte(archivo)
                  }}
                />
              </label>
            </div>
          ) : filasFiltradas.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
              Ninguna orden coincide con el filtro actual.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
              <div className="max-h-[640px] overflow-auto">
                <table className="w-full min-w-[940px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-900 text-[10px] tracking-wide text-slate-400 uppercase">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Días</th>
                      <th className="px-3 py-2 font-semibold">Orden #</th>
                      <th className="px-3 py-2 font-semibold">Ciudad</th>
                      <th className="px-3 py-2 font-semibold">Barrio / Dirección</th>
                      <th className="px-3 py-2 font-semibold">Cliente / Tel.</th>
                      <th className="px-3 py-2 font-semibold">Operador de Zona</th>
                      <th className="px-3 py-2 font-semibold">Novedad / Seguimiento</th>
                      <th className="px-3 py-2 font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filasFiltradas.map((fila) => {
                      const { servicio, novedad, dueno } = fila
                      const sla = clasificarSla(servicio.dias_antiguedad)
                      return (
                        <tr key={servicio.numero_orden} className="align-top hover:bg-slate-50">
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span
                              className={cn(
                                'inline-flex min-w-6 justify-center rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                                SLA_BADGE_CLASSES[sla],
                              )}
                            >
                              {servicio.dias_antiguedad}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] font-semibold whitespace-nowrap text-slate-700">
                            {servicio.numero_orden}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{servicio.ciudad}</td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">{servicio.barrio}</p>
                            {servicio.direccion && (
                              <p className="text-[11px] text-slate-500">{servicio.direccion}</p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-slate-800">
                              {servicio.nombre_cliente ?? '—'}
                            </p>
                            {servicio.telefono_cliente && (
                              <p className="text-[11px] text-slate-500">
                                Tel: {servicio.telefono_cliente}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {dueno.operador ? (
                              <>
                                <p className="font-medium text-slate-800">
                                  {dueno.operador.nombre}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {dueno.operador.rol === 'operador'
                                    ? 'Operador de Zona'
                                    : 'Dueño del barrio'}
                                  {dueno.patrulla ? ` · Patrulla: ${nombreCorto(dueno.patrulla.nombre)}` : ''}
                                </p>
                              </>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                                Barrio sin dueño
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {novedad ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
                                  {textoBadgeNovedad(novedad)}
                                </span>
                                <p>
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1',
                                      presentacionDeEstado(novedad.estado_gestion).texto,
                                    )}
                                  >
                                    {presentacionDeEstado(novedad.estado_gestion).icono}{' '}
                                    {presentacionDeEstado(novedad.estado_gestion).etiqueta}
                                  </span>
                                </p>
                                {novedad.comentario && (
                                  <p className="line-clamp-2 text-[11px] text-slate-500">
                                    {novedad.comentario}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                🟢 Sin novedad
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                onClick={() => setOrdenEnEdicion(servicio.numero_orden)}
                                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-white transition hover:bg-slate-800"
                              >
                                <PencilLine className="size-3" />
                                {novedad ? 'Editar' : '📝 Gestionar Novedad'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleWhatsApp(fila)}
                                disabled={!dueno.operador}
                                title={
                                  dueno.operador?.telefono
                                    ? `WhatsApp a ${dueno.operador.nombre}`
                                    : 'Copiar mensaje para el operador'
                                }
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {dueno.operador?.telefono ? (
                                  <MessageCircle className="size-3" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                                WhatsApp
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      <ModalNovedad
        key={ordenEnEdicion ?? 'sin-seleccion'}
        servicio={servicioEnEdicion?.servicio ?? null}
        novedadActual={servicioEnEdicion?.novedad}
        onCerrar={cerrarModal}
        onGuardar={handleGuardar}
        onEliminar={handleEliminar}
      />
    </div>
  )
}

/** Tarjeta compacta de métrica del panel de balance. */
function Metrica({
  etiqueta,
  valor,
  clase,
}: {
  etiqueta: string
  valor: number
  clase: string
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200">
      <p className={cn('text-lg leading-tight font-bold tabular-nums', clase)}>{valor}</p>
      <p className="text-[10px] font-medium text-slate-500">{etiqueta}</p>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Search, Tags } from 'lucide-react'
import { limpiarTexto } from '../../lib/normalizer'
import { cn } from '../../lib/utils'
import type { CategoriaConServicios } from '../../types'
import type { ToastVariant } from '../ToastContainer'

interface CategorizacionServiciosProps {
  categorias: CategoriaConServicios[]
  /** Tipos de servicio detectados en el despacho activo que NO tienen categoría. */
  sinClasificar: string[]
  onReasignar: (tipoSolicitud: string, categoriaId: string) => Promise<void>
  notificar: (mensaje: string, variant?: ToastVariant) => void
}

/**
 * Clasificador de intake: muestra las categorías con sus tipos de servicio y
 * permite mover un tipo de categoría con un `<select>`. Los tipos sin mapeo no
 * aparecen en ninguna tarjeta (fail-open) y se listan en la alerta ámbar.
 */
export function CategorizacionServicios({
  categorias,
  sinClasificar,
  onReasignar,
  notificar,
}: CategorizacionServiciosProps) {
  const [busqueda, setBusqueda] = useState('')
  // Tipos con una reasignación en vuelo (se deshabilita su selector).
  const [actualizando, setActualizando] = useState<Set<string>>(new Set<string>())

  const totalTipos = useMemo(
    () => categorias.reduce((total, categoria) => total + categoria.tipos_servicio.length, 0),
    [categorias],
  )

  const totalDespacho = useMemo(
    () =>
      categorias
        .filter((categoria) => categoria.activo_despacho)
        .reduce((total, categoria) => total + categoria.tipos_servicio.length, 0),
    [categorias],
  )

  const categoriasFiltradas = useMemo(() => {
    const q = limpiarTexto(busqueda)
    if (!q) return categorias
    return categorias.map((categoria) => ({
      ...categoria,
      tipos_servicio: categoria.tipos_servicio.filter((mapeo) =>
        limpiarTexto(mapeo.tipo_solicitud).includes(q),
      ),
    }))
  }, [busqueda, categorias])

  async function moverTipo(tipo: string, categoriaId: string) {
    if (!categoriaId) {
      notificar('Selecciona una categoría de destino.', 'error')
      return
    }
    setActualizando((prev) => {
      const siguiente = new Set(prev)
      siguiente.add(tipo)
      return siguiente
    })
    try {
      await onReasignar(tipo, categoriaId)
    } catch {
      // El padre (App) ya notifica el error de persistencia al usuario.
    } finally {
      setActualizando((prev) => {
        const siguiente = new Set(prev)
        siguiente.delete(tipo)
        return siguiente
      })
    }
  }

  return (
    <section className="space-y-4">
      {/* Header + buscador */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-slate-900 px-4 py-4 shadow-xl shadow-slate-900/20 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-emerald-300 ring-1 ring-slate-700">
            <Tags className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-100">Categorías de Servicios</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {categorias.length} categorías · {totalTipos} tipos mapeados ·{' '}
              <span className="font-semibold text-emerald-300">{totalDespacho}</span> en despacho
            </p>
          </div>
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar tipo de servicio…"
            aria-label="Buscar tipo de servicio"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pr-3 pl-9 text-sm text-slate-100 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-slate-500 focus:ring-2 focus:ring-slate-700"
          />
        </div>
      </div>

      {/* Alerta de fail-open */}
      {sinClasificar.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-200">
                {sinClasificar.length}{' '}
                {sinClasificar.length === 1
                  ? 'tipo de servicio sin categoría'
                  : 'tipos de servicio sin categoría'}{' '}
                (entran al despacho por fail-open)
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sinClasificar.map((tipo) => (
                  <span
                    key={tipo}
                    className="inline-flex max-w-full items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-100 ring-1 ring-amber-500/30"
                    title={tipo}
                  >
                    <span className="truncate">{tipo}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tarjetas por categoría */}
      {categorias.length === 0 ? (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900 px-5 py-16 text-center">
          <p className="text-sm font-medium text-slate-300">No hay categorías configuradas</p>
          <p className="mt-1 text-xs text-slate-500">
            Ejecuta la migración de categorización para sembrar las categorías base.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {categoriasFiltradas.map((categoria) => {
            const otras = categorias.filter((otra) => otra.id !== categoria.id)
            return (
              <article
                key={categoria.id}
                className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-xl shadow-slate-900/20"
              >
                {/* Header de la categoría */}
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-700/60 px-4 py-3">
                  <span
                    className="size-3 shrink-0 rounded-sm ring-1 ring-white/20"
                    style={{ backgroundColor: categoria.color }}
                    aria-hidden="true"
                  />
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">
                    {categoria.nombre}
                  </h3>
                  <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300 ring-1 ring-slate-700">
                    {categoria.tipos_servicio.length}{' '}
                    {categoria.tipos_servicio.length === 1 ? 'tipo' : 'tipos'}
                  </span>
                  {categoria.activo_despacho && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                      ● Activo en Centro de Mando
                    </span>
                  )}
                </div>

                {/* Tipos de servicio */}
                <div className="max-h-72 space-y-1.5 overflow-y-auto px-3 py-3">
                  {categoria.tipos_servicio.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-slate-500">
                      {limpiarTexto(busqueda)
                        ? 'Sin coincidencias en esta categoría.'
                        : 'Sin tipos de servicio asignados.'}
                    </p>
                  ) : (
                    categoria.tipos_servicio.map((mapeo) => {
                      const enVuelo = actualizando.has(mapeo.tipo_solicitud)
                      return (
                        <div
                          key={mapeo.tipo_solicitud}
                          className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/50 px-2.5 py-1.5"
                        >
                          <span
                            className="min-w-0 flex-1 truncate text-xs text-slate-200"
                            title={mapeo.tipo_solicitud}
                          >
                            {mapeo.tipo_solicitud}
                          </span>
                          {enVuelo && (
                            <Loader2 className="size-3.5 shrink-0 animate-spin text-slate-400" />
                          )}
                          <select
                            value=""
                            disabled={enVuelo || otras.length === 0}
                            onChange={(event) => void moverTipo(mapeo.tipo_solicitud, event.target.value)}
                            aria-label={`Mover "${mapeo.tipo_solicitud}" a otra categoría`}
                            className={cn(
                              'shrink-0 rounded-md border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] text-slate-300 outline-none transition',
                              'focus:border-slate-500 focus:ring-2 focus:ring-slate-700',
                              'disabled:cursor-not-allowed disabled:opacity-50',
                            )}
                          >
                            <option value="">Mover a…</option>
                            {otras.map((otra) => (
                              <option key={otra.id} value={otra.id}>
                                {otra.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    })
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

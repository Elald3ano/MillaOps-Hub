import { useMemo, useState } from 'react'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  MapPin,
  Trophy,
  Users,
} from 'lucide-react'
import type { Servicio } from '../../types'
import type { MetricaTecnicoCierre } from '../../services/reconciliationService'
import { esServicioLiviano } from '../../lib/tiposServicio'
import { limpiarTexto } from '../../lib/normalizer'
import { ciudadCanonica } from '../../lib/zonasPermitidas'
import { cn } from '../../lib/utils'
import { BarraProgreso, TarjetaAnalitica } from '../analitica/TarjetaAnalitica'

type ModoVista = 'sucursales' | 'tecnicos'

interface RankingCierresProps {
  metricas: MetricaTecnicoCierre[]
  cerrados: Servicio[]
  tecnicoSeleccionadoId: string | null
  onSeleccionarTecnico: (id: string) => void
}

interface TecnicoEnCiudad {
  tecnicoId: string
  nombre: string
  cerradas: number
  livianas: number
  pesadas: number
}

interface CiudadCierres {
  clave: string
  ciudad: string
  total: number
  tecnicos: TecnicoEnCiudad[]
}

/** Ranking de cierres con doble vista: por técnico (plana) o por sucursal (acordeón). */
export function RankingCierres({
  metricas,
  cerrados,
  tecnicoSeleccionadoId,
  onSeleccionarTecnico,
}: RankingCierresProps) {
  const [modoVista, setModoVista] = useState<ModoVista>('tecnicos')

  const nombrePorId = useMemo(
    () => new Map(metricas.map((m) => [m.tecnicoId, m.nombre] as const)),
    [metricas],
  )

  const activos = useMemo(() => metricas.filter((m) => m.cerradas > 0), [metricas])
  const maxCerradas = Math.max(1, ...activos.map((m) => m.cerradas))

  // Agrupación por ciudad (vista "sucursales"), Invariante #1 (limpiarTexto).
  const porCiudad = useMemo<CiudadCierres[]>(() => {
    const mapa = new Map<string, { ciudad: string; total: number; porTecnico: Map<string, TecnicoEnCiudad> }>()
    for (const s of cerrados) {
      if (!s.tecnico_id) continue
      const canonica = ciudadCanonica(s.ciudad) || s.ciudad
      const clave = limpiarTexto(canonica)
      let c = mapa.get(clave)
      if (!c) {
        c = { ciudad: canonica, total: 0, porTecnico: new Map() }
        mapa.set(clave, c)
      }
      c.total += 1
      const prev = c.porTecnico.get(s.tecnico_id) ?? {
        tecnicoId: s.tecnico_id,
        nombre: nombrePorId.get(s.tecnico_id) ?? 'Técnico',
        cerradas: 0,
        livianas: 0,
        pesadas: 0,
      }
      prev.cerradas += 1
      if (esServicioLiviano(s.tipo_servicio)) prev.livianas += 1
      else prev.pesadas += 1
      c.porTecnico.set(s.tecnico_id, prev)
    }
    return [...mapa.values()]
      .map((c) => ({
        clave: limpiarTexto(c.ciudad),
        ciudad: c.ciudad,
        total: c.total,
        tecnicos: [...c.porTecnico.values()].sort((a, b) => b.cerradas - a.cerradas),
      }))
      .sort((a, b) => b.total - a.total)
  }, [cerrados, nombrePorId])

  const [sucursalExpandida, setSucursalExpandida] = useState<string | null>(
    () => porCiudad[0]?.clave ?? null,
  )

  function toggleSucursal(clave: string) {
    setSucursalExpandida((prev) => (prev === clave ? null : clave))
  }

  return (
    <TarjetaAnalitica
      icon={Trophy}
      titulo="Ranking de Cierres"
      subtitulo={
        modoVista === 'tecnicos'
          ? `${activos.length} técnicos con cierres`
          : `${porCiudad.length} sucursales con cierres`
      }
      accion={
        <div className="flex shrink-0 gap-1 rounded-lg bg-white/5 p-1 ring-1 ring-white/10">
          <button
            type="button"
            onClick={() => setModoVista('tecnicos')}
            aria-pressed={modoVista === 'tecnicos'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
              modoVista === 'tecnicos'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200',
            )}
          >
            <Users className="size-3.5" /> Ranking Técnicos
          </button>
          <button
            type="button"
            onClick={() => setModoVista('sucursales')}
            aria-pressed={modoVista === 'sucursales'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
              modoVista === 'sucursales'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200',
            )}
          >
            <Building2 className="size-3.5" /> Por Sucursal
          </button>
        </div>
      }
    >
      {modoVista === 'tecnicos' ? (
        /* ---- Vista plana por técnico ---- */
        activos.length === 0 ? (
          <p className="text-xs text-slate-400">Sin cierres registrados entre los cortes.</p>
        ) : (
          <ul className="space-y-1.5">
            {activos.map((m) => {
              const seleccionado = tecnicoSeleccionadoId === m.tecnicoId
              return (
                <li key={m.tecnicoId}>
                  <button
                    type="button"
                    onClick={() => onSeleccionarTecnico(m.tecnicoId)}
                    aria-pressed={seleccionado}
                    className={cn(
                      'w-full rounded-xl px-3 py-2 text-left transition-all',
                      seleccionado
                        ? 'bg-cyan-500/10 ring-2 ring-cyan-400/70'
                        : 'cursor-pointer hover:bg-slate-800/60',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-200">
                        {m.nombre}
                      </span>
                      <span className="text-sm font-bold text-emerald-300 tabular-nums">
                        {m.cerradas}
                      </span>
                    </div>
                    <BarraProgreso
                      valor={m.cerradas / maxCerradas}
                      color="bg-emerald-500"
                      className="mb-1"
                    />
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <MapPin className="size-3 shrink-0 text-cyan-400" />
                      <span className="truncate">
                        {m.ciudades.join(', ') || 'Sin ciudad'} · {m.livianas} livianas ·{' '}
                        {m.pesadas} pesadas
                      </span>
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        )
      ) : (
        /* ---- Vista acordeón por sucursal ---- */
        porCiudad.length === 0 ? (
          <p className="text-xs text-slate-400">Sin cierres registrados entre los cortes.</p>
        ) : (
          <ul className="space-y-1.5">
            {porCiudad.map((c) => {
              const expandida = sucursalExpandida === c.clave
              return (
                <li
                  key={c.clave}
                  className="overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10"
                >
                  <button
                    type="button"
                    onClick={() => toggleSucursal(c.clave)}
                    aria-expanded={expandida}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-white/5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {expandida ? (
                        <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
                      )}
                      <Building2 className="size-3.5 shrink-0 text-cyan-300" />
                      <span className="truncate text-sm font-medium text-slate-100">
                        {c.ciudad}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-slate-200 ring-1 ring-white/15 tabular-nums">
                      {c.total}
                    </span>
                  </button>

                  {expandida && (
                    <div className="border-t border-white/10 p-2">
                      <ul className="space-y-1">
                        {c.tecnicos.map((t) => {
                          const seleccionado = tecnicoSeleccionadoId === t.tecnicoId
                          return (
                            <li key={t.tecnicoId}>
                              <button
                                type="button"
                                onClick={() => onSeleccionarTecnico(t.tecnicoId)}
                                aria-pressed={seleccionado}
                                className={cn(
                                  'w-full rounded-lg px-2.5 py-2 text-left transition-all',
                                  seleccionado
                                    ? 'bg-cyan-500/10 ring-2 ring-cyan-400/70'
                                    : 'cursor-pointer hover:bg-slate-800/60',
                                )}
                              >
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <span className="truncate text-sm font-medium text-slate-200">
                                    {t.nombre}
                                  </span>
                                  <span className="text-sm font-bold text-emerald-300 tabular-nums">
                                    {t.cerradas}
                                  </span>
                                </div>
                                <BarraProgreso
                                  valor={t.cerradas / maxCerradas}
                                  color="bg-emerald-500"
                                  className="mb-1"
                                />
                                <p className="text-[11px] text-slate-400">
                                  {t.livianas} livianas · {t.pesadas} pesadas
                                </p>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )
      )}
    </TarjetaAnalitica>
  )
}

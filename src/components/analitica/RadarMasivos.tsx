import { useMemo } from 'react'
import { Flame } from 'lucide-react'
import type { Servicio } from '../../types'
import { esSinSenal } from '../../lib/tiposServicio'
import { limpiarTexto } from '../../lib/normalizer'
import { cn } from '../../lib/utils'
import { BarraProgreso, TarjetaAnalitica } from './TarjetaAnalitica'

// Un barrio con >= 5 clientes "Sin Señal" se considera falla de troncal/nodo.
const UMBRAL_MASIVO = 5

interface PuntoCaliente {
  barrio: string
  ciudad: string
  total: number
  sinSenal: number
}

/** Radar de puntos calientes (Top 8 barrios) y alerta de daño masivo. */
export function RadarMasivos({ servicios }: { servicios: Servicio[] }) {
  const top = useMemo(() => {
    const porBarrio = new Map<string, PuntoCaliente>()
    for (const s of servicios) {
      const barrio = s.barrio || 'Sin barrio'
      const ciudad = s.ciudad || 'Sin ciudad'
      const clave = `${limpiarTexto(ciudad)}|${limpiarTexto(barrio)}`
      const prev = porBarrio.get(clave) ?? { barrio, ciudad, total: 0, sinSenal: 0 }
      prev.total += 1
      if (esSinSenal(s.tipo_servicio)) prev.sinSenal += 1
      porBarrio.set(clave, prev)
    }
    return [...porBarrio.values()].sort((a, b) => b.total - a.total).slice(0, 8)
  }, [servicios])

  const maxTotal = Math.max(1, ...top.map((p) => p.total))

  return (
    <TarjetaAnalitica
      icon={Flame}
      titulo="Radar de Puntos Calientes"
      subtitulo="Top 8 barrios con más daños · falla de troncal / nodo"
    >
      {top.length === 0 ? (
        <p className="text-xs text-slate-400">Sin datos para este ámbito.</p>
      ) : (
        <ul className="space-y-3">
          {top.map((p, i) => {
            const masivo = p.sinSenal >= UMBRAL_MASIVO
            return (
              <li
                key={`${p.ciudad}|${p.barrio}`}
                className={cn(
                  masivo &&
                    'rounded-xl border border-red-500/50 bg-red-500/10 p-2.5 ring-1 ring-red-500/40',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-white/10 text-[10px] font-bold text-slate-300 tabular-nums">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">{p.barrio}</p>
                      <p className="truncate text-[11px] text-slate-500">{p.ciudad}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-slate-200 tabular-nums">{p.total}</span>
                </div>
                <BarraProgreso
                  valor={p.total / maxTotal}
                  color={masivo ? 'bg-red-500' : 'bg-orange-400'}
                  className="mt-2"
                />
                {masivo && (
                  <p className="mt-2 animate-pulse text-xs font-semibold text-red-300">
                    🚨 Alerta de Daño Masivo: {p.sinSenal} clientes sin señal en {p.barrio}. Revisar
                    troncal / nodo.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </TarjetaAnalitica>
  )
}

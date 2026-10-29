import { useMemo } from 'react'
import { AlertTriangle, ShieldCheck, TrendingUp } from 'lucide-react'
import type { Servicio } from '../../types'
import type { MetricaTecnicoCierre } from '../../services/reconciliationService'
import { esGarantia } from '../../lib/tiposServicio'
import { esCritica } from '../../lib/sla'
import { TarjetaAnalitica } from '../analitica/TarjetaAnalitica'

interface AlertasRendimientoProps {
  metricas: MetricaTecnicoCierre[]
  cerrados: Servicio[]
}

/** Radar de rendimiento: técnicos inactivos, rescate crítico y estabilización. */
export function AlertasRendimiento({ metricas, cerrados }: AlertasRendimientoProps) {
  const inactivos = useMemo(() => metricas.filter((m) => m.cerradas === 0), [metricas])
  const rescateCritico = useMemo(
    () => cerrados.filter((s) => esCritica(s.dias_antiguedad)).length,
    [cerrados],
  )
  const estabilizados = useMemo(
    () =>
      cerrados.filter((s) => esGarantia(s.tipo_servicio) && s.dias_antiguedad < 15).length,
    [cerrados],
  )

  return (
    <TarjetaAnalitica
      icon={AlertTriangle}
      titulo="Radar de Rendimiento y Estabilización"
      subtitulo="Inactividad, rescate crítico y post-venta"
    >
      {/* Métricas destacadas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="size-3.5 text-red-300" />
            <p className="text-[11px] text-slate-400">Rescate crítico</p>
          </div>
          <p className="mt-1 text-2xl font-black text-white tabular-nums">{rescateCritico}</p>
          <p className="text-[10px] text-slate-500">Órdenes ≥3 días resueltas</p>
        </div>
        <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-300" />
            <p className="text-[11px] text-slate-400">Estabilizados</p>
          </div>
          <p className="mt-1 text-2xl font-black text-white tabular-nums">{estabilizados}</p>
          <p className="text-[10px] text-slate-500">Garantías &lt;15d cerradas</p>
        </div>
      </div>

      {/* Técnicos inactivos */}
      <div className="mt-3 border-t border-white/10 pt-3">
        <p className="text-xs font-semibold text-slate-300">
          Técnicos inactivos (0 cierres)
        </p>
        {inactivos.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            Todos los técnicos con órdenes ayer registraron cierres hoy.
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {inactivos.map((m) => (
              <li
                key={m.tecnicoId}
                className="rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] text-red-200 ring-1 ring-red-500/30"
              >
                {m.nombre}
              </li>
            ))}
          </ul>
        )}
      </div>
    </TarjetaAnalitica>
  )
}
